import cron from "node-cron";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { getAllAssets } from "../repositories/assets.js";
import { getBackfillStatus } from "../repositories/backfillStatus.js";
import { insertDailyPrices, DailyPriceInput } from "../repositories/dailyPrices.js";
import { upsertBackfillStatus } from "../repositories/backfillStatus.js";
import { backfillAsset, getRateLimitDelay } from "./backfill.js";
import { fetchCryptoPrices } from "./crypto.js";
import { fetchStockPrices } from "./stocks.js";
import { fetchFiatHistory } from "./fiatHistory.js";
import { normalizeCurrency } from "../currency.js";

/**
 * Runs the daily price update for all tracked assets.
 * - For assets without backfill history: triggers full backfill
 * - For assets with backfill history: fetches today's price and inserts it
 */
export async function runDailyPriceUpdate(): Promise<void> {
  logger.info("daily price update started");

  let groupedAssets: Record<string, Array<{ assetId: string; category: string }>>;
  try {
    groupedAssets = await getAllAssets();
  } catch (err) {
    logger.error("daily price update failed — could not load tracked assets", {
      error: String(err),
    });
    return;
  }

  const allAssets = Object.values(groupedAssets).flat();
  if (allAssets.length === 0) {
    logger.info("daily price update — no tracked assets, nothing to do");
    return;
  }

  logger.info("daily price update — processing assets", {
    count: allAssets.length,
  });

  // Pre-fetch EUR rate for all assets. Try today first, fall back to yesterday
  // since ECB publishes rates around 16:00 CET and this cron runs at 02:00 UTC.
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().split("T")[0];
  let eurPerUsd: number | null = null;
  try {
    const rates = await fetchFiatHistory("EUR", yesterday, today);
    if (Array.isArray(rates) && rates.length > 0) {
      // Use the most recent available rate
      eurPerUsd = 1 / rates[rates.length - 1].priceUsd;
    }
  } catch (err) {
    logger.warn("could not pre-fetch EUR rate for daily update", { error: String(err) });
  }

  let processed = 0;
  let errors = 0;

  for (const asset of allAssets) {
    try {
      const status = await getBackfillStatus(asset.assetId, asset.category);

      if (!status) {
        // New asset — trigger full backfill (which includes historical + today)
        logger.info("triggering backfill for new asset", {
          assetId: asset.assetId,
          category: asset.category,
        });
        await backfillAsset(asset.assetId, asset.category);
      } else {
        // Existing asset — fetch today's price only
        const stored = await fetchAndStoreTodayPrice(asset.assetId, asset.category, eurPerUsd);
        if (stored) {
          await upsertBackfillStatus(
            asset.assetId,
            asset.category,
            status.oldestDate
          );
        }
      }

      processed++;
    } catch (err) {
      errors++;
      logger.error("daily price update failed for asset", {
        assetId: asset.assetId,
        category: asset.category,
        error: String(err),
      });
      // Continue with other assets — don't let one failure stop the whole run
    }

    // Rate limit between calls
    const delay = getRateLimitDelay(asset.category);
    if (delay) {
      await delay();
    }
  }

  logger.info("daily price update complete", { processed, errors, total: allAssets.length });
}

/**
 * Fetches today's price for a single asset and stores it in daily_prices.
 */
