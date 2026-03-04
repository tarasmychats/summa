import type { SearchResult } from "../types.js";
import { logger } from "../logger.js";
import { config } from "../config.js";

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

export async function searchCrypto(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const apiKey = config.coingeckoApiKey;
  const params = new URLSearchParams({ query });
  if (apiKey) {
    params.set("x_cg_demo_api_key", apiKey);
  }

  try {
    const response = await fetch(`${COINGECKO_BASE}/search?${params}`);
    if (!response.ok) {
      logger.warn("crypto search failed", { status: response.status, query });
      return [];
    }

    const data = await response.json();
    const coins = data.coins ?? [];

    return coins.slice(0, 20).map((coin: any) => ({
      id: coin.id,
      name: coin.name,
      symbol: (coin.symbol ?? "").toUpperCase(),
      category: "crypto" as const,
    }));
  } catch (err) {
    logger.error("crypto search error", { query, error: String(err) });
    return [];
  }
}
