import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.stubEnv("JWT_SECRET", "test-secret");
vi.stubEnv("JWT_REFRESH_SECRET", "test-refresh-secret");

const mockCreateAnonymousUser = vi.hoisted(() => vi.fn());
const mockFindOrCreateAppleUser = vi.hoisted(() => vi.fn());
const mockMergeAnonymousIntoApple = vi.hoisted(() => vi.fn());

vi.mock("../../repositories/users.js", () => ({
  createAnonymousUser: mockCreateAnonymousUser,
  findOrCreateAppleUser: mockFindOrCreateAppleUser,
  mergeAnonymousIntoApple: mockMergeAnonymousIntoApple,
}));

vi.mock("apple-signin-auth", () => ({
  default: {
    verifyIdToken: vi.fn().mockResolvedValue({ sub: "apple-user-001" }),
  },
}));

describe("auth routes", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    const { createAuthRouter } = await import("../auth.js");
    app.use("/api/auth", createAuthRouter());
  });

  describe("POST /api/auth/anonymous", () => {
    it("creates anonymous user and returns tokens", async () => {
      mockCreateAnonymousUser.mockResolvedValue("new-user-id");

      const res = await request(app).post("/api/auth/anonymous");

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeTruthy();
      expect(res.body.refreshToken).toBeTruthy();
      expect(res.body.userId).toBe("new-user-id");
    });
  });

  describe("POST /api/auth/apple", () => {
    it("returns 400 without identityToken", async () => {
      const res = await request(app).post("/api/auth/apple").send({});
      expect(res.status).toBe(400);
    });

    it("creates or finds apple user and returns tokens", async () => {
      mockFindOrCreateAppleUser.mockResolvedValue({ userId: "apple-user-id", created: true });

      const res = await request(app)
        .post("/api/auth/apple")
        .send({ identityToken: "valid-apple-token" });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeTruthy();
      expect(res.body.userId).toBe("apple-user-id");
    });
  });

  describe("POST /api/auth/refresh", () => {
    it("returns new access token for valid refresh token", async () => {
      mockCreateAnonymousUser.mockResolvedValue("user-for-refresh");
      const createRes = await request(app).post("/api/auth/anonymous");
      const { refreshToken } = createRes.body;

      const res = await request(app)
        .post("/api/auth/refresh")
        .send({ refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeTruthy();
    });

    it("returns 400 without refreshToken", async () => {
      const res = await request(app).post("/api/auth/refresh").send({});
      expect(res.status).toBe(400);
    });
  });
});
