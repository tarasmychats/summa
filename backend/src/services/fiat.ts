import type { AssetPrice } from "../types.js";

const EXCHANGERATE_BASE = "https://v6.exchangerate-api.com/v6";

export async function fetchExchangeRates(
  baseCurrency: string,
  targetCurrencies: string[]
): Promise<AssetPrice[]> {
  if (targetCurrencies.length === 0) return [];

  const apiKey = process.env.EXCHANGERATE_API_KEY;
  if (!apiKey) return [];

  try {
    const response = await fetch(
      `${EXCHANGERATE_BASE}/${apiKey}/latest/${baseCurrency}`
    );
    if (!response.ok) return [];

    const data = await response.json();
    if (data.result !== "success") return [];

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
  } catch {
    return [];
  }
}
