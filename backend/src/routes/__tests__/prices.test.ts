import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPricesRouter } from "../prices.js";

// We'll test the router with mocked services
vi.mock("../../services/crypto.js", () => ({
  fetchCryptoPrices: vi.fn().mockResolvedValue([
    {
      id: "bitcoin",
      category: "crypto",
      price: 95000,
      currency: "usd",
      change24h: 1.5,
      updatedAt: "2026-02-27T00:00:00Z",
    },
  ]),
}));

vi.mock("../../services/stocks.js", () => ({
  fetchStockPrices: vi.fn().mockResolvedValue([
    {
      id: "VOO",
      category: "stock",
      price: 520,
      currency: "USD",
      change24h: 0.4,
      updatedAt: "2026-02-27T00:00:00Z",
    },
  ]),
}));

vi.mock("../../services/fiat.js", () => ({
  fetchExchangeRates: vi.fn().mockResolvedValue([
    {
      id: "EUR",
      category: "fiat",
      price: 0.92,
      currency: "USD",
      change24h: null,
      updatedAt: "2026-02-27T00:00:00Z",
    },
  ]),
}));

describe("POST /api/prices", () => {
  let app: express.Express;

  beforeEach(() => {
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
});
