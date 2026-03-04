import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchStockPrices } from "../stocks.js";

const { mockQuote } = vi.hoisted(() => ({
  mockQuote: vi.fn(),
}));

vi.mock("yahoo-finance2", () => ({
  default: class {
    quote = mockQuote;
  },
}));

describe("fetchStockPrices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns prices for requested stock tickers", async () => {
    mockQuote.mockResolvedValueOnce([
      {
        symbol: "VOO",
        regularMarketPrice: 520.5,
        regularMarketChangePercent: 0.45,
        currency: "USD",
      },
    ] as any);

    const result = await fetchStockPrices(["VOO"]);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "VOO",
      category: "stock",
      price: 520.5,
      currency: "USD",
      change24h: 0.45,
      updatedAt: expect.any(String),
    });
  });

  it("returns empty array on error", async () => {
    mockQuote.mockRejectedValueOnce(new Error("API down"));

    const result = await fetchStockPrices(["VOO"]);
    expect(result).toEqual([]);
  });
});
