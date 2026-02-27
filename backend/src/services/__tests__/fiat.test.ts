import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchExchangeRates } from "../fiat.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("fetchExchangeRates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EXCHANGERATE_API_KEY = "test-key";
  });

  it("returns exchange rates relative to base currency", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: "success",
        conversion_rates: {
          USD: 1,
          EUR: 0.92,
          UAH: 41.5,
        },
      }),
    });

    const result = await fetchExchangeRates("USD", ["EUR", "UAH"]);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: "EUR",
      category: "fiat",
      price: 0.92,
      currency: "USD",
      change24h: null,
      updatedAt: expect.any(String),
    });
  });

  it("returns empty array when API fails", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await fetchExchangeRates("USD", ["EUR"]);
    expect(result).toEqual([]);
  });
});
