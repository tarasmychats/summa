import { describe, it, expect, vi, beforeEach } from "vitest";

vi.stubEnv("JWT_SECRET", "test-secret-key-for-testing-only");
vi.stubEnv("JWT_REFRESH_SECRET", "test-refresh-secret-key-for-testing");

describe("auth service", () => {
  let generateTokens: (userId: string, authType: string) => { accessToken: string; refreshToken: string };
  let verifyAccessToken: (token: string) => { userId: string; authType: string };
  let verifyRefreshToken: (token: string) => { userId: string; authType: string };

  beforeEach(async () => {
    const authService = await import("../auth.js");
    generateTokens = authService.generateTokens;
    verifyAccessToken = authService.verifyAccessToken;
    verifyRefreshToken = authService.verifyRefreshToken;
  });

  it("generates access and refresh tokens", () => {
    const tokens = generateTokens("user-123", "anonymous");
    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();
    expect(tokens.accessToken).not.toEqual(tokens.refreshToken);
  });

  it("verifies a valid access token", () => {
    const tokens = generateTokens("user-123", "anonymous");
    const payload = verifyAccessToken(tokens.accessToken);
    expect(payload.userId).toBe("user-123");
    expect(payload.authType).toBe("anonymous");
  });

  it("verifies a valid refresh token", () => {
    const tokens = generateTokens("user-456", "apple");
    const payload = verifyRefreshToken(tokens.refreshToken);
    expect(payload.userId).toBe("user-456");
    expect(payload.authType).toBe("apple");
  });

  it("throws on invalid access token", () => {
    expect(() => verifyAccessToken("invalid-token")).toThrow();
  });

  it("rejects refresh token used as access token", () => {
    const tokens = generateTokens("user-123", "anonymous");
    expect(() => verifyAccessToken(tokens.refreshToken)).toThrow();
  });
});
