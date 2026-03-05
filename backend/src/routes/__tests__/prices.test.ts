import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const mockFetchCryptoPrices = vi.hoisted(() => vi.fn());
const mockFetchStockPrices = vi.hoisted(() => vi.fn());
const mockFetchExchangeRates = vi.hoisted(() => vi.fn());

vi.mock("../../services/crypto.js", () => ({
  fetchCryptoPrices: mockFetchCryptoPrices,
}));

vi.mock("../../services/stocks.js", () => ({
  fetchStockPrices: mockFetchStockPrices,
}));

vi.mock("../../services/fiat.js", () => ({
  fetchExchangeRates: mockFetchExchangeRates,
}));

// Must import after mocks are set up
import { createPricesRouter } from "../prices.js";

describe("POST /api/prices", () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mocks
    mockFetchCryptoPrices.mockResolvedValue([
      {
        id: "bitcoin",
        category: "crypto",
        price: 95000,
        currency: "usd",
        change24h: 1.5,
        updatedAt: "2026-02-27T00:00:00Z",
      },
    ]);
    mockFetchStockPrices.mockResolvedValue([
      {
        id: "VOO",
        category: "stock",
        price: 520,
        currency: "USD",
        change24h: 0.4,
        updatedAt: "2026-02-27T00:00:00Z",
      },
    ]);
    mockFetchExchangeRates.mockResolvedValue([
      {
        id: "EUR",
        category: "fiat",
        price: 0.92,
        currency: "USD",
        change24h: null,
        updatedAt: "2026-02-27T00:00:00Z",
      },
    ]);

    app = express();
    app.use(express.json());
    app.use("/api", createPricesRouter());
  });

  it("returns prices for mixed asset request", async () => {
    const response = await request(app)
      .post("/api/prices")
      .send({
        assets: [
          { id: "bitcoin", category: "crypto" },
          { id: "VOO", category: "stock" },
          { id: "EUR", category: "fiat" },
        ],
        baseCurrency: "USD",
      });

    expect(response.status).toBe(200);
    expect(response.body.prices).toHaveLength(3);
    expect(response.body.baseCurrency).toBe("USD");
    expect(response.body.timestamp).toBeDefined();
  });

  it("returns 400 for invalid request body", async () => {
    const response = await request(app)
      .post("/api/prices")
      .send({ invalid: true });

    expect(response.status).toBe(400);
  });

  it("returns 400 when more than 50 assets are requested", async () => {
    const assets = Array.from({ length: 51 }, (_, i) => ({
      id: `asset-${i}`,
      category: "crypto",
    }));

    const response = await request(app)
      .post("/api/prices")
      .send({ assets, baseCurrency: "USD" });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/too many assets/i);
  });

  it("fetches ETF prices using stock provider", async () => {
    mockFetchCryptoPrices.mockResolvedValue([]);
    mockFetchExchangeRates.mockResolvedValue([]);
    mockFetchStockPrices.mockResolvedValue([
      {
        id: "SPY",
        category: "stock",
        price: 520,
        currency: "USD",
        change24h: 0.4,
        updatedAt: "2026-02-27T00:00:00Z",
      },
    ]);

    const response = await request(app)
      .post("/api/prices")
      .send({
        assets: [{ id: "SPY", category: "etf" }],
        baseCurrency: "USD",
      });

    expect(response.status).toBe(200);
    expect(response.body.prices[0].category).toBe("etf");
    expect(response.body.prices[0].id).toBe("SPY");
  });

  describe("minor-unit currency normalization", () => {
    it("normalizes GBp (pence) prices to GBP before FX conversion", async () => {
      mockFetchStockPrices.mockResolvedValue([
        {
          id: "VOD.L",
          category: "stock",
          price: 7500, // 7500 pence
          currency: "GBp",
          change24h: 0.3,
          updatedAt: "2026-02-27T00:00:00Z",
        },
      ]);
      // FX rate: 1 USD = 0.79 GBP, so GBP rate from USD base = 0.79
      mockFetchExchangeRates.mockResolvedValue([
        {
          id: "GBP",
          category: "fiat",
          price: 0.79,
          currency: "USD",
          change24h: null,
          updatedAt: "2026-02-27T00:00:00Z",
        },
      ]);

      const response = await request(app)
        .post("/api/prices")
        .send({
          assets: [{ id: "VOD.L", category: "stock" }],
          baseCurrency: "USD",
        });

      expect(response.status).toBe(200);
      const stockPrice = response.body.prices.find((p: any) => p.id === "VOD.L");
      // 7500 pence / 100 = £75, then £75 / 0.79 = ~$94.94
      expect(stockPrice.price).toBeCloseTo(75 / 0.79, 1);
      expect(stockPrice.currency).toBe("USD");
    });
  });

  describe("unconverted stock warnings", () => {
    it("includes warnings when FX conversion fails", async () => {
      mockFetchStockPrices.mockResolvedValue([
        {
          id: "SAP.DE",
          category: "stock",
          price: 200,
          currency: "EUR",
          change24h: 0.5,
          updatedAt: "2026-02-27T00:00:00Z",
        },
      ]);
      // First call is for fiat prices in Promise.all (resolves with empty for no fiat assets),
      // second call is for stock FX conversion (fails)
      mockFetchExchangeRates
        .mockResolvedValueOnce([]) // fiat prices call
        .mockRejectedValueOnce(new Error("FX API down")); // stock conversion call

      const response = await request(app)
        .post("/api/prices")
        .send({
          assets: [{ id: "SAP.DE", category: "stock" }],
          baseCurrency: "USD",
        });

      expect(response.status).toBe(200);
      expect(response.body.warnings).toBeDefined();
      expect(response.body.warnings[0]).toContain("SAP.DE");
    });

    it("includes warnings on cache hit for unconverted stocks", async () => {
      mockFetchStockPrices.mockResolvedValue([
        {
          id: "SAP.DE",
          category: "stock",
          price: 200,
          currency: "EUR",
          change24h: 0.5,
          updatedAt: "2026-02-27T00:00:00Z",
        },
      ]);
      // First call is for fiat prices, second for stock FX conversion
      mockFetchExchangeRates
        .mockResolvedValueOnce([]) // fiat prices call
        .mockRejectedValueOnce(new Error("FX API down")); // stock conversion call

      // First request: cache miss
      const firstResponse = await request(app)
        .post("/api/prices")
        .send({
          assets: [{ id: "SAP.DE", category: "stock" }],
          baseCurrency: "USD",
        });
      expect(firstResponse.status).toBe(200);
      expect(firstResponse.body.warnings).toBeDefined();

      // Second request: cache hit — should still include warnings
      const secondResponse = await request(app)
        .post("/api/prices")
        .send({
          assets: [{ id: "SAP.DE", category: "stock" }],
          baseCurrency: "USD",
        });
      expect(secondResponse.status).toBe(200);
      expect(secondResponse.body.warnings).toBeDefined();
      expect(secondResponse.body.warnings[0]).toContain("SAP.DE");
    });
  });
});
