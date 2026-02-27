import yahooFinance from "yahoo-finance2";
import type { AssetPrice } from "../types.js";
import { logger } from "../logger.js";

export async function fetchStockPrices(
  tickers: string[]
): Promise<AssetPrice[]> {
  if (tickers.length === 0) return [];

  try {
    const results = await yahooFinance.quote(tickers);
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
