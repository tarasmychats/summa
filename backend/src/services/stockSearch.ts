import yahooFinance from "yahoo-finance2";
import type { SearchResult } from "../types.js";

export async function searchStocks(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  try {
    const result = await yahooFinance.search(query, { quotesCount: 20, newsCount: 0 });
    const quotes = result.quotes ?? [];

    return quotes
      .filter((q: any) => q.isYahooFinance && q.symbol)
      .slice(0, 20)
      .map((q: any) => ({
        id: q.symbol,
        name: q.shortname ?? q.longname ?? q.symbol,
        symbol: q.symbol,
        category: "stock" as const,
      }));
  } catch {
    return [];
  }
}
