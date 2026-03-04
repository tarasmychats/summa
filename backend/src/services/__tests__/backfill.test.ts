import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock repositories
const mockGetBackfillStatus = vi.fn();
const mockUpsertBackfillStatus = vi.fn();
const mockInsertDailyPrices = vi.fn();

vi.mock("../../repositories/backfillStatus.js", () => ({
  getBackfillStatus: (...args: unknown[]) => mockGetBackfillStatus(...args),
  upsertBackfillStatus: (...args: unknown[]) =>
    mockUpsertBackfillStatus(...args),
}));

vi.mock("../../repositories/dailyPrices.js", () => ({
  insertDailyPrices: (...args: unknown[]) => mockInsertDailyPrices(...args),
}));

// Mock history services
const mockFetchCryptoHistory = vi.fn();
const mockFetchStockHistory = vi.fn();
const mockFetchFiatHistory = vi.fn();

vi.mock("../cryptoHistory.js", () => ({
  fetchCryptoHistory: (...args: unknown[]) =>
    mockFetchCryptoHistory(...args),
  rateLimitDelay: () => Promise.resolve(),
}));

vi.mock("../stockHistory.js", () => ({
  fetchStockHistory: (...args: unknown[]) => mockFetchStockHistory(...args),
  rateLimitDelay: () => Promise.resolve(),
}));

vi.mock("../fiatHistory.js", () => ({
  fetchFiatHistory: (...args: unknown[]) => mockFetchFiatHistory(...args),
  rateLimitDelay: () => Promise.resolve(),
}));

import { backfillAsset, getRateLimitDelay } from "../backfill.js";

