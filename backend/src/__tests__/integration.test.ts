import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.stubEnv("JWT_SECRET", "test-secret");
vi.stubEnv("JWT_REFRESH_SECRET", "test-refresh-secret");

// --- Mock repositories ---

const mockCreateAnonymousUser = vi.hoisted(() => vi.fn());
const mockFindOrCreateAppleUser = vi.hoisted(() => vi.fn());
const mockMergeAnonymousIntoApple = vi.hoisted(() => vi.fn());
const mockDeleteUser = vi.hoisted(() => vi.fn());

const mockGetOrCreateSettings = vi.hoisted(() => vi.fn());
const mockUpdateSettings = vi.hoisted(() => vi.fn());

const mockGetUserAssets = vi.hoisted(() => vi.fn());
const mockCreateAsset = vi.hoisted(() => vi.fn());
const mockUpdateAsset = vi.hoisted(() => vi.fn());
const mockDeleteAsset = vi.hoisted(() => vi.fn());

const mockGetTransactions = vi.hoisted(() => vi.fn());
const mockCreateTransaction = vi.hoisted(() => vi.fn());
const mockDeleteTransaction = vi.hoisted(() => vi.fn());

vi.mock("../repositories/users.js", () => ({
  createAnonymousUser: mockCreateAnonymousUser,
  findOrCreateAppleUser: mockFindOrCreateAppleUser,
  mergeAnonymousIntoApple: mockMergeAnonymousIntoApple,
  deleteUser: mockDeleteUser,
}));

vi.mock("../repositories/userSettings.js", () => ({
  getOrCreateSettings: mockGetOrCreateSettings,
  updateSettings: mockUpdateSettings,
}));

vi.mock("../repositories/userAssets.js", () => ({
  getUserAssets: mockGetUserAssets,
  createAsset: mockCreateAsset,
  updateAsset: mockUpdateAsset,
  deleteAsset: mockDeleteAsset,
}));

vi.mock("../repositories/userTransactions.js", () => ({
  getTransactions: mockGetTransactions,
  createTransaction: mockCreateTransaction,
  deleteTransaction: mockDeleteTransaction,
}));

vi.mock("apple-signin-auth", () => ({
  default: {
    verifyIdToken: vi.fn().mockResolvedValue({ sub: "apple-user-001" }),
  },
}));

describe("integration: full user lifecycle", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());

    const { createAuthRouter } = await import("../routes/auth.js");
    const { authMiddleware } = await import("../middleware/auth.js");
    const { createUserRouter } = await import("../routes/user.js");

    app.use("/api/auth", createAuthRouter());
    app.use("/api/user", authMiddleware, createUserRouter());
  });

  it("anonymous signup → create asset → add transaction → list assets → delete account", async () => {
    const userId = "integration-user-id";
    const assetId = "btc-asset-id";
    const txId = "tx-001";

    // Step 1: Anonymous signup
    mockCreateAnonymousUser.mockResolvedValue(userId);

    const signupRes = await request(app).post("/api/auth/anonymous");

    expect(signupRes.status).toBe(200);
    expect(signupRes.body.userId).toBe(userId);
    expect(signupRes.body.accessToken).toBeTruthy();
    expect(signupRes.body.refreshToken).toBeTruthy();

    const { accessToken } = signupRes.body;

    // Step 2: Create Bitcoin asset
    const bitcoinAsset = {
      id: assetId,
      name: "Bitcoin",
      symbol: "bitcoin",
      ticker: "BTC",
      category: "crypto",
      amount: 0,
      currentAmount: 0,
      createdAt: new Date().toISOString(),
    };
    mockCreateAsset.mockResolvedValue(bitcoinAsset);

    const createAssetRes = await request(app)
      .post("/api/user/assets")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Bitcoin", symbol: "bitcoin", ticker: "BTC", category: "crypto", amount: 0 });

    expect(createAssetRes.status).toBe(201);
    expect(createAssetRes.body.asset.name).toBe("Bitcoin");
    expect(createAssetRes.body.asset.symbol).toBe("bitcoin");
    expect(createAssetRes.body.asset.id).toBe(assetId);

    // Step 3: Add 0.5 BTC transaction
    const transaction = {
      id: txId,
      userId,
      assetId,
      type: "delta",
      amount: 0.5,
      note: null,
      date: "2025-06-15T00:00:00Z",
      createdAt: new Date().toISOString(),
    };
    mockCreateTransaction.mockResolvedValue(transaction);

    const addTxRes = await request(app)
      .post(`/api/user/assets/${assetId}/transactions`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ type: "delta", amount: 0.5, date: "2025-06-15T00:00:00Z" });

    expect(addTxRes.status).toBe(201);
    expect(addTxRes.body.transaction.amount).toBe(0.5);
    expect(addTxRes.body.transaction.type).toBe("delta");

    // Step 4: List assets — verify currentAmount reflects the transaction
    mockGetUserAssets.mockResolvedValue([
      { ...bitcoinAsset, currentAmount: 0.5 },
    ]);

    const listAssetsRes = await request(app)
      .get("/api/user/assets")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(listAssetsRes.status).toBe(200);
    expect(listAssetsRes.body.assets).toHaveLength(1);
    expect(listAssetsRes.body.assets[0].name).toBe("Bitcoin");
    expect(listAssetsRes.body.assets[0].currentAmount).toBe(0.5);

    // Step 5: Delete account
    mockDeleteUser.mockResolvedValue(undefined);

    const deleteRes = await request(app)
      .delete("/api/user/account")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.message).toBe("Account deleted");
    expect(mockDeleteUser).toHaveBeenCalledWith(userId);
  });
});
