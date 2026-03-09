import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

vi.stubEnv("JWT_SECRET", "test-secret-key-for-testing-only");
vi.stubEnv("JWT_REFRESH_SECRET", "test-refresh-secret-key-for-testing");

describe("auth middleware", () => {
  let authMiddleware: (req: Request, res: Response, next: NextFunction) => void;
  let generateTokens: (userId: string, authType: string) => { accessToken: string; refreshToken: string };

  beforeEach(async () => {
    const middleware = await import("../auth.js");
    authMiddleware = middleware.authMiddleware;
    const authService = await import("../../services/auth.js");
    generateTokens = authService.generateTokens;
  });

  function mockReqResNext(authHeader?: string) {
    const req = { headers: { authorization: authHeader } } as unknown as Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;
    const next = vi.fn() as NextFunction;
    return { req, res, next };
  }

  it("passes with valid token and sets userId on request", () => {
    const tokens = generateTokens("user-123", "anonymous");
    const { req, res, next } = mockReqResNext(`Bearer ${tokens.accessToken}`);

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect((req as any).userId).toBe("user-123");
  });

  it("rejects request with no auth header", () => {
    const { req, res, next } = mockReqResNext();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects request with invalid token", () => {
    const { req, res, next } = mockReqResNext("Bearer invalid-token");

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
