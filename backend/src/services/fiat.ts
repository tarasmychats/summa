import type { AssetPrice } from "../types.js";
import { logger } from "../logger.js";

const EXCHANGERATE_BASE = "https://v6.exchangerate-api.com/v6";

export async function fetchExchangeRates(
  baseCurrency: string,
  targetCurrencies: string[]
): Promise<AssetPrice[]> {
  if (targetCurrencies.length === 0) return [];

  const apiKey = process.env.EXCHANGERATE_API_KEY;
  if (!apiKey) {
    logger.warn("fiat fetch skipped: EXCHANGERATE_API_KEY not set");
    return [];
  }

  try {
    const response = await fetch(
      `${EXCHANGERATE_BASE}/${apiKey}/latest/${baseCurrency}`
    );
    if (!response.ok) {
      logger.warn("fiat rate fetch failed", { status: response.status, baseCurrency });
      return [];
    }

    const data = await response.json();
    if (data.result !== "success") {
      logger.warn("fiat rate api error", { result: data.result, baseCurrency });
      return [];
    }

    const now = new Date().toISOString();
    const rates = data.conversion_rates;

    return targetCurrencies
      .filter((currency) => rates[currency] != null)
      .map((currency) => ({
        id: currency,
        category: "fiat" as const,
        price: rates[currency],
        currency: baseCurrency,
        change24h: null,
        updatedAt: now,
      }));
  } catch (err) {
    logger.error("fiat rate fetch error", { baseCurrency, error: String(err) });
    return [];
  }
}
