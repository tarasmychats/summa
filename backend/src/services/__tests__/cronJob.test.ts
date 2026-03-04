import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock repositories
const mockGetAllTrackedAssets = vi.fn();
const mockGetBackfillStatus = vi.fn();
const mockInsertDailyPrices = vi.fn();
const mockUpsertBackfillStatus = vi.fn();

vi.mock("../../repositories/trackedAssets.js", () => ({
  getAllTrackedAssets: (...args: unknown[]) => mockGetAllTrackedAssets(...args),
}));

vi.mock("../../repositories/backfillStatus.js", () => ({
  getBackfillStatus: (...args: unknown[]) => mockGetBackfillStatus(...args),
  upsertBackfillStatus: (...args: unknown[]) =>
    mockUpsertBackfillStatus(...args),
}));

vi.mock("../../repositories/dailyPrices.js", () => ({
  insertDailyPrices: (...args: unknown[]) => mockInsertDailyPrices(...args),
}));

// Mock price services
const mockFetchCryptoPrices = vi.fn();
const mockFetchStockPrices = vi.fn();
const mockFetchFiatHistory = vi.fn();

vi.mock("../crypto.js", () => ({
  fetchCryptoPrices: (...args: unknown[]) => mockFetchCryptoPrices(...args),
}));

vi.mock("../stocks.js", () => ({
  fetchStockPrices: (...args: unknown[]) => mockFetchStockPrices(...args),
}));

vi.mock("../fiatHistory.js", () => ({
  fetchFiatHistory: (...args: unknown[]) => mockFetchFiatHistory(...args),
  rateLimitDelay: () => Promise.resolve(),
}));

// Mock backfill service
const mockBackfillAsset = vi.fn();

vi.mock("../backfill.js", () => ({
  backfillAsset: (...args: unknown[]) => mockBackfillAsset(...args),
  getRateLimitDelay: () => () => Promise.resolve(),
}));

// Mock node-cron
const mockSchedule = vi.fn();
vi.mock("node-cron", () => ({
  default: {
    schedule: (...args: unknown[]) => mockSchedule(...args),
  },
}));

import { runDailyPriceUpdate, startDailyCron } from "../cronJob.js";

