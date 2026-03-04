import YahooFinance from "yahoo-finance2";
import { logger } from "../logger.js";

const yahooFinance = new YahooFinance();

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
    const result = await yahooFinance.historical(
      symbol,
      {
        period1: period1.toISOString().split("T")[0],
        period2: period2.toISOString().split("T")[0],
        interval: "1d",
      },
      { validateResult: false }
    );

    if (!Array.isArray(result) || result.length === 0) {
      logger.warn("stock history returned no data", { symbol, years });
      return [];
    }

    return result
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
    return [];
  }
}

/**
 * Delays execution for rate limiting between Yahoo Finance API calls.
 * Yahoo Finance is unofficial — 5s delay between symbols to be safe.
 */
export function rateLimitDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 5000));
}
