import { logger } from "../logger.js";

const FRANKFURTER_BASE = "https://api.frankfurter.dev/v1";

export interface FiatHistoryPoint {
  date: string; // YYYY-MM-DD
  priceUsd: number;
  priceEur: number;
}

/**
 * Fetches historical daily exchange rates for a fiat currency from Frankfurter API.
 * Returns prices relative to 1 unit of the target currency (e.g., 1 EUR = 1.08 USD).
 */
export async function fetchFiatHistory(
  currency: string,
  from: string,
  to: string
): Promise<FiatHistoryPoint[]> {
  const upperCurrency = currency.toUpperCase();
  // Always request EUR alongside the target currency for cross-rate computation
  const symbols =
    upperCurrency === "EUR" ? "EUR" : `${upperCurrency},EUR`;

  try {
    const url = `${FRANKFURTER_BASE}/${from}..${to}?base=USD&symbols=${symbols}`;
    const response = await fetch(url);

    if (!response.ok) {
      const msg = `Frankfurter API returned ${response.status}`;
      logger.warn("fiat history fetch failed", {
        status: response.status,
        currency,
        from,
        to,
      });
      throw new Error(msg);
    }

    const data = await response.json();
    if (!data.rates || typeof data.rates !== "object") {
      logger.warn("fiat history response missing rates object", { currency });
      return [];
    }

    const results: FiatHistoryPoint[] = [];

    for (const [date, ratesForDate] of Object.entries(data.rates)) {
      const rates = ratesForDate as Record<string, number>;
      const currencyRate = rates[upperCurrency];

      if (currencyRate == null || currencyRate === 0) continue;

      // price_usd: how many USD per 1 unit of currency (inverse of the rate)
      const priceUsd = 1 / currencyRate;

      // price_eur: how many EUR per 1 unit of currency
      let priceEur: number;
      if (upperCurrency === "EUR") {
        priceEur = 1;
      } else {
        const eurRate = rates["EUR"];
        if (eurRate == null || eurRate === 0) continue;
        priceEur = eurRate / currencyRate;
      }

      results.push({ date, priceUsd, priceEur });
    }

    // Sort by date ascending
    results.sort((a, b) => a.date.localeCompare(b.date));

    return results;
  } catch (err) {
    logger.error("fiat history fetch error", {
      currency,
      from,
      to,
      error: String(err),
    });
    throw err;
  }
}

/**
 * Delays execution for rate limiting between Frankfurter API calls.
 * Frankfurter has no documented limit, but 1s delay is polite.
 */
export function rateLimitDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 1000));
}
