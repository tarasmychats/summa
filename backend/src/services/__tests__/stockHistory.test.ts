import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchStockHistory, rateLimitDelay } from "../stockHistory.js";

const { mockChart } = vi.hoisted(() => ({
  mockChart: vi.fn(),
}));

vi.mock("yahoo-finance2", () => ({
  default: class {
    chart = mockChart;
  },
}));

describe("fetchStockHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns daily prices for a valid symbol", async () => {
    mockChart.mockResolvedValueOnce({
      quotes: [
        { date: new Date("2024-01-02"), close: 375.5 },
        { date: new Date("2024-01-03"), close: 378.25 },
        { date: new Date("2024-01-04"), close: 373.0 },
      ],
    });

    const result = await fetchStockHistory("AAPL", 5);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ date: "2024-01-02", price: 375.5 });
    expect(result[1]).toEqual({ date: "2024-01-03", price: 378.25 });
    expect(result[2]).toEqual({ date: "2024-01-04", price: 373.0 });
  });

  it("calls yahoo-finance2 chart with correct parameters", async () => {
    mockChart.mockResolvedValueOnce({ quotes: [] });

    await fetchStockHistory("VOO", 3);

    expect(mockChart).toHaveBeenCalledOnce();
    const [symbol, queryOpts, moduleOpts] = mockChart.mock.calls[0];
    expect(symbol).toBe("VOO");
    expect(queryOpts.interval).toBe("1d");
    expect(queryOpts.period1).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(queryOpts.period2).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(moduleOpts).toEqual({ validateResult: false });
  });

  it("uses correct date range based on years parameter", async () => {
    mockChart.mockResolvedValueOnce({ quotes: [] });

    await fetchStockHistory("MSFT", 5);

    const [, queryOpts] = mockChart.mock.calls[0];
    const period1 = new Date(queryOpts.period1);
    const period2 = new Date(queryOpts.period2);
    const diffYears =
      (period2.getTime() - period1.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    expect(diffYears).toBeCloseTo(5, 0);
  });

  it("filters out rows with missing close price", async () => {
    mockChart.mockResolvedValueOnce({
      quotes: [
        { date: new Date("2024-01-02"), close: 375.5 },
        { date: new Date("2024-01-03"), close: null },
        { date: new Date("2024-01-04"), close: 373.0 },
      ],
    });

    const result = await fetchStockHistory("AAPL", 1);

    expect(result).toHaveLength(2);
    expect(result[0].date).toBe("2024-01-02");
    expect(result[1].date).toBe("2024-01-04");
  });

  it("throws for invalid symbol (error thrown)", async () => {
    mockChart.mockRejectedValueOnce(
      new Error("Not Found: No data found for symbol INVALIDXYZ")
    );

    await expect(fetchStockHistory("INVALIDXYZ", 5)).rejects.toThrow(
      "Not Found: No data found for symbol INVALIDXYZ"
    );
  });

  it("returns empty array when quotes is empty", async () => {
    mockChart.mockResolvedValueOnce({ quotes: [] });

    const result = await fetchStockHistory("DELISTED", 5);
    expect(result).toEqual([]);
  });

  it("returns empty array when quotes is missing", async () => {
    mockChart.mockResolvedValueOnce({});

    const result = await fetchStockHistory("WEIRD", 5);
    expect(result).toEqual([]);
  });

  it("handles date as string instead of Date object", async () => {
    mockChart.mockResolvedValueOnce({
      quotes: [{ date: "2024-01-02T00:00:00.000Z", close: 375.5 }],
    });

    const result = await fetchStockHistory("AAPL", 1);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ date: "2024-01-02", price: 375.5 });
  });
});

describe("rateLimitDelay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("resolves after 5 seconds", async () => {
    const promise = rateLimitDelay();
    vi.advanceTimersByTime(5000);
    await promise;
    vi.useRealTimers();
  });
});
