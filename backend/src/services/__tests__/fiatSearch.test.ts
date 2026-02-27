import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchFiat } from "../fiatSearch.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("searchFiat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EXCHANGERATE_API_KEY = "test-key";
  });

  it("returns currencies matching query", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: "success",
        conversion_rates: {
          USD: 1,
          EUR: 0.92,
          UAH: 41.5,
          GBP: 0.79,
          JPY: 149.5,
        },
      }),
    });

    const result = await searchFiat("eur");

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "EUR",
      name: "Euro",
      symbol: "EUR",
      category: "fiat",
    });
  });

  it("returns all currencies for empty query", async () => {
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

    const result = await searchFiat("");
    expect(result).toHaveLength(3);
  });

  it("returns empty array when API fails", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await searchFiat("usd");
    expect(result).toEqual([]);
  });
});