describe("backfillAsset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertDailyPrices.mockResolvedValue(undefined);
    mockUpsertBackfillStatus.mockResolvedValue(undefined);
  });

  describe("skip logic", () => {
    it("skips backfill if already updated today", async () => {
      const today = new Date();
      mockGetBackfillStatus.mockResolvedValueOnce({
        oldestDate: new Date("2023-01-01"),
        lastUpdated: today,
      });

      await backfillAsset("bitcoin", "crypto");

      expect(mockFetchCryptoHistory).not.toHaveBeenCalled();
      expect(mockInsertDailyPrices).not.toHaveBeenCalled();
      expect(mockUpsertBackfillStatus).not.toHaveBeenCalled();
    });

    it("proceeds if last update was yesterday", async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      mockGetBackfillStatus.mockResolvedValueOnce({
        oldestDate: new Date("2023-01-01"),
        lastUpdated: yesterday,
      });
      mockFetchCryptoHistory.mockResolvedValueOnce([
        { date: "2024-01-01", price: 42000 },
      ]);

      await backfillAsset("bitcoin", "crypto");

      expect(mockFetchCryptoHistory).toHaveBeenCalled();
      expect(mockInsertDailyPrices).toHaveBeenCalled();
    });
  });

  describe("new asset - full backfill", () => {
    it("fetches crypto history (365 days) for new crypto asset", async () => {
      mockGetBackfillStatus.mockResolvedValueOnce(null);
      mockFetchCryptoHistory.mockResolvedValueOnce([
        { date: "2024-01-01", price: 42000 },
        { date: "2024-01-02", price: 43000 },
      ]);

      await backfillAsset("bitcoin", "crypto");

      expect(mockFetchCryptoHistory).toHaveBeenCalledWith("bitcoin", 365);
      expect(mockInsertDailyPrices).toHaveBeenCalledWith([
        {
          assetId: "bitcoin",
          category: "crypto",
          date: "2024-01-01",
          priceUsd: 42000,
          priceEur: null,
        },
        {
          assetId: "bitcoin",
          category: "crypto",
          date: "2024-01-02",
          priceUsd: 43000,
          priceEur: null,
        },
      ]);
      expect(mockUpsertBackfillStatus).toHaveBeenCalledWith(
        "bitcoin",
        "crypto",
        new Date("2024-01-01")
      );
    });

    it("fetches stock history (5 years) for new stock asset", async () => {
      mockGetBackfillStatus.mockResolvedValueOnce(null);
      mockFetchStockHistory.mockResolvedValueOnce([
        { date: "2021-01-04", price: 129.41 },
        { date: "2021-01-05", price: 131.01 },
      ]);

      await backfillAsset("AAPL", "stock");

      expect(mockFetchStockHistory).toHaveBeenCalledWith("AAPL", 5);
      expect(mockInsertDailyPrices).toHaveBeenCalledWith([
        {
          assetId: "AAPL",
          category: "stock",
          date: "2021-01-04",
          priceUsd: 129.41,
          priceEur: null,
        },
        {
          assetId: "AAPL",
          category: "stock",
          date: "2021-01-05",
          priceUsd: 131.01,
          priceEur: null,
        },
      ]);
      expect(mockUpsertBackfillStatus).toHaveBeenCalledWith(
        "AAPL",
        "stock",
        new Date("2021-01-04")
      );
    });

    it("fetches fiat history (5 years) with USD and EUR prices", async () => {
      mockGetBackfillStatus.mockResolvedValueOnce(null);
      mockFetchFiatHistory.mockResolvedValueOnce([
        { date: "2021-03-01", priceUsd: 1.21, priceEur: 1.0 },
        { date: "2021-03-02", priceUsd: 1.2, priceEur: 0.99 },
      ]);

      await backfillAsset("EUR", "fiat");

      expect(mockFetchFiatHistory).toHaveBeenCalledWith(
        "EUR",
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
      );
      expect(mockInsertDailyPrices).toHaveBeenCalledWith([
        {
          assetId: "EUR",
          category: "fiat",
          date: "2021-03-01",
          priceUsd: 1.21,
          priceEur: 1.0,
        },
        {
          assetId: "EUR",
          category: "fiat",
          date: "2021-03-02",
          priceUsd: 1.2,
          priceEur: 0.99,
        },
      ]);
    });
  });

  describe("empty results", () => {
    it("does not insert prices but still updates backfill status when fetch returns empty", async () => {
      mockGetBackfillStatus.mockResolvedValueOnce(null);
      mockFetchCryptoHistory.mockResolvedValueOnce([]);

      await backfillAsset("unknown-coin", "crypto");

      expect(mockInsertDailyPrices).not.toHaveBeenCalled();
      // Should still update status to prevent infinite retry for invalid assets
      expect(mockUpsertBackfillStatus).toHaveBeenCalledWith(
        "unknown-coin",
        "crypto",
        expect.any(Date)
      );
    });
  });

  describe("unknown category", () => {
    it("returns without fetching for unknown category", async () => {
      mockGetBackfillStatus.mockResolvedValueOnce(null);

      await backfillAsset("something", "unknown");

      expect(mockFetchCryptoHistory).not.toHaveBeenCalled();
      expect(mockFetchStockHistory).not.toHaveBeenCalled();
      expect(mockFetchFiatHistory).not.toHaveBeenCalled();
      expect(mockInsertDailyPrices).not.toHaveBeenCalled();
    });
  });

  describe("error recovery", () => {
    it("throws when fetch service throws", async () => {
      mockGetBackfillStatus.mockResolvedValueOnce(null);
      mockFetchCryptoHistory.mockRejectedValueOnce(
        new Error("API exploded")
      );

      await expect(backfillAsset("bitcoin", "crypto")).rejects.toThrow(
        "API exploded"
      );

      expect(mockInsertDailyPrices).not.toHaveBeenCalled();
      expect(mockUpsertBackfillStatus).not.toHaveBeenCalled();
    });

    it("throws when insertDailyPrices fails", async () => {
      mockGetBackfillStatus.mockResolvedValueOnce(null);
      mockFetchCryptoHistory.mockResolvedValueOnce([
        { date: "2024-01-01", price: 42000 },
      ]);
      mockInsertDailyPrices.mockRejectedValueOnce(
        new Error("DB write failed")
      );

      await expect(backfillAsset("bitcoin", "crypto")).rejects.toThrow(
        "DB write failed"
      );

      expect(mockUpsertBackfillStatus).not.toHaveBeenCalled();
    });

    it("does not update backfill status if insert fails", async () => {
      mockGetBackfillStatus.mockResolvedValueOnce(null);
      mockFetchStockHistory.mockResolvedValueOnce([
        { date: "2024-01-01", price: 150 },
      ]);
      mockInsertDailyPrices.mockRejectedValueOnce(new Error("DB error"));

      await expect(backfillAsset("AAPL", "stock")).rejects.toThrow("DB error");

      expect(mockUpsertBackfillStatus).not.toHaveBeenCalled();
    });
  });

  describe("oldest date tracking", () => {
    it("uses the earliest date from fetched prices for backfill status", async () => {
      mockGetBackfillStatus.mockResolvedValueOnce(null);
      mockFetchCryptoHistory.mockResolvedValueOnce([
        { date: "2024-03-15", price: 65000 },
        { date: "2024-01-01", price: 42000 },
        { date: "2024-06-01", price: 70000 },
      ]);

      await backfillAsset("bitcoin", "crypto");

      expect(mockUpsertBackfillStatus).toHaveBeenCalledWith(
        "bitcoin",
        "crypto",
        new Date("2024-01-01")
      );
    });
  });
});

describe("getRateLimitDelay", () => {
  it("returns a function for crypto", () => {
    const delay = getRateLimitDelay("crypto");
    expect(delay).toBeInstanceOf(Function);
  });

  it("returns a function for stock", () => {
    const delay = getRateLimitDelay("stock");
    expect(delay).toBeInstanceOf(Function);
  });

  it("returns a function for fiat", () => {
    const delay = getRateLimitDelay("fiat");
    expect(delay).toBeInstanceOf(Function);
  });

  it("returns null for unknown category", () => {
    const delay = getRateLimitDelay("unknown");
    expect(delay).toBeNull();
  });
});