async function fetchAndStoreTodayPrice(
  assetId: string,
  category: string,
  eurPerUsd: number | null = null
): Promise<boolean> {
  const today = new Date().toISOString().split("T")[0];

  let prices: DailyPriceInput[];

  switch (category) {
    case "crypto": {
      const result = await fetchCryptoPrices([assetId], "usd");
      if (result.length === 0) {
        logger.warn("no crypto price returned for today", { assetId });
        return false;
      }
      const priceUsd = result[0].price;
      prices = [
        {
          assetId,
          category: "crypto",
          date: today,
          priceUsd,
          priceEur: eurPerUsd != null ? priceUsd * eurPerUsd : null,
        },
      ];
      break;
    }
    case "stock": {
      const result = await fetchStockPrices([assetId]);
      if (result.length === 0) {
        logger.warn("no stock price returned for today", { assetId });
        return false;
      }

      // Normalize minor-unit currencies (e.g., GBp → GBP with price / 100)
      const { iso: isoCurrency, divisor } = normalizeCurrency(result[0].currency);
      const nativePrice = result[0].price / divisor;

      let priceUsd: number;
      let priceEur: number | null = null;

      if (isoCurrency === "USD") {
        priceUsd = nativePrice;
        priceEur = eurPerUsd != null ? priceUsd * eurPerUsd : null;
      } else {
        // Non-USD stock: convert native currency to USD and EUR
        try {
          const yesterday = new Date(Date.now() - 86_400_000).toISOString().split("T")[0];
          const fxRates = await fetchFiatHistory(isoCurrency, yesterday, today);
          if (fxRates.length > 0) {
            const fx = fxRates[fxRates.length - 1];
            priceUsd = nativePrice * fx.priceUsd;
            priceEur = nativePrice * fx.priceEur;
          } else {
            logger.warn("no FX rate for non-USD stock, skipping", { assetId, nativeCurrency: isoCurrency });
            return false;
          }
        } catch (err) {
          logger.warn("FX conversion failed for non-USD stock", {
            assetId,
            nativeCurrency: isoCurrency,
            error: String(err),
          });
          return false;
        }
      }

      prices = [
        {
          assetId,
          category: "stock",
          date: today,
          priceUsd,
          priceEur,
        },
      ];
      break;
    }
    case "etf": {
      const result = await fetchStockPrices([assetId]);
      if (result.length === 0) {
        logger.warn("no ETF price returned for today", { assetId });
        return false;
      }

      const { iso: isoCurrency, divisor } = normalizeCurrency(result[0].currency);
      const nativePrice = result[0].price / divisor;

      let priceUsd: number;
      let priceEur: number | null = null;

      if (isoCurrency === "USD") {
        priceUsd = nativePrice;
        priceEur = eurPerUsd != null ? priceUsd * eurPerUsd : null;
      } else {
        try {
          const yesterday = new Date(Date.now() - 86_400_000).toISOString().split("T")[0];
          const fxRates = await fetchFiatHistory(isoCurrency, yesterday, today);
          if (fxRates.length > 0) {
            const fx = fxRates[fxRates.length - 1];
            priceUsd = nativePrice * fx.priceUsd;
            priceEur = nativePrice * fx.priceEur;
          } else {
            logger.warn("no FX rate for non-USD ETF, skipping", { assetId, nativeCurrency: isoCurrency });
            return false;
          }
        } catch (err) {
          logger.warn("FX conversion failed for non-USD ETF", {
            assetId,
            nativeCurrency: isoCurrency,
            error: String(err),
          });
          return false;
        }
      }

      prices = [
        {
          assetId,
          category: "etf",
          date: today,
          priceUsd,
          priceEur,
        },
      ];
      break;
    }
    case "fiat": {
      // ECB publishes rates around 16:00 CET; at 02:00 UTC today's rate
      // won't exist yet. Fetch yesterday..today and use the most recent.
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().split("T")[0];
      const result = await fetchFiatHistory(assetId, yesterday, today);
      if (result.length === 0) {
        logger.warn("no fiat rate returned for today", { assetId });
        return false;
      }
      const latest = result[result.length - 1];
      prices = [
        {
          assetId,
          category: "fiat",
          date: today,
          priceUsd: latest.priceUsd,
          priceEur: latest.priceEur,
        },
      ];
      break;
    }
    default:
      logger.warn("unknown category in daily price update", { assetId, category });
      return false;
  }

  await insertDailyPrices(prices);
  return true;
}

/**
 * Starts the daily cron job that updates prices at 02:00 UTC.
 * Returns the cron task for testing/cleanup purposes.
 */
export function startDailyCron(): cron.ScheduledTask {
  const task = cron.schedule(
    "0 2 * * *",
    async () => {
      try {
        await runDailyPriceUpdate();
      } catch (err) {
        logger.error("daily cron job uncaught error", { error: String(err) });
      }
    },
    { timezone: "UTC" }
  );

  logger.info("daily cron job scheduled", { schedule: "0 2 * * * (UTC)" });

  if (config.runCronOnStartup) {
    logger.info("RUN_CRON_ON_STARTUP enabled — running daily price update now");
    runDailyPriceUpdate().catch((err) => {
      logger.error("startup price update failed", { error: String(err) });
    });
  }

  return task;
}
