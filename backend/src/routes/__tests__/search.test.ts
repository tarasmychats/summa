import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createSearchRouter } from "../search.js";

vi.mock("../../services/cryptoSearch.js", () => ({
  searchCrypto: vi.fn().mockResolvedValue([
    { id: "bitcoin", name: "Bitcoin", symbol: "BTC", category: "crypto" },
  ]),
}));

vi.mock("../../services/stockSearch.js", () => ({
  searchStocks: vi.fn().mockResolvedValue([
    { id: "AAPL", name: "Apple Inc.", symbol: "AAPL", category: "stock" },
  ]),
}));

vi.mock("../../services/fiatSearch.js", () => ({
  searchFiat: vi.fn().mockResolvedValue([
    { id: "USD", name: "US Dollar", symbol: "USD", category: "fiat" },
  ]),
}));

describe("GET /api/search", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use("/api", createSearchRouter());
  });

  it("returns results from all categories ordered fiat → stock → crypto", async () => {
    const response = await request(app).get("/api/search?q=bit");

    expect(response.status).toBe(200);
    expect(response.body.results).toHaveLength(3);
    const categories = response.body.results.map((r: any) => r.category);
    expect(categories).toEqual(["fiat", "stock", "crypto"]);
  });

  it("filters by category when specified", async () => {
    const response = await request(app).get("/api/search?q=bit&category=crypto");

    expect(response.status).toBe(200);
    expect(response.body.results.every((r: any) => r.category === "crypto")).toBe(true);
  });

  it("returns stock results before crypto for 'apple' query", async () => {
    const response = await request(app).get("/api/search?q=apple");

    expect(response.status).toBe(200);
    const categories = response.body.results.map((r: any) => r.category);
    const stockIndex = categories.indexOf("stock");
    const cryptoIndex = categories.indexOf("crypto");
    expect(stockIndex).toBeLessThan(cryptoIndex);
  });

  it("returns 400 when q param is missing", async () => {
    const response = await request(app).get("/api/search");

    expect(response.status).toBe(400);
    expect(response.body.error).toBeDefined();
  });
});
