import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchCryptoPrices } from "../crypto.js";
import { coingeckoCircuit } from "../circuitBreaker.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("fetchCryptoPrices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    coingeckoCircuit.reset();
    process.env.COINGECKO_API_KEY = "test-key";
  });

  it("returns prices for requested crypto assets", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        bitcoin: { usd: 95000, usd_24h_change: 1.5 },
        ethereum: { usd: 3400, usd_24h_change: -0.8 },
      }),
    });

    const result = await fetchCryptoPrices(["bitcoin", "ethereum"], "usd");

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: "bitcoin",
      category: "crypto",
      price: 95000,
      currency: "usd",
      change24h: 1.5,
      updatedAt: expect.any(String),
    });
    expect(result[1].id).toBe("ethereum");
  });

  it("returns empty array when API fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: new Headers(),
    });

    const result = await fetchCryptoPrices(["bitcoin"], "usd");
    expect(result).toEqual([]);
  });
});
