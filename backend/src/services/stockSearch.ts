import YahooFinance from "yahoo-finance2";
import type { SearchResult } from "../types.js";
import { logger } from "../logger.js";

const yahooFinance = new YahooFinance();

export async function searchStocks(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  try {
    const result: any = await yahooFinance.search(query, { quotesCount: 20, newsCount: 0 }, { validateResult: false });
    const quotes = result.quotes ?? [];

    return quotes
      .filter((q: any) => q.isYahooFinance && q.symbol)
      .slice(0, 20)
      .map((q: any) => ({
        id: q.symbol,
        name: (q.longname ?? q.shortname ?? q.symbol).trim(),
        symbol: q.symbol,
        category: "stock" as const,
      }));
  } catch (err) {
    logger.error("stock search error", { query, error: String(err) });
    return [];
  }
}
