import { logger } from "../logger.js";
import { config } from "../config.js";

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

export interface CryptoHistoryPoint {
  date: string; // YYYY-MM-DD
  price: number;
}

/**
 * Fetches historical daily prices for a cryptocurrency from CoinGecko.
 * Free tier supports up to 365 days of history.
 */
export async function fetchCryptoHistory(
  coinId: string,
  days: number
): Promise<CryptoHistoryPoint[]> {
  const apiKey = config.coingeckoApiKey;
  const params = new URLSearchParams({
    vs_currency: "usd",
    days: String(days),
    interval: "daily",
  });
  if (apiKey) {
    params.set("x_cg_demo_api_key", apiKey);
  }

  try {
    const response = await fetch(
      `${COINGECKO_BASE}/coins/${encodeURIComponent(coinId)}/market_chart?${params}`
    );
    if (!response.ok) {
      const msg = `CoinGecko API returned ${response.status}`;
      logger.warn("crypto history fetch failed", {
        status: response.status,
        coinId,
        days,
      });
      throw new Error(msg);
    }

    const data = await response.json();
    if (!data.prices || !Array.isArray(data.prices)) {
      logger.warn("crypto history response missing prices array", { coinId });
      return [];
    }

    return data.prices.map(([timestamp, price]: [number, number]) => ({
      date: new Date(timestamp).toISOString().split("T")[0],
      price,
    }));
  } catch (err) {
    logger.error("crypto history fetch error", {
      coinId,
      days,
      error: String(err),
    });
    throw err;
  }
}

/**
 * Delays execution for rate limiting between CoinGecko API calls.
 * CoinGecko free tier: 30 req/min -> 2s between calls.
 */
export function rateLimitDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 2000));
}
