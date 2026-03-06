import YahooFinance from "yahoo-finance2";
import { logger } from "../logger.js";

const yahooFinance = new YahooFinance({
  suppressNotices: ["ripHistorical", "yahooSurvey"],
});

/** Timeout in ms for Yahoo Finance API calls */
const YAHOO_TIMEOUT_MS = 30_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

export interface StockHistoryPoint {
  date: string; // YYYY-MM-DD
  price: number;
}

/**
 * Fetches historical daily prices for a stock from Yahoo Finance.
 * Supports up to ~20 years of history depending on the symbol.
 */
export async function fetchStockHistory(
  symbol: string,
  years: number
): Promise<StockHistoryPoint[]> {
  const period2 = new Date();
  const period1 = new Date();
  period1.setFullYear(period1.getFullYear() - years);

  try {
    const result = await withTimeout(
      yahooFinance.chart(
        symbol,
        {
          period1: period1.toISOString().split("T")[0],
          period2: period2.toISOString().split("T")[0],
          interval: "1d",
        },
        { validateResult: false }
      ),
      YAHOO_TIMEOUT_MS,
      `yahooFinance.chart(${symbol})`
    );

    const quotes = (result as any)?.quotes;
    if (!Array.isArray(quotes) || quotes.length === 0) {
      logger.warn("stock history returned no data", { symbol, years });
      return [];
    }

    return quotes
      .filter((row: any) => row.date && row.close != null)
      .map((row: any) => ({
        date:
          row.date instanceof Date
            ? row.date.toISOString().split("T")[0]
            : String(row.date).split("T")[0],
        price: row.close,
      }));
  } catch (err) {
    logger.error("stock history fetch error", {
      symbol,
      years,
      error: String(err),
    });
    throw err;
  }
}

/**
 * Gets the trading currency for a stock symbol via Yahoo Finance quote.
 * Throws if the quote has no currency field — storing prices under the wrong
 * currency would silently corrupt historical data, so we abort and let the
 * backfill retry on the next run.
 */
export async function getStockCurrency(symbol: string): Promise<string> {
  const result = await withTimeout(
    yahooFinance.quote(symbol, {}, { validateResult: false }),
    YAHOO_TIMEOUT_MS,
    `yahooFinance.quote(${symbol})`
  );
  const quote = Array.isArray(result) ? result[0] : result;
  const currency = (quote as any)?.currency;
  if (!currency) {
    throw new Error(
      `Yahoo quote for ${symbol} missing currency field — aborting to avoid storing prices under wrong currency`
    );
  }
  return currency;
}

/**
 * Delays execution for rate limiting between Yahoo Finance API calls.
 * Yahoo Finance is unofficial — 5s delay between symbols to be safe.
 */
export function rateLimitDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 5000));
}
