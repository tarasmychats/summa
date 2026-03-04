import { describe, it, expect, vi, beforeEach } from "vitest";

const mockConfig = vi.hoisted(() => ({
  coingeckoApiKey: "test-key" as string | undefined,
}));

vi.mock("../../config.js", () => ({ config: mockConfig }));

import { fetchCryptoHistory, rateLimitDelay } from "../cryptoHistory.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("fetchCryptoHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.coingeckoApiKey = "test-key";
  });

  it("returns daily prices for a valid coin", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        prices: [
          [1704067200000, 42000.5], // 2024-01-01
          [1704153600000, 43000.75], // 2024-01-02
          [1704240000000, 41500.25], // 2024-01-03
        ],
      }),
    });

    const result = await fetchCryptoHistory("bitcoin", 365);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ date: "2024-01-01", price: 42000.5 });
    expect(result[1]).toEqual({ date: "2024-01-02", price: 43000.75 });
    expect(result[2]).toEqual({ date: "2024-01-03", price: 41500.25 });
  });

  it("calls CoinGecko with correct URL and params", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ prices: [] }),
    });

    await fetchCryptoHistory("ethereum", 30);

    expect(mockFetch).toHaveBeenCalledOnce();
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/coins/ethereum/market_chart");
    expect(url).toContain("vs_currency=usd");
    expect(url).toContain("days=30");
    expect(url).toContain("interval=daily");
    expect(url).toContain("x_cg_demo_api_key=test-key");
  });

  it("omits API key when not set", async () => {
    mockConfig.coingeckoApiKey = undefined;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ prices: [] }),
    });

    await fetchCryptoHistory("bitcoin", 365);

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).not.toContain("x_cg_demo_api_key");
  });

  it("encodes special characters in coin ID", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ prices: [] }),
    });

    await fetchCryptoHistory("some/weird coin", 30);

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/coins/some%2Fweird%20coin/market_chart");
  });

  it("throws when API returns non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429 });

    await expect(fetchCryptoHistory("bitcoin", 365)).rejects.toThrow(
      "CoinGecko API returned 429"
    );
  });

  it("throws when API returns 404 for invalid coin", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    await expect(fetchCryptoHistory("nonexistent-coin", 365)).rejects.toThrow(
      "CoinGecko API returned 404"
    );
  });

  it("returns empty array when response has no prices array", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ total_volumes: [] }),
    });

    const result = await fetchCryptoHistory("bitcoin", 365);
    expect(result).toEqual([]);
  });

  it("throws when fetch throws network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    await expect(fetchCryptoHistory("bitcoin", 365)).rejects.toThrow(
      "Network error"
    );
  });

  it("returns empty array for empty prices array", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ prices: [] }),
    });

    const result = await fetchCryptoHistory("bitcoin", 365);
    expect(result).toEqual([]);
  });
});

describe("rateLimitDelay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("resolves after 2 seconds", async () => {
    const promise = rateLimitDelay();
    vi.advanceTimersByTime(2000);
    await promise;
    vi.useRealTimers();
  });
});
