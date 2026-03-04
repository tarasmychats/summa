import { logger } from "../logger.js";
import {
  getBackfillStatus,
  upsertBackfillStatus,
} from "../repositories/backfillStatus.js";
import {
  insertDailyPrices,
  DailyPriceInput,
} from "../repositories/dailyPrices.js";
import {
  fetchCryptoHistory,
  rateLimitDelay as cryptoRateLimit,
} from "./cryptoHistory.js";
import {
  fetchStockHistory,
  rateLimitDelay as stockRateLimit,
} from "./stockHistory.js";
import {
  fetchFiatHistory,
  rateLimitDelay as fiatRateLimit,
} from "./fiatHistory.js";

/** Maximum days for CoinGecko free tier */
const CRYPTO_MAX_DAYS = 365;
/** Years of history for stocks */
const STOCK_YEARS = 5;
/** Years of history for fiat */
const FIAT_YEARS = 5;

/**
 * Backfills historical price data for a single asset.
 * - Checks backfill_status to determine if/what to fetch
 * - New asset: full history fetch
 * - Already backfilled today: skip
 * - Partial backfill: fill gap from last update to today
 */
export async function backfillAsset(
  assetId: string,
  category: string
): Promise<void> {
  const status = await getBackfillStatus(assetId, category);
  const today = new Date().toISOString().split("T")[0];

  if (status) {
    const lastUpdatedDate = status.lastUpdated.toISOString().split("T")[0];
    if (lastUpdatedDate === today) {
      logger.info("backfill skipped — already up to date", {
        assetId,
        category,
      });
      return;
    }
  }

  logger.info("starting backfill", { assetId, category, hasStatus: !!status });

  let prices: DailyPriceInput[];

  try {
    switch (category) {
      case "crypto":
        prices = await fetchAndMapCrypto(assetId);
        break;
      case "stock":
        prices = await fetchAndMapStock(assetId);
        break;
      case "fiat":
        prices = await fetchAndMapFiat(assetId);
        break;
      default:
        logger.warn("unknown category for backfill", { assetId, category });
        return;
    }
  } catch (err) {
    logger.error("backfill fetch failed", {
      assetId,
      category,
      error: String(err),
    });
    throw err;
  }

  if (prices.length === 0) {
    logger.warn("backfill fetched no prices", { assetId, category });
    return;
  }

  try {
    await insertDailyPrices(prices);
  } catch (err) {
    logger.error("backfill insert failed", {
      assetId,
      category,
      priceCount: prices.length,
      error: String(err),
    });
    throw err;
  }

  // Determine oldest date from fetched prices
  const oldestDate = new Date(
    prices.reduce((min, p) => (p.date < min ? p.date : min), prices[0].date)
  );

  await upsertBackfillStatus(assetId, category, oldestDate);

  logger.info("backfill complete", {
    assetId,
    category,
    priceCount: prices.length,
    oldestDate: oldestDate.toISOString().split("T")[0],
  });
}

async function fetchAndMapCrypto(coinId: string): Promise<DailyPriceInput[]> {
  const history = await fetchCryptoHistory(coinId, CRYPTO_MAX_DAYS);
  const usdPrices = history.map((point) => ({
    assetId: coinId,
    category: "crypto",
    date: point.date,
    priceUsd: point.price,
    priceEur: null as number | null,
  }));
  return applyEurConversion(usdPrices);
}

async function fetchAndMapStock(symbol: string): Promise<DailyPriceInput[]> {
  const history = await fetchStockHistory(symbol, STOCK_YEARS);
  const usdPrices = history.map((point) => ({
    assetId: symbol,
    category: "stock",
    date: point.date,
    priceUsd: point.price,
    priceEur: null as number | null,
  }));
  return applyEurConversion(usdPrices);
}

/**
 * Fetches USD/EUR rates from Frankfurter and computes priceEur for each price point.
 * Falls back gracefully: if EUR rates can't be fetched, prices remain with priceEur: null.
 */
async function applyEurConversion(prices: DailyPriceInput[]): Promise<DailyPriceInput[]> {
  if (prices.length === 0) return prices;

  const dates = prices.map((p) => p.date).sort();
  const from = dates[0];
  const to = dates[dates.length - 1];

  try {
    const eurRates = await fetchFiatHistory("EUR", from, to);
    if (!Array.isArray(eurRates) || eurRates.length === 0) return prices;
    // Build lookup: date -> EUR per 1 USD (eurRates gives priceUsd = 1/eurRate, so eurPerUsd = 1/priceUsd = eurRate)
    const eurRateByDate: Record<string, number> = {};
    for (const point of eurRates) {
      // priceEur for EUR is 1, priceUsd is 1/eurRate → eurPerUsd = 1/priceUsd
      eurRateByDate[point.date] = 1 / point.priceUsd;
    }

    for (const price of prices) {
      const eurRate = eurRateByDate[price.date];
      if (eurRate != null && price.priceUsd != null) {
        price.priceEur = price.priceUsd * eurRate;
      }
    }
  } catch (err) {
    logger.warn("could not fetch EUR conversion rates for backfill", {
      error: String(err),
    });
    // Prices remain with priceEur: null — EUR queries will return no data for these dates
  }

  return prices;
}

async function fetchAndMapFiat(currency: string): Promise<DailyPriceInput[]> {
  const to = new Date().toISOString().split("T")[0];
  const from = new Date();
  from.setFullYear(from.getFullYear() - FIAT_YEARS);
  const fromStr = from.toISOString().split("T")[0];

  const history = await fetchFiatHistory(currency, fromStr, to);
  return history.map((point) => ({
    assetId: currency,
    category: "fiat",
    date: point.date,
    priceUsd: point.priceUsd,
    priceEur: point.priceEur,
  }));
}

/**
 * Returns the appropriate rate limit delay function for a given category.
 */
export function getRateLimitDelay(
  category: string
): (() => Promise<void>) | null {
  switch (category) {
    case "crypto":
      return cryptoRateLimit;
    case "stock":
      return stockRateLimit;
    case "fiat":
      return fiatRateLimit;
    default:
      return null;
  }
}
