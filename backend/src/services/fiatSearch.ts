import type { SearchResult } from "../types.js";
import { logger } from "../logger.js";

const EXCHANGERATE_BASE = "https://v6.exchangerate-api.com/v6";

const CURRENCY_NAMES: Record<string, string> = {
  USD: "US Dollar", EUR: "Euro", GBP: "British Pound", JPY: "Japanese Yen",
  UAH: "Ukrainian Hryvnia", CHF: "Swiss Franc", CAD: "Canadian Dollar",
  AUD: "Australian Dollar", CNY: "Chinese Yuan", INR: "Indian Rupee",
  BRL: "Brazilian Real", KRW: "South Korean Won", MXN: "Mexican Peso",
  PLN: "Polish Zloty", SEK: "Swedish Krona", NOK: "Norwegian Krone",
  DKK: "Danish Krone", CZK: "Czech Koruna", HUF: "Hungarian Forint",
  TRY: "Turkish Lira", ZAR: "South African Rand", SGD: "Singapore Dollar",
  HKD: "Hong Kong Dollar", NZD: "New Zealand Dollar", THB: "Thai Baht",
  ILS: "Israeli Shekel", PHP: "Philippine Peso", TWD: "Taiwan Dollar",
  AED: "UAE Dirham", SAR: "Saudi Riyal", EGP: "Egyptian Pound",
};

export async function searchFiat(query: string): Promise<SearchResult[]> {
  const apiKey = process.env.EXCHANGERATE_API_KEY;
  if (!apiKey) {
    logger.warn("fiat search skipped: EXCHANGERATE_API_KEY not set");
    return [];
  }

  try {
    const response = await fetch(
      `${EXCHANGERATE_BASE}/${apiKey}/latest/USD`
    );
    if (!response.ok) {
      logger.warn("fiat search fetch failed", { status: response.status });
      return [];
    }

    const data = await response.json();
    if (data.result !== "success") {
      logger.warn("fiat search api error", { result: data.result });
      return [];
    }

    const currencies = Object.keys(data.conversion_rates);
    const q = query.trim().toUpperCase();

    const filtered = q
      ? currencies.filter((code) => {
          const name = (CURRENCY_NAMES[code] ?? code).toUpperCase();
          return code.includes(q) || name.includes(q);
        })
      : currencies;

    return filtered.map((code) => ({
      id: code,
      name: CURRENCY_NAMES[code] ?? code,
      symbol: code,
      category: "fiat" as const,
    }));
  } catch (err) {
    logger.error("fiat search error", { error: String(err) });
    return [];
  }
}
