import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const mockSearchAssets = vi.hoisted(() => vi.fn());

vi.mock("../../repositories/assets.js", () => ({
  searchAssets: mockSearchAssets,
}));

import { createSearchRouter } from "../search.js";

describe("GET /api/search", () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use("/api", createSearchRouter());

    mockSearchAssets.mockResolvedValue([
      { id: "USD", name: "US Dollar", symbol: "USD", category: "fiat" },
      { id: "AAPL", name: "Apple Inc.", symbol: "AAPL", category: "stock" },
      { id: "SPY", name: "SPDR S&P 500 ETF", symbol: "SPY", category: "etf" },
      { id: "bitcoin", name: "Bitcoin", symbol: "BTC", category: "crypto" },
    ]);
  });

  it("returns results from all categories ordered fiat → stock → etf → crypto", async () => {
    const response = await request(app).get("/api/search?q=bit");

    expect(response.status).toBe(200);
    expect(response.body.results).toHaveLength(4);
    expect(mockSearchAssets).toHaveBeenCalledWith("bit", undefined);
  });

  it("passes category filter to repository", async () => {
    mockSearchAssets.mockResolvedValue([
      { id: "bitcoin", name: "Bitcoin", symbol: "BTC", category: "crypto" },
    ]);

    const response = await request(app).get("/api/search?q=bit&category=crypto");

    expect(response.status).toBe(200);
    expect(mockSearchAssets).toHaveBeenCalledWith("bit", "crypto");
    expect(response.body.results.every((r: any) => r.category === "crypto")).toBe(true);
  });

  it("returns 400 when q param is missing", async () => {
    const response = await request(app).get("/api/search");

    expect(response.status).toBe(400);
    expect(response.body.error).toBeDefined();
  });
});
