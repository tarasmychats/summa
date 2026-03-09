import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "dev-refresh-secret-change-me";
const ACCESS_TOKEN_EXPIRY = "1h";
const REFRESH_TOKEN_EXPIRY = "30d";

interface TokenPayload {
  userId: string;
  authType: string;
  tokenType: "access" | "refresh";
}

export function generateTokens(userId: string, authType: string) {
  const accessToken = jwt.sign(
    { userId, authType, tokenType: "access" } as TokenPayload,
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );

  const refreshToken = jwt.sign(
    { userId, authType, tokenType: "refresh" } as TokenPayload,
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );

  return { accessToken, refreshToken };
}

export function verifyAccessToken(token: string): { userId: string; authType: string } {
  const payload = jwt.verify(token, JWT_SECRET) as TokenPayload;
  if (payload.tokenType !== "access") {
    throw new Error("Invalid token type");
  }
  return { userId: payload.userId, authType: payload.authType };
}

export function verifyRefreshToken(token: string): { userId: string; authType: string } {
  const payload = jwt.verify(token, JWT_REFRESH_SECRET) as TokenPayload;
  if (payload.tokenType !== "refresh") {
    throw new Error("Invalid token type");
  }
  return { userId: payload.userId, authType: payload.authType };
}
