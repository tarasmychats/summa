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
  getStockCurrency,
  rateLimitDelay as stockRateLimit,
} from "./stockHistory.js";
import {
  fetchFiatHistory,
  rateLimitDelay as fiatRateLimit,
} from "./fiatHistory.js";
import { normalizeCurrency } from "../currency.js";

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
 * - Not yet updated today: re-fetches full history (ON CONFLICT DO UPDATE keeps data fresh)
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
    // Still update backfill_status to prevent infinite retry loops for
    // invalid/delisted assets that will never return data
    await upsertBackfillStatus(assetId, category, new Date());
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
  const [history, nativeCurrency] = await Promise.all([
    fetchStockHistory(symbol, STOCK_YEARS),
    getStockCurrency(symbol),
  ]);

  if (history.length === 0) return [];

  // Normalize minor-unit currencies (e.g., GBp → GBP with price / 100)
  const { iso: isoCurrency, divisor } = normalizeCurrency(nativeCurrency);
  const normalizedHistory = divisor === 1
    ? history
    : history.map((p) => ({ ...p, price: p.price / divisor }));

  let prices: DailyPriceInput[];

  if (isoCurrency === "USD") {
    // Stock trades in USD — prices are already in USD
    prices = normalizedHistory.map((point) => ({
      assetId: symbol,
      category: "stock",
      date: point.date,
      priceUsd: point.price,
      priceEur: null as number | null,
    }));
  } else {
    // Stock trades in a non-USD currency — convert to USD using historical FX rates
    const dates = normalizedHistory.map((p) => p.date).sort();
    const from = dates[0];
    const to = dates[dates.length - 1];

    let fxRates: Awaited<ReturnType<typeof fetchFiatHistory>>;
    try {
      fxRates = await fetchFiatHistory(isoCurrency, from, to);
    } catch (err) {
      logger.error("FX rate fetch failed for non-USD stock backfill, aborting to prevent null prices", {
        symbol,
        nativeCurrency: isoCurrency,
        error: String(err),
      });
      throw err;
    }

    if (fxRates.length === 0) {
      throw new Error(
        `No FX rates returned for ${isoCurrency} (${from} to ${to}), aborting non-USD stock backfill for ${symbol}`
      );
    }

    // Build lookup: date -> priceUsd (how many USD per 1 unit of native currency)
    const fxByDate: Record<string, { priceUsd: number; priceEur: number }> = {};
    for (const rate of fxRates) {
      fxByDate[rate.date] = { priceUsd: rate.priceUsd, priceEur: rate.priceEur };
    }

    // Forward-fill FX rates for weekends/holidays
    let lastFx: { priceUsd: number; priceEur: number } | null = null;
    for (const date of dates) {
      if (fxByDate[date]) {
        lastFx = fxByDate[date];
      } else if (lastFx) {
        fxByDate[date] = lastFx;
      }
    }

    prices = normalizedHistory.map((point) => {
      const fx = fxByDate[point.date];
      if (fx) {
        return {
          assetId: symbol,
          category: "stock",
          date: point.date,
          priceUsd: point.price * fx.priceUsd,
          priceEur: point.price * fx.priceEur,
        };
      }
      // No FX rate available — store as null (will be filled on next backfill)
      return {
        assetId: symbol,
        category: "stock",
        date: point.date,
        priceUsd: null as number | null,
        priceEur: null as number | null,
      };
    });

    // If we already computed EUR via FX conversion, no need for applyEurConversion
    // Filter out entries where both prices are null (dates before first available FX rate)
    return prices.filter((p) => p.priceUsd != null || p.priceEur != null);
  }

  return applyEurConversion(prices);
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

    // Forward-fill EUR rates for weekends/holidays where ECB doesn't publish
    let lastKnownRate: number | null = null;
    const allDates = prices.map((p) => p.date).sort();
    for (const date of allDates) {
      if (eurRateByDate[date] != null) {
        lastKnownRate = eurRateByDate[date];
      } else if (lastKnownRate != null) {
        eurRateByDate[date] = lastKnownRate;
      }
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
