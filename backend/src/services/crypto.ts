import type { AssetPrice } from "../types.js";

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

export async function fetchCryptoPrices(
  coinIds: string[],
  baseCurrency: string
): Promise<AssetPrice[]> {
  if (coinIds.length === 0) return [];

  const apiKey = process.env.COINGECKO_API_KEY;
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
    if (!response.ok) return [];

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
  } catch {
    return [];
  }
}
