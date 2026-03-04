import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchFiatHistory, rateLimitDelay } from "../fiatHistory.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("fetchFiatHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns daily rates for a valid currency", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        base: "USD",
        start_date: "2024-01-01",
        end_date: "2024-01-03",
        rates: {
          "2024-01-01": { GBP: 0.79, EUR: 0.92 },
          "2024-01-02": { GBP: 0.80, EUR: 0.91 },
          "2024-01-03": { GBP: 0.78, EUR: 0.93 },
        },
      }),
    });

    const result = await fetchFiatHistory("GBP", "2024-01-01", "2024-01-03");

    expect(result).toHaveLength(3);
    // 1 GBP = 1/0.79 USD ≈ 1.2658
    expect(result[0].date).toBe("2024-01-01");
    expect(result[0].priceUsd).toBeCloseTo(1 / 0.79, 5);
    // 1 GBP in EUR = 0.92/0.79
    expect(result[0].priceEur).toBeCloseTo(0.92 / 0.79, 5);
  });

  it("returns sorted results by date", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        rates: {
          "2024-01-03": { GBP: 0.78, EUR: 0.93 },
          "2024-01-01": { GBP: 0.79, EUR: 0.92 },
          "2024-01-02": { GBP: 0.80, EUR: 0.91 },
        },
      }),
    });

    const result = await fetchFiatHistory("GBP", "2024-01-01", "2024-01-03");

    expect(result.map((r) => r.date)).toEqual([
      "2024-01-01",
      "2024-01-02",
      "2024-01-03",
    ]);
  });

  it("handles EUR currency with priceEur = 1", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        rates: {
          "2024-01-01": { EUR: 0.92 },
          "2024-01-02": { EUR: 0.91 },
        },
      }),
    });

    const result = await fetchFiatHistory("EUR", "2024-01-01", "2024-01-02");

    expect(result).toHaveLength(2);
    expect(result[0].priceUsd).toBeCloseTo(1 / 0.92, 5);
    expect(result[0].priceEur).toBe(1);
    expect(result[1].priceUsd).toBeCloseTo(1 / 0.91, 5);
    expect(result[1].priceEur).toBe(1);
  });

  it("calls Frankfurter with correct URL and params", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ rates: {} }),
    });

    await fetchFiatHistory("GBP", "2024-01-01", "2024-06-01");

    expect(mockFetch).toHaveBeenCalledOnce();
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("api.frankfurter.dev");
    expect(url).toContain("2024-01-01..2024-06-01");
    expect(url).toContain("base=USD");
    expect(url).toContain("symbols=GBP,EUR");
  });

  it("requests only EUR symbol when currency is EUR", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ rates: {} }),
    });

    await fetchFiatHistory("EUR", "2024-01-01", "2024-06-01");

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("symbols=EUR");
    expect(url).not.toContain("symbols=EUR,EUR");
  });

  it("handles case-insensitive currency input", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        rates: {
          "2024-01-01": { GBP: 0.79, EUR: 0.92 },
        },
      }),
    });

    const result = await fetchFiatHistory("gbp", "2024-01-01", "2024-01-01");

    expect(result).toHaveLength(1);
    expect(result[0].priceUsd).toBeCloseTo(1 / 0.79, 5);
  });

  it("returns empty array when API returns non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const result = await fetchFiatHistory("XYZ", "2024-01-01", "2024-01-03");
    expect(result).toEqual([]);
  });

  it("returns empty array when API returns 422 for unsupported currency", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 422 });

    const result = await fetchFiatHistory("INVALID", "2024-01-01", "2024-01-03");
    expect(result).toEqual([]);
  });

  it("returns empty array when response has no rates object", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ base: "USD" }),
    });

    const result = await fetchFiatHistory("GBP", "2024-01-01", "2024-01-03");
    expect(result).toEqual([]);
  });

  it("returns empty array when fetch throws network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const result = await fetchFiatHistory("GBP", "2024-01-01", "2024-01-03");
    expect(result).toEqual([]);
  });

  it("skips dates where currency rate is zero", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        rates: {
          "2024-01-01": { GBP: 0.79, EUR: 0.92 },
          "2024-01-02": { GBP: 0, EUR: 0.91 },
        },
      }),
    });

    const result = await fetchFiatHistory("GBP", "2024-01-01", "2024-01-02");
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("2024-01-01");
  });

  it("skips dates where EUR rate is missing for non-EUR currency", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        rates: {
          "2024-01-01": { GBP: 0.79 }, // no EUR rate
        },
      }),
    });

    const result = await fetchFiatHistory("GBP", "2024-01-01", "2024-01-01");
    expect(result).toEqual([]);
  });

  it("returns empty array for empty rates object", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ rates: {} }),
    });

    const result = await fetchFiatHistory("GBP", "2024-01-01", "2024-01-03");
    expect(result).toEqual([]);
  });
});

describe("rateLimitDelay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("resolves after 1 second", async () => {
    const promise = rateLimitDelay();
    vi.advanceTimersByTime(1000);
    await promise;
    vi.useRealTimers();
  });
});
