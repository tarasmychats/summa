import { logger } from "../logger.js";
import { config } from "../config.js";
import { cryptoCompareCircuit } from "./circuitBreaker.js";

const CRYPTOCOMPARE_BASE = "https://min-api.cryptocompare.com/data/v2";

export interface CryptoHistoryPoint {
  date: string; // YYYY-MM-DD
  price: number;
}

/**
 * Fetches historical daily prices for a cryptocurrency from CryptoCompare.
 * Paginates backwards using `toTs` when days > 2000.
 */
export async function fetchCryptoHistory(
  symbol: string,
  days: number
): Promise<CryptoHistoryPoint[]> {
  const allPoints: CryptoHistoryPoint[] = [];
  let remaining = days;
  let toTs: number | undefined;

  while (remaining > 0) {
    const limit = Math.min(remaining, 2000);
    const points = await fetchPage(symbol, limit, toTs);

    if (points.length === 0) break;

    allPoints.push(...points);
    remaining -= points.length;

    // Set toTs to the day before the oldest point for next page
    const oldestDate = points[points.length - 1].date;
    toTs = Math.floor(new Date(oldestDate).getTime() / 1000) - 86400;
  }

  // Sort chronologically and deduplicate by date
  const seen = new Set<string>();
  return allPoints
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter((p) => {
      if (seen.has(p.date)) return false;
      seen.add(p.date);
      return true;
    });
}

async function fetchPage(
  symbol: string,
  limit: number,
  toTs?: number
): Promise<CryptoHistoryPoint[]> {
  const params = new URLSearchParams({
    fsym: symbol,
    tsym: "USD",
    limit: String(limit),
  });
  if (toTs != null) {
    params.set("toTs", String(toTs));
  }
  const apiKey = config.cryptoCompareApiKey;
  if (apiKey) {
    params.set("api_key", apiKey);
  }

  try {
    const response = await cryptoCompareCircuit.fetch(
      `${CRYPTOCOMPARE_BASE}/histoday?${params}`
    );
    if (!response.ok) {
      const msg = `CryptoCompare API returned ${response.status}`;
      logger.warn("crypto history fetch failed", {
        status: response.status,
        symbol,
        limit,
      });
      throw new Error(msg);
    }

    const data = await response.json();

    if (data.Response === "Error") {
      logger.warn("CryptoCompare API error response", {
        symbol,
        message: data.Message,
      });
      throw new Error(`CryptoCompare API error: ${data.Message}`);
    }

    if (!data.Data?.Data || !Array.isArray(data.Data.Data)) {
      logger.warn("crypto history response missing Data.Data array", { symbol });
      return [];
    }

    return data.Data.Data
      .filter((point: any) => point.close > 0)
      .map((point: any) => ({
        date: new Date(point.time * 1000).toISOString().split("T")[0],
        price: point.close,
      }));
  } catch (err) {
    logger.error("crypto history fetch error", {
      symbol,
      limit,
      error: String(err),
    });
    throw err;
  }
}

/**
 * Delays execution for rate limiting between CryptoCompare API calls.
 * CryptoCompare free tier is generous (~50 req/sec), but we add a small delay.
 */
export function rateLimitDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 500));
}