describe("runDailyPriceUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertDailyPrices.mockResolvedValue(undefined);
    mockUpsertBackfillStatus.mockResolvedValue(undefined);
  });

  it("does nothing when there are no tracked assets", async () => {
    mockGetAllTrackedAssets.mockResolvedValueOnce({});

    await runDailyPriceUpdate();

    expect(mockGetBackfillStatus).not.toHaveBeenCalled();
    expect(mockBackfillAsset).not.toHaveBeenCalled();
    expect(mockInsertDailyPrices).not.toHaveBeenCalled();
  });

  it("triggers backfill for new assets without backfill status", async () => {
    mockGetAllTrackedAssets.mockResolvedValueOnce({
      crypto: [{ assetId: "bitcoin", category: "crypto" }],
    });
    mockGetBackfillStatus.mockResolvedValueOnce(null);
    mockBackfillAsset.mockResolvedValueOnce(undefined);

    await runDailyPriceUpdate();

    expect(mockBackfillAsset).toHaveBeenCalledWith("bitcoin", "crypto");
    expect(mockFetchCryptoPrices).not.toHaveBeenCalled();
  });

  it("fetches today's crypto price for existing backfilled asset", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    mockGetAllTrackedAssets.mockResolvedValueOnce({
      crypto: [{ assetId: "bitcoin", category: "crypto" }],
    });
    mockGetBackfillStatus.mockResolvedValueOnce({
      oldestDate: new Date("2024-01-01"),
      lastUpdated: yesterday,
    });
    mockFetchCryptoPrices.mockResolvedValueOnce([
      { id: "bitcoin", category: "crypto", price: 65000, currency: "usd" },
    ]);

    await runDailyPriceUpdate();

    expect(mockFetchCryptoPrices).toHaveBeenCalledWith(["bitcoin"], "usd");
    expect(mockInsertDailyPrices).toHaveBeenCalledWith([
      expect.objectContaining({
        assetId: "bitcoin",
        category: "crypto",
        priceUsd: 65000,
        priceEur: null,
      }),
    ]);
    expect(mockBackfillAsset).not.toHaveBeenCalled();
  });

  it("fetches today's stock price for existing backfilled asset", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    mockGetAllTrackedAssets.mockResolvedValueOnce({
      stock: [{ assetId: "AAPL", category: "stock" }],
    });
    mockGetBackfillStatus.mockResolvedValueOnce({
      oldestDate: new Date("2021-01-01"),
      lastUpdated: yesterday,
    });
    mockFetchStockPrices.mockResolvedValueOnce([
      { id: "AAPL", category: "stock", price: 178.5, currency: "USD" },
    ]);

    await runDailyPriceUpdate();

    expect(mockFetchStockPrices).toHaveBeenCalledWith(["AAPL"]);
    expect(mockInsertDailyPrices).toHaveBeenCalledWith([
      expect.objectContaining({
        assetId: "AAPL",
        category: "stock",
        priceUsd: 178.5,
        priceEur: null,
      }),
    ]);
  });

  it("fetches today's fiat rate for existing backfilled asset", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const today = new Date().toISOString().split("T")[0];

    mockGetAllTrackedAssets.mockResolvedValueOnce({
      fiat: [{ assetId: "EUR", category: "fiat" }],
    });
    mockGetBackfillStatus.mockResolvedValueOnce({
      oldestDate: new Date("2021-01-01"),
      lastUpdated: yesterday,
    });
    mockFetchFiatHistory.mockResolvedValueOnce([
      { date: today, priceUsd: 1.08, priceEur: 1.0 },
    ]);

    await runDailyPriceUpdate();

    expect(mockFetchFiatHistory).toHaveBeenCalledWith("EUR", today, today);
    expect(mockInsertDailyPrices).toHaveBeenCalledWith([
      expect.objectContaining({
        assetId: "EUR",
        category: "fiat",
        priceUsd: 1.08,
        priceEur: 1.0,
      }),
    ]);
  });

  it("processes multiple assets across categories", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    mockGetAllTrackedAssets.mockResolvedValueOnce({
      crypto: [{ assetId: "bitcoin", category: "crypto" }],
      stock: [{ assetId: "AAPL", category: "stock" }],
    });

    // bitcoin: no status -> backfill
    mockGetBackfillStatus.mockResolvedValueOnce(null);
    mockBackfillAsset.mockResolvedValueOnce(undefined);

    // AAPL: has status -> today's price
    mockGetBackfillStatus.mockResolvedValueOnce({
      oldestDate: new Date("2021-01-01"),
      lastUpdated: yesterday,
    });
    mockFetchStockPrices.mockResolvedValueOnce([
      { id: "AAPL", category: "stock", price: 178.5, currency: "USD" },
    ]);

    await runDailyPriceUpdate();

    expect(mockBackfillAsset).toHaveBeenCalledWith("bitcoin", "crypto");
    expect(mockFetchStockPrices).toHaveBeenCalledWith(["AAPL"]);
    expect(mockInsertDailyPrices).toHaveBeenCalledTimes(1);
  });

  it("continues processing when one asset fails", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    mockGetAllTrackedAssets.mockResolvedValueOnce({
      crypto: [
        { assetId: "bitcoin", category: "crypto" },
        { assetId: "ethereum", category: "crypto" },
      ],
    });

    // bitcoin: fails
    mockGetBackfillStatus.mockResolvedValueOnce({
      oldestDate: new Date("2024-01-01"),
      lastUpdated: yesterday,
    });
    mockFetchCryptoPrices.mockResolvedValueOnce([]);

    // ethereum: succeeds
    mockGetBackfillStatus.mockResolvedValueOnce({
      oldestDate: new Date("2024-01-01"),
      lastUpdated: yesterday,
    });
    mockFetchCryptoPrices.mockResolvedValueOnce([
      { id: "ethereum", category: "crypto", price: 3500, currency: "usd" },
    ]);

    await runDailyPriceUpdate();

    // Both should have been attempted
    expect(mockGetBackfillStatus).toHaveBeenCalledTimes(2);
    // ethereum's price should have been inserted
    expect(mockInsertDailyPrices).toHaveBeenCalledTimes(1);
  });

  it("handles getAllTrackedAssets failure gracefully", async () => {
    mockGetAllTrackedAssets.mockRejectedValueOnce(new Error("DB down"));

    // Should not throw
    await runDailyPriceUpdate();

    expect(mockGetBackfillStatus).not.toHaveBeenCalled();
  });

  it("continues when backfill throws for one asset", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    mockGetAllTrackedAssets.mockResolvedValueOnce({
      crypto: [{ assetId: "bad-coin", category: "crypto" }],
      stock: [{ assetId: "AAPL", category: "stock" }],
    });

    // bad-coin: no status, backfill throws
    mockGetBackfillStatus.mockResolvedValueOnce(null);
    mockBackfillAsset.mockRejectedValueOnce(new Error("CoinGecko down"));

    // AAPL: has status, succeeds
    mockGetBackfillStatus.mockResolvedValueOnce({
      oldestDate: new Date("2021-01-01"),
      lastUpdated: yesterday,
    });
    mockFetchStockPrices.mockResolvedValueOnce([
      { id: "AAPL", category: "stock", price: 178.5, currency: "USD" },
    ]);

    await runDailyPriceUpdate();

    expect(mockBackfillAsset).toHaveBeenCalledWith("bad-coin", "crypto");
    expect(mockFetchStockPrices).toHaveBeenCalledWith(["AAPL"]);
    expect(mockInsertDailyPrices).toHaveBeenCalledTimes(1);
  });

  it("updates backfill status after fetching today's price", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const oldestDate = new Date("2024-01-01");

    mockGetAllTrackedAssets.mockResolvedValueOnce({
      stock: [{ assetId: "AAPL", category: "stock" }],
    });
    mockGetBackfillStatus.mockResolvedValueOnce({
      oldestDate,
      lastUpdated: yesterday,
    });
    mockFetchStockPrices.mockResolvedValueOnce([
      { id: "AAPL", category: "stock", price: 178.5, currency: "USD" },
    ]);

    await runDailyPriceUpdate();

    expect(mockUpsertBackfillStatus).toHaveBeenCalledWith(
      "AAPL",
      "stock",
      oldestDate
    );
  });

  it("skips insert when price service returns empty for today", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    mockGetAllTrackedAssets.mockResolvedValueOnce({
      stock: [{ assetId: "INVALID", category: "stock" }],
    });
    mockGetBackfillStatus.mockResolvedValueOnce({
      oldestDate: new Date("2021-01-01"),
      lastUpdated: yesterday,
    });
    mockFetchStockPrices.mockResolvedValueOnce([]);

    await runDailyPriceUpdate();

    expect(mockInsertDailyPrices).not.toHaveBeenCalled();
    expect(mockUpsertBackfillStatus).not.toHaveBeenCalled();
  });
});

describe("startDailyCron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("schedules a cron job at 02:00 UTC", () => {
    mockSchedule.mockReturnValueOnce({ stop: vi.fn() });

    startDailyCron();

    expect(mockSchedule).toHaveBeenCalledWith(
      "0 2 * * *",
      expect.any(Function),
      { timezone: "UTC" }
    );
  });

  it("returns the scheduled task", () => {
    const mockTask = { stop: vi.fn() };
    mockSchedule.mockReturnValueOnce(mockTask);

    const task = startDailyCron();

    expect(task).toBe(mockTask);
  });

  it("runs runDailyPriceUpdate when triggered", async () => {
    let scheduledCallback: () => Promise<void>;
    mockSchedule.mockImplementationOnce(
      (_schedule: string, callback: () => Promise<void>) => {
        scheduledCallback = callback;
        return { stop: vi.fn() };
      }
    );

    mockGetAllTrackedAssets.mockResolvedValueOnce({});

    startDailyCron();
    await scheduledCallback!();

    expect(mockGetAllTrackedAssets).toHaveBeenCalled();
  });
});
