import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.stubEnv("JWT_SECRET", "test-secret");
vi.stubEnv("JWT_REFRESH_SECRET", "test-refresh-secret");

const mockGetOrCreateSettings = vi.hoisted(() => vi.fn());
const mockUpdateSettings = vi.hoisted(() => vi.fn());
const mockGetUserAssets = vi.hoisted(() => vi.fn());
const mockCreateAsset = vi.hoisted(() => vi.fn());
const mockUpdateAsset = vi.hoisted(() => vi.fn());
const mockDeleteAsset = vi.hoisted(() => vi.fn());
const mockGetTransactions = vi.hoisted(() => vi.fn());
const mockCreateTransaction = vi.hoisted(() => vi.fn());
const mockDeleteTransaction = vi.hoisted(() => vi.fn());
const mockDeleteUser = vi.hoisted(() => vi.fn());

vi.mock("../../repositories/userSettings.js", () => ({
  getOrCreateSettings: mockGetOrCreateSettings,
  updateSettings: mockUpdateSettings,
}));
vi.mock("../../repositories/userAssets.js", () => ({
  getUserAssets: mockGetUserAssets,
  createAsset: mockCreateAsset,
  updateAsset: mockUpdateAsset,
  deleteAsset: mockDeleteAsset,
}));
vi.mock("../../repositories/userTransactions.js", () => ({
  getTransactions: mockGetTransactions,
  createTransaction: mockCreateTransaction,
  deleteTransaction: mockDeleteTransaction,
}));
vi.mock("../../repositories/users.js", () => ({
  deleteUser: mockDeleteUser,
}));

import { generateTokens } from "../../services/auth.js";

describe("user routes", () => {
  let app: express.Express;
  let token: string;
  const userId = "test-user-id";

  beforeEach(async () => {
    vi.clearAllMocks();
    token = generateTokens(userId, "anonymous").accessToken;
    app = express();
    app.use(express.json());
    const { authMiddleware } = await import("../../middleware/auth.js");
    const { createUserRouter } = await import("../user.js");
    app.use("/api/user", authMiddleware, createUserRouter());
  });

  describe("GET /api/user/settings", () => {
    it("returns user settings", async () => {
      mockGetOrCreateSettings.mockResolvedValue({
        id: "s1", userId, displayCurrency: "USD", isPremium: false,
      });

      const res = await request(app)
        .get("/api/user/settings")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.displayCurrency).toBe("USD");
    });
  });

  describe("GET /api/user/assets", () => {
    it("returns user assets with currentAmount", async () => {
      mockGetUserAssets.mockResolvedValue([
        { id: "a1", name: "Bitcoin", symbol: "bitcoin", ticker: "BTC", category: "crypto", amount: 1, currentAmount: 1.5, createdAt: new Date() },
      ]);

      const res = await request(app)
        .get("/api/user/assets")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.assets).toHaveLength(1);
      expect(res.body.assets[0].currentAmount).toBe(1.5);
    });
  });

  describe("POST /api/user/assets", () => {
    it("creates an asset", async () => {
      const newAsset = { id: "a1", name: "Ethereum", symbol: "ethereum", ticker: "ETH", category: "crypto", amount: 10, currentAmount: 10, createdAt: new Date() };
      mockCreateAsset.mockResolvedValue(newAsset);

      const res = await request(app)
        .post("/api/user/assets")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Ethereum", symbol: "ethereum", ticker: "ETH", category: "crypto", amount: 10 });

      expect(res.status).toBe(201);
      expect(res.body.asset.name).toBe("Ethereum");
    });

    it("returns 400 for missing fields", async () => {
      const res = await request(app)
        .post("/api/user/assets")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Bitcoin" });

      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /api/user/assets/:id", () => {
    it("deletes asset", async () => {
      mockDeleteAsset.mockResolvedValue(true);

      const res = await request(app)
        .delete("/api/user/assets/a1")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
    });

    it("returns 404 for non-existent asset", async () => {
      mockDeleteAsset.mockResolvedValue(false);

      const res = await request(app)
        .delete("/api/user/assets/nonexistent")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/user/assets/:id/transactions", () => {
    it("creates a transaction", async () => {
      const tx = { id: "t1", userId, assetId: "a1", type: "delta", amount: 0.5, note: null, date: new Date(), createdAt: new Date() };
      mockCreateTransaction.mockResolvedValue(tx);

      const res = await request(app)
        .post("/api/user/assets/a1/transactions")
        .set("Authorization", `Bearer ${token}`)
        .send({ type: "delta", amount: 0.5, date: "2025-06-15T00:00:00Z" });

      expect(res.status).toBe(201);
      expect(res.body.transaction.amount).toBe(0.5);
    });
  });

  describe("DELETE /api/user/account", () => {
    it("deletes user account", async () => {
      mockDeleteUser.mockResolvedValue(undefined);

      const res = await request(app)
        .delete("/api/user/account")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
    });
  });

  describe("unauthenticated requests", () => {
    it("rejects requests without token", async () => {
      const res = await request(app).get("/api/user/settings");
      expect(res.status).toBe(401);
    });
  });
});
