import cron from "node-cron";
import { logger } from "../logger.js";
import { getAllTrackedAssets } from "../repositories/trackedAssets.js";
import { getBackfillStatus } from "../repositories/backfillStatus.js";
import { insertDailyPrices, DailyPriceInput } from "../repositories/dailyPrices.js";
import { upsertBackfillStatus } from "../repositories/backfillStatus.js";
import { backfillAsset, getRateLimitDelay } from "./backfill.js";
import { fetchCryptoPrices } from "./crypto.js";
import { fetchStockPrices } from "./stocks.js";
import { fetchFiatHistory } from "./fiatHistory.js";

/**
 * Runs the daily price update for all tracked assets.
 * - For assets without backfill history: triggers full backfill
 * - For assets with backfill history: fetches today's price and inserts it
 */
export async function runDailyPriceUpdate(): Promise<void> {
  logger.info("daily price update started");

  let groupedAssets: Record<string, Array<{ assetId: string; category: string }>>;
  try {
    groupedAssets = await getAllTrackedAssets();
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
        const stored = await fetchAndStoreTodayPrice(asset.assetId, asset.category);
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
  category: string
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
      prices = [
        {
          assetId,
          category: "crypto",
          date: today,
          priceUsd: result[0].price,
          priceEur: null,
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
      prices = [
        {
          assetId,
          category: "stock",
          date: today,
          priceUsd: result[0].price,
          priceEur: null,
        },
      ];
      break;
    }
    case "fiat": {
      const result = await fetchFiatHistory(assetId, today, today);
      if (result.length === 0) {
        logger.warn("no fiat rate returned for today", { assetId });
        return false;
      }
      prices = [
        {
          assetId,
          category: "fiat",
          date: today,
          priceUsd: result[0].priceUsd,
          priceEur: result[0].priceEur,
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
  return task;
}
