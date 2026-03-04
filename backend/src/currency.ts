/**
 * Minor-unit currency normalization.
 * Yahoo Finance reports some stock prices in minor currency units
 * (e.g., GBp = pence, GBX = pence, ZAc = cents). These need to be
 * normalized to their standard ISO currency code with a divisor applied
 * to convert the price to the standard unit.
 */

/** Codes that are unambiguously minor-unit even after uppercasing */
const MINOR_UNIT_MAP: Record<string, { iso: string; divisor: number }> = {
  GBX: { iso: "GBP", divisor: 100 },
  ILA: { iso: "ILS", divisor: 100 },
  ZAC: { iso: "ZAR", divisor: 100 },
};

export interface NormalizedCurrency {
  /** Standard ISO currency code (e.g., "GBP") */
  iso: string;
  /** Divisor to convert from minor unit to standard unit (e.g., 100 for pence→pounds) */
  divisor: number;
}

/**
 * Normalizes a currency code from Yahoo Finance to its standard ISO form.
 * Handles minor-unit currencies like GBp (pence) → GBP with divisor 100.
 *
 * @param rawCurrency - The original currency string from Yahoo Finance (case-sensitive)
 * @returns The ISO currency code and a divisor to apply to the price.
 */
export function normalizeCurrency(rawCurrency: string): NormalizedCurrency {
  const upper = rawCurrency.toUpperCase();

  // Check unambiguous minor-unit codes (GBX, ILA, ZAc)
  const mapping = MINOR_UNIT_MAP[upper];
  if (mapping) return mapping;

  // GBp is Yahoo Finance's way of reporting pence. Detect by checking if
  // the original string has a lowercase letter (standard ISO codes are all-caps).
  if (upper === "GBP" && rawCurrency !== upper) {
    return { iso: "GBP", divisor: 100 };
  }

  return { iso: upper, divisor: 1 };
}
