import YahooFinance from "yahoo-finance2";
import type { AssetPrice } from "../types.js";
import { logger } from "../logger.js";

const yahooFinance = new YahooFinance({
  suppressNotices: ["ripHistorical", "yahooSurvey"],
});

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

export async function fetchStockPrices(
  tickers: string[]
): Promise<AssetPrice[]> {
  if (tickers.length === 0) return [];

  try {
    const results = await withTimeout(
      yahooFinance.quote(tickers, {}, { validateResult: false }),
      YAHOO_TIMEOUT_MS,
      `yahooFinance.quote(${tickers.join(",")})`
    );
    const quotes = Array.isArray(results) ? results : [results];
    const now = new Date().toISOString();

    return quotes
      .filter((q: any) => q.regularMarketPrice != null)
      .map((q: any) => ({
        id: q.symbol,
        category: "stock" as const,
        price: q.regularMarketPrice,
        currency: q.currency ?? "USD",
        change24h: q.regularMarketChangePercent ?? null,
        updatedAt: now,
      }));
  } catch (err) {
    logger.error("stock price fetch error", { tickers, error: String(err) });
    return [];
  }
}
