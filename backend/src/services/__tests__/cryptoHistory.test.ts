import { describe, it, expect, vi, beforeEach } from "vitest";
import { cryptoCompareCircuit } from "../circuitBreaker.js";

const mockConfig = vi.hoisted(() => ({
  cryptoCompareApiKey: "test-key" as string | undefined,
}));

vi.mock("../../config.js", () => ({ config: mockConfig }));

import { fetchCryptoHistory, rateLimitDelay } from "../cryptoHistory.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeCryptoCompareResponse(
  points: Array<{ time: number; close: number }>
) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      Response: "Success",
      Data: {
        Data: points,
      },
    }),
  };
}

describe("fetchCryptoHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cryptoCompareCircuit.reset();
    mockConfig.cryptoCompareApiKey = "test-key";
  });

  it("returns daily prices for a valid symbol", async () => {
    mockFetch.mockResolvedValueOnce(
      makeCryptoCompareResponse([
        { time: 1704067200, close: 42000.5 }, // 2024-01-01
        { time: 1704153600, close: 43000.75 }, // 2024-01-02
        { time: 1704240000, close: 41500.25 }, // 2024-01-03
      ])
    );
    mockFetch.mockResolvedValueOnce(makeCryptoCompareResponse([]));

    const result = await fetchCryptoHistory("BTC", 30);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ date: "2024-01-01", price: 42000.5 });
    expect(result[1]).toEqual({ date: "2024-01-02", price: 43000.75 });
    expect(result[2]).toEqual({ date: "2024-01-03", price: 41500.25 });
  });

  it("calls CryptoCompare with correct URL and params", async () => {
    mockFetch.mockResolvedValueOnce(
      makeCryptoCompareResponse([])
    );

    await fetchCryptoHistory("ETH", 30);

    expect(mockFetch).toHaveBeenCalledOnce();
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/data/v2/histoday");
    expect(url).toContain("fsym=ETH");
    expect(url).toContain("tsym=USD");
    expect(url).toContain("limit=30");
    expect(url).toContain("api_key=test-key");
  });

  it("omits API key when not set", async () => {
    mockConfig.cryptoCompareApiKey = undefined;
    mockFetch.mockResolvedValueOnce(
      makeCryptoCompareResponse([])
    );

    await fetchCryptoHistory("BTC", 30);

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).not.toContain("api_key");
  });

  it("filters out points with zero close price", async () => {
    mockFetch.mockResolvedValueOnce(
      makeCryptoCompareResponse([
        { time: 1704067200, close: 42000 },
        { time: 1704153600, close: 0 },
        { time: 1704240000, close: 41500 },
      ])
    );
    mockFetch.mockResolvedValueOnce(makeCryptoCompareResponse([]));

    const result = await fetchCryptoHistory("BTC", 30);

    expect(result).toHaveLength(2);
    expect(result[0].date).toBe("2024-01-01");
    expect(result[1].date).toBe("2024-01-03");
  });

  it("paginates when days > 2000", async () => {
    // First page: 2000 points
    const page1Points = Array.from({ length: 2000 }, (_, i) => ({
      time: 1704067200 + i * 86400,
      close: 42000 + i,
    }));
    mockFetch.mockResolvedValueOnce(makeCryptoCompareResponse(page1Points));

    // Second page: remaining points
    const page2Points = Array.from({ length: 500 }, (_, i) => ({
      time: 1704067200 - (i + 1) * 86400,
      close: 41000 - i,
    }));
    mockFetch.mockResolvedValueOnce(makeCryptoCompareResponse(page2Points));

    const result = await fetchCryptoHistory("BTC", 2500);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.length).toBe(2500);

    // Second call should have toTs parameter
    const secondUrl = mockFetch.mock.calls[1][0] as string;
    expect(secondUrl).toContain("toTs=");
  });

  it("deduplicates points with same date", async () => {
    mockFetch.mockResolvedValueOnce(
      makeCryptoCompareResponse([
        { time: 1704067200, close: 42000 }, // 2024-01-01
        { time: 1704067200, close: 42001 }, // 2024-01-01 duplicate
      ])
    );
    mockFetch.mockResolvedValueOnce(makeCryptoCompareResponse([]));

    const result = await fetchCryptoHistory("BTC", 30);
    expect(result).toHaveLength(1);
  });

  it("throws when API returns non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: new Headers(),
    });

    await expect(fetchCryptoHistory("BTC", 30)).rejects.toThrow(
      "CryptoCompare API returned 429"
    );
  });

  it("throws when API returns error response body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        Response: "Error",
        Message: "Invalid symbol",
      }),
    });

    await expect(fetchCryptoHistory("INVALID", 30)).rejects.toThrow(
      "CryptoCompare API error: Invalid symbol"
    );
  });

  it("returns empty array when response has no Data.Data array", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ Response: "Success", Data: {} }),
    });

    const result = await fetchCryptoHistory("BTC", 30);
    expect(result).toEqual([]);
  });

  it("throws when fetch throws network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    await expect(fetchCryptoHistory("BTC", 30)).rejects.toThrow(
      "Network error"
    );
  });

  it("stops paginating when a page returns no points", async () => {
    mockFetch.mockResolvedValueOnce(
      makeCryptoCompareResponse([
        { time: 1704067200, close: 42000 },
      ])
    );
    mockFetch.mockResolvedValueOnce(
      makeCryptoCompareResponse([])
    );

    const result = await fetchCryptoHistory("BTC", 2500);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1);
  });
});

describe("rateLimitDelay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("resolves after 500ms", async () => {
    const promise = rateLimitDelay();
    vi.advanceTimersByTime(500);
    await promise;
    vi.useRealTimers();
  });
});
