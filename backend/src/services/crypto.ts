import type { AssetPrice } from "../types.js";
import { logger } from "../logger.js";
import { config } from "../config.js";

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

export async function fetchCryptoPrices(
  coinIds: string[],
  baseCurrency: string
): Promise<AssetPrice[]> {
  if (coinIds.length === 0) return [];

  const apiKey = config.coingeckoApiKey;
  const params = new URLSearchParams({
    ids: coinIds.join(","),
    vs_currencies: baseCurrency,
    include_24hr_change: "true",
  });
  if (apiKey) {
    params.set("x_cg_demo_api_key", apiKey);
  }

  try {
    const response = await fetch(`${COINGECKO_BASE}/simple/price?${params}`);
    if (!response.ok) {
      logger.warn("crypto price fetch failed", { status: response.status, coinIds });
      return [];
    }

    const data = await response.json();
    const now = new Date().toISOString();

    return coinIds
      .filter((id) => data[id])
      .map((id) => ({
        id,
        category: "crypto" as const,
        price: data[id][baseCurrency],
        currency: baseCurrency,
        change24h: data[id][`${baseCurrency}_24h_change`] ?? null,
        updatedAt: now,
      }));
  } catch (err) {
    logger.error("crypto price fetch error", { coinIds, error: String(err) });
    return [];
  }
}
