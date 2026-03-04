import type { AssetPrice } from "../types.js";
import { logger } from "../logger.js";

const EXCHANGERATE_BASE = "https://v6.exchangerate-api.com/v6";

export async function fetchExchangeRates(
  baseCurrency: string,
  targetCurrencies: string[]
): Promise<AssetPrice[]> {
  if (targetCurrencies.length === 0) return [];

  const base = baseCurrency.toUpperCase();
  const now = new Date().toISOString();

  // Separate same-currency (always 1.0) from currencies needing API lookup
  const sameCurrency = targetCurrencies.filter((c) => c.toUpperCase() === base);
  const needsLookup = targetCurrencies.filter((c) => c.toUpperCase() !== base);

  const sameResults: AssetPrice[] = sameCurrency.map((currency) => ({
    id: currency,
    category: "fiat" as const,
    price: 1,
    currency: base,
    change24h: null,
    updatedAt: now,
  }));

  if (needsLookup.length === 0) return sameResults;

  const apiKey = process.env.EXCHANGERATE_API_KEY;
  if (!apiKey) {
    logger.warn("fiat fetch skipped: EXCHANGERATE_API_KEY not set");
    return sameResults;
  }

  try {
    const response = await fetch(
      `${EXCHANGERATE_BASE}/${apiKey}/latest/${base}`
    );
    if (!response.ok) {
      logger.warn("fiat rate fetch failed", { status: response.status, baseCurrency });
      return sameResults;
    }

    const data = await response.json();
    if (data.result !== "success") {
      logger.warn("fiat rate api error", { result: data.result, baseCurrency });
      return sameResults;
    }

    const rates = data.conversion_rates;

    const lookupResults: AssetPrice[] = needsLookup
      .filter((currency) => rates[currency] != null)
      .map((currency) => ({
        id: currency,
        category: "fiat" as const,
        price: rates[currency],
        currency: base,
        change24h: null,
        updatedAt: now,
      }));

    return [...sameResults, ...lookupResults];
  } catch (err) {
    logger.error("fiat rate fetch error", { baseCurrency, error: String(err) });
    return sameResults;
  }
}
