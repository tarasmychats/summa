# Backend User Data Migration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move all user data (assets, transactions, settings) from on-device SwiftData/CloudKit to the Express + PostgreSQL backend with JWT authentication.

**Architecture:** Extend the existing Express backend with user tables, auth middleware, and CRUD endpoints. iOS drops SwiftData, becomes a thin client. Two auth modes: anonymous device tokens and Apple Sign In with auto-merge.

**Tech Stack:** Express 5, PostgreSQL, jsonwebtoken, apple-signin-auth, express-rate-limit, Swift Keychain

**Design doc:** `docs/plans/2026-03-09-backend-user-data-design.md`

---

## Task 1: Install Backend Dependencies

**Files:**
- Modify: `backend/package.json`

**Step 1: Install new packages**

Run:
```bash
cd backend && npm install jsonwebtoken apple-signin-auth express-rate-limit
```

**Step 2: Install type definitions**

Run:
```bash
cd backend && npm install -D @types/jsonwebtoken
```

**Step 3: Add JWT secret to .env.example**

Modify: `backend/.env.example` — add:
```
JWT_SECRET=your-jwt-secret-here
JWT_REFRESH_SECRET=your-refresh-secret-here
APPLE_CLIENT_ID=your-apple-bundle-id
```

**Step 4: Add JWT secrets to local .env**

Generate random secrets and add to `backend/.env`:
```
JWT_SECRET=<random-64-char-hex>
JWT_REFRESH_SECRET=<random-64-char-hex>
APPLE_CLIENT_ID=com.yourapp.summa
```

**Step 5: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/.env.example
git commit -m "chore: add auth dependencies (jsonwebtoken, apple-signin-auth, express-rate-limit)"
```

---

## Task 2: Database Schema — User Tables

**Files:**
- Modify: `backend/src/db.ts`

**Step 1: Write failing test for schema creation**

Create: `backend/src/__tests__/db.schema.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuery = vi.hoisted(() => vi.fn());
const mockEnd = vi.hoisted(() => vi.fn());

vi.mock("pg", () => ({
  default: {
    Pool: vi.fn(() => ({
      query: mockQuery,
      end: mockEnd,
      on: vi.fn(),
    })),
  },
}));

describe("database schema", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] });
  });

  it("creates users table", async () => {
    const { initializeDatabase } = await import("../db.js");
    await initializeDatabase();

    const allSql = mockQuery.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(allSql).toContain("CREATE TABLE IF NOT EXISTS users");
    expect(allSql).toContain("apple_user_id");
    expect(allSql).toContain("auth_type");
  });

  it("creates user_settings table", async () => {
    const { initializeDatabase } = await import("../db.js");
    await initializeDatabase();

    const allSql = mockQuery.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(allSql).toContain("CREATE TABLE IF NOT EXISTS user_settings");
    expect(allSql).toContain("display_currency");
    expect(allSql).toContain("is_premium");
  });

  it("creates user_assets table", async () => {
    const { initializeDatabase } = await import("../db.js");
    await initializeDatabase();

    const allSql = mockQuery.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(allSql).toContain("CREATE TABLE IF NOT EXISTS user_assets");
    expect(allSql).toContain("symbol");
    expect(allSql).toContain("ticker");
    expect(allSql).toContain("category");
  });

  it("creates user_transactions table", async () => {
    const { initializeDatabase } = await import("../db.js");
    await initializeDatabase();

    const allSql = mockQuery.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(allSql).toContain("CREATE TABLE IF NOT EXISTS user_transactions");
    expect(allSql).toContain("asset_id");
    expect(allSql).toContain("type");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- src/__tests__/db.schema.test.ts`
Expected: FAIL — initializeDatabase doesn't create user tables yet

**Step 3: Add user tables to db.ts**

Modify: `backend/src/db.ts` — add these CREATE TABLE statements inside `initializeDatabase()`, after the existing table creations:

```typescript
await pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    apple_user_id VARCHAR UNIQUE,
    auth_type VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS user_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    display_currency VARCHAR DEFAULT 'USD',
    is_premium BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id)
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS user_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR NOT NULL,
    symbol VARCHAR NOT NULL,
    ticker VARCHAR NOT NULL,
    category VARCHAR NOT NULL,
    amount DOUBLE PRECISION DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS user_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    asset_id UUID REFERENCES user_assets(id) ON DELETE CASCADE,
    type VARCHAR NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    note TEXT,
    date TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  )
`);
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- src/__tests__/db.schema.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/db.ts backend/src/__tests__/db.schema.test.ts
git commit -m "feat: add users, user_settings, user_assets, user_transactions tables"
```

---

## Task 3: Auth Service — JWT Signing & Verification

**Files:**
- Create: `backend/src/services/auth.ts`
- Create: `backend/src/services/__tests__/auth.test.ts`

**Step 1: Write failing tests**

Create: `backend/src/services/__tests__/auth.test.ts`

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- src/services/__tests__/auth.test.ts`
Expected: FAIL — module doesn't exist

**Step 3: Implement auth service**

Create: `backend/src/services/auth.ts`

```typescript
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
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- src/services/__tests__/auth.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/services/auth.ts backend/src/services/__tests__/auth.test.ts
git commit -m "feat: add JWT auth service with token generation and verification"
```

---

## Task 4: Auth Middleware

**Files:**
- Create: `backend/src/middleware/auth.ts`
- Create: `backend/src/middleware/__tests__/auth.test.ts`

**Step 1: Write failing tests**

Create: `backend/src/middleware/__tests__/auth.test.ts`

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- src/middleware/__tests__/auth.test.ts`
Expected: FAIL — module doesn't exist

**Step 3: Implement auth middleware**

Create: `backend/src/middleware/auth.ts`

```typescript
import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../services/auth.js";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- src/middleware/__tests__/auth.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/middleware/auth.ts backend/src/middleware/__tests__/auth.test.ts
git commit -m "feat: add JWT auth middleware"
```

---

## Task 5: Users Repository

**Files:**
- Create: `backend/src/repositories/users.ts`
- Create: `backend/src/repositories/__tests__/users.test.ts`

**Step 1: Write failing tests**

Create: `backend/src/repositories/__tests__/users.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuery = vi.hoisted(() => vi.fn());

vi.mock("../../db.js", () => ({
  query: mockQuery,
}));

describe("users repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createAnonymousUser", () => {
    it("inserts anonymous user and returns id", async () => {
      const userId = "550e8400-e29b-41d4-a716-446655440000";
      mockQuery.mockResolvedValue({ rows: [{ id: userId }] });

      const { createAnonymousUser } = await import("../users.js");
      const result = await createAnonymousUser();

      expect(result).toBe(userId);
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain("INSERT INTO users");
      expect(sql).toContain("anonymous");
    });
  });

  describe("findOrCreateAppleUser", () => {
    it("returns existing user if apple_user_id found", async () => {
      const userId = "existing-user-id";
      mockQuery.mockResolvedValueOnce({ rows: [{ id: userId, auth_type: "apple" }] });

      const { findOrCreateAppleUser } = await import("../users.js");
      const result = await findOrCreateAppleUser("apple-sub-123");

      expect(result.userId).toBe(userId);
      expect(result.created).toBe(false);
    });

    it("creates new user if apple_user_id not found", async () => {
      const newId = "new-user-id";
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: newId }] });

      const { findOrCreateAppleUser } = await import("../users.js");
      const result = await findOrCreateAppleUser("apple-sub-456");

      expect(result.userId).toBe(newId);
      expect(result.created).toBe(true);
    });
  });

  describe("mergeAnonymousIntoApple", () => {
    it("transfers assets and transactions then deletes anonymous user", async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const { mergeAnonymousIntoApple } = await import("../users.js");
      await mergeAnonymousIntoApple("anon-id", "apple-id");

      const calls = mockQuery.mock.calls;
      const allSql = calls.map((c: unknown[]) => c[0]).join("\n");
      expect(allSql).toContain("UPDATE user_assets SET user_id");
      expect(allSql).toContain("UPDATE user_transactions SET user_id");
      expect(allSql).toContain("DELETE FROM users WHERE id");
    });
  });

  describe("deleteUser", () => {
    it("deletes user by id", async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const { deleteUser } = await import("../users.js");
      await deleteUser("user-to-delete");

      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain("DELETE FROM users");
      expect(params).toContain("user-to-delete");
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- src/repositories/__tests__/users.test.ts`
Expected: FAIL — module doesn't exist

**Step 3: Implement users repository**

Create: `backend/src/repositories/users.ts`

```typescript
import { query } from "../db.js";

export async function createAnonymousUser(): Promise<string> {
  const result = await query(
    `INSERT INTO users (auth_type) VALUES ('anonymous') RETURNING id`,
    []
  );
  return result.rows[0].id;
}

export async function findOrCreateAppleUser(
  appleUserId: string
): Promise<{ userId: string; created: boolean }> {
  const existing = await query(
    `SELECT id, auth_type FROM users WHERE apple_user_id = $1`,
    [appleUserId]
  );

  if (existing.rows.length > 0) {
    return { userId: existing.rows[0].id, created: false };
  }

  const result = await query(
    `INSERT INTO users (apple_user_id, auth_type) VALUES ($1, 'apple') RETURNING id`,
    [appleUserId]
  );
  return { userId: result.rows[0].id, created: true };
}

export async function mergeAnonymousIntoApple(
  anonymousUserId: string,
  appleUserId: string
): Promise<void> {
  await query(
    `UPDATE user_transactions SET user_id = $1 WHERE user_id = $2`,
    [appleUserId, anonymousUserId]
  );
  await query(
    `UPDATE user_assets SET user_id = $1 WHERE user_id = $2`,
    [appleUserId, anonymousUserId]
  );
  await query(
    `DELETE FROM user_settings WHERE user_id = $1`,
    [anonymousUserId]
  );
  await query(
    `DELETE FROM users WHERE id = $1`,
    [anonymousUserId]
  );
}

export async function deleteUser(userId: string): Promise<void> {
  await query(`DELETE FROM users WHERE id = $1`, [userId]);
}
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- src/repositories/__tests__/users.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/repositories/users.ts backend/src/repositories/__tests__/users.test.ts
git commit -m "feat: add users repository (create, find, merge, delete)"
```

---

## Task 6: User Settings Repository

**Files:**
- Create: `backend/src/repositories/userSettings.ts`
- Create: `backend/src/repositories/__tests__/userSettings.test.ts`

**Step 1: Write failing tests**

Create: `backend/src/repositories/__tests__/userSettings.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuery = vi.hoisted(() => vi.fn());

vi.mock("../../db.js", () => ({
  query: mockQuery,
}));

describe("userSettings repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getOrCreateSettings", () => {
    it("returns existing settings", async () => {
      mockQuery.mockResolvedValue({
        rows: [{ id: "s1", user_id: "u1", display_currency: "EUR", is_premium: true }],
      });

      const { getOrCreateSettings } = await import("../userSettings.js");
      const result = await getOrCreateSettings("u1");

      expect(result.displayCurrency).toBe("EUR");
      expect(result.isPremium).toBe(true);
    });

    it("creates default settings if none exist", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: "s2", user_id: "u2", display_currency: "USD", is_premium: false }],
        });

      const { getOrCreateSettings } = await import("../userSettings.js");
      const result = await getOrCreateSettings("u2");

      expect(result.displayCurrency).toBe("USD");
      expect(result.isPremium).toBe(false);
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe("updateSettings", () => {
    it("updates display_currency", async () => {
      mockQuery.mockResolvedValue({
        rows: [{ id: "s1", user_id: "u1", display_currency: "UAH", is_premium: false }],
      });

      const { updateSettings } = await import("../userSettings.js");
      await updateSettings("u1", { displayCurrency: "UAH" });

      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain("UPDATE user_settings");
      expect(sql).toContain("display_currency");
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- src/repositories/__tests__/userSettings.test.ts`
Expected: FAIL

**Step 3: Implement user settings repository**

Create: `backend/src/repositories/userSettings.ts`

```typescript
import { query } from "../db.js";

export interface UserSettingsRow {
  id: string;
  userId: string;
  displayCurrency: string;
  isPremium: boolean;
}

export async function getOrCreateSettings(userId: string): Promise<UserSettingsRow> {
  const existing = await query(
    `SELECT id, user_id, display_currency, is_premium FROM user_settings WHERE user_id = $1`,
    [userId]
  );

  if (existing.rows.length > 0) {
    return mapRow(existing.rows[0]);
  }

  const created = await query(
    `INSERT INTO user_settings (user_id) VALUES ($1) RETURNING id, user_id, display_currency, is_premium`,
    [userId]
  );
  return mapRow(created.rows[0]);
}

export async function updateSettings(
  userId: string,
  updates: { displayCurrency?: string; isPremium?: boolean }
): Promise<UserSettingsRow> {
  const sets: string[] = [];
  const params: (string | boolean)[] = [];
  let paramIndex = 1;

  if (updates.displayCurrency !== undefined) {
    sets.push(`display_currency = $${paramIndex++}`);
    params.push(updates.displayCurrency);
  }
  if (updates.isPremium !== undefined) {
    sets.push(`is_premium = $${paramIndex++}`);
    params.push(updates.isPremium);
  }
  sets.push(`updated_at = NOW()`);
  params.push(userId);

  const result = await query(
    `UPDATE user_settings SET ${sets.join(", ")} WHERE user_id = $${paramIndex} RETURNING id, user_id, display_currency, is_premium`,
    params
  );
  return mapRow(result.rows[0]);
}

function mapRow(row: any): UserSettingsRow {
  return {
    id: row.id,
    userId: row.user_id,
    displayCurrency: row.display_currency,
    isPremium: row.is_premium,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- src/repositories/__tests__/userSettings.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/repositories/userSettings.ts backend/src/repositories/__tests__/userSettings.test.ts
git commit -m "feat: add user settings repository (get/create/update)"
```

---

## Task 7: User Assets Repository

**Files:**
- Create: `backend/src/repositories/userAssets.ts`
- Create: `backend/src/repositories/__tests__/userAssets.test.ts`

**Step 1: Write failing tests**

Create: `backend/src/repositories/__tests__/userAssets.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuery = vi.hoisted(() => vi.fn());

vi.mock("../../db.js", () => ({
  query: mockQuery,
}));

describe("userAssets repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getUserAssets", () => {
    it("returns assets with computed currentAmount", async () => {
      mockQuery.mockResolvedValue({
        rows: [
          {
            id: "a1", user_id: "u1", name: "Bitcoin", symbol: "bitcoin",
            ticker: "BTC", category: "crypto", amount: 1.0,
            current_amount: 1.5, created_at: new Date(),
          },
        ],
      });

      const { getUserAssets } = await import("../userAssets.js");
      const assets = await getUserAssets("u1");

      expect(assets).toHaveLength(1);
      expect(assets[0].symbol).toBe("bitcoin");
      expect(assets[0].currentAmount).toBe(1.5);

      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain("user_transactions");
      expect(sql).toContain("current_amount");
    });
  });

  describe("createAsset", () => {
    it("inserts asset and returns it", async () => {
      mockQuery.mockResolvedValue({
        rows: [{ id: "a1", user_id: "u1", name: "Ethereum", symbol: "ethereum", ticker: "ETH", category: "crypto", amount: 10, created_at: new Date() }],
      });

      const { createAsset } = await import("../userAssets.js");
      const asset = await createAsset("u1", {
        name: "Ethereum", symbol: "ethereum", ticker: "ETH", category: "crypto", amount: 10,
      });

      expect(asset.name).toBe("Ethereum");
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain("INSERT INTO user_assets");
    });
  });

  describe("deleteAsset", () => {
    it("deletes asset owned by user", async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: "a1" }] });

      const { deleteAsset } = await import("../userAssets.js");
      await deleteAsset("u1", "a1");

      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain("DELETE FROM user_assets");
      expect(params).toContain("u1");
      expect(params).toContain("a1");
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- src/repositories/__tests__/userAssets.test.ts`
Expected: FAIL

**Step 3: Implement user assets repository**

Create: `backend/src/repositories/userAssets.ts`

```typescript
import { query } from "../db.js";

export interface UserAssetRow {
  id: string;
  userId: string;
  name: string;
  symbol: string;
  ticker: string;
  category: string;
  amount: number;
  currentAmount: number;
  createdAt: Date;
}

export interface CreateAssetInput {
  name: string;
  symbol: string;
  ticker: string;
  category: string;
  amount: number;
}

export async function getUserAssets(userId: string): Promise<UserAssetRow[]> {
  const result = await query(
    `SELECT
      a.id, a.user_id, a.name, a.symbol, a.ticker, a.category, a.amount, a.created_at,
      a.amount + COALESCE(
        (SELECT SUM(t.amount) FROM user_transactions t WHERE t.asset_id = a.id),
        0
      ) AS current_amount
    FROM user_assets a
    WHERE a.user_id = $1
    ORDER BY a.created_at ASC`,
    [userId]
  );
  return result.rows.map(mapRow);
}

export async function createAsset(userId: string, input: CreateAssetInput): Promise<UserAssetRow> {
  const result = await query(
    `INSERT INTO user_assets (user_id, name, symbol, ticker, category, amount)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, user_id, name, symbol, ticker, category, amount, amount AS current_amount, created_at`,
    [userId, input.name, input.symbol, input.ticker, input.category, input.amount]
  );
  return mapRow(result.rows[0]);
}

export async function updateAsset(
  userId: string,
  assetId: string,
  updates: { name?: string; amount?: number }
): Promise<UserAssetRow | null> {
  const sets: string[] = [];
  const params: (string | number)[] = [];
  let paramIndex = 1;

  if (updates.name !== undefined) {
    sets.push(`name = $${paramIndex++}`);
    params.push(updates.name);
  }
  if (updates.amount !== undefined) {
    sets.push(`amount = $${paramIndex++}`);
    params.push(updates.amount);
  }
  if (sets.length === 0) return null;

  sets.push(`updated_at = NOW()`);
  params.push(userId, assetId);

  const result = await query(
    `UPDATE user_assets SET ${sets.join(", ")}
     WHERE user_id = $${paramIndex} AND id = $${paramIndex + 1}
     RETURNING id, user_id, name, symbol, ticker, category, amount, amount AS current_amount, created_at`,
    params
  );
  return result.rows.length > 0 ? mapRow(result.rows[0]) : null;
}

export async function deleteAsset(userId: string, assetId: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM user_assets WHERE user_id = $1 AND id = $2 RETURNING id`,
    [userId, assetId]
  );
  return result.rows.length > 0;
}

function mapRow(row: any): UserAssetRow {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    symbol: row.symbol,
    ticker: row.ticker,
    category: row.category,
    amount: parseFloat(row.amount),
    currentAmount: parseFloat(row.current_amount),
    createdAt: row.created_at,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- src/repositories/__tests__/userAssets.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/repositories/userAssets.ts backend/src/repositories/__tests__/userAssets.test.ts
git commit -m "feat: add user assets repository with currentAmount computation"
```

---

## Task 8: User Transactions Repository

**Files:**
- Create: `backend/src/repositories/userTransactions.ts`
- Create: `backend/src/repositories/__tests__/userTransactions.test.ts`

**Step 1: Write failing tests**

Create: `backend/src/repositories/__tests__/userTransactions.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuery = vi.hoisted(() => vi.fn());

vi.mock("../../db.js", () => ({
  query: mockQuery,
}));

describe("userTransactions repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getTransactions", () => {
    it("returns transactions for an asset owned by user", async () => {
      mockQuery.mockResolvedValue({
        rows: [
          { id: "t1", user_id: "u1", asset_id: "a1", type: "delta", amount: 0.5, note: "bought more", date: new Date(), created_at: new Date() },
        ],
      });

      const { getTransactions } = await import("../userTransactions.js");
      const txs = await getTransactions("u1", "a1");

      expect(txs).toHaveLength(1);
      expect(txs[0].amount).toBe(0.5);
      expect(txs[0].type).toBe("delta");
    });
  });

  describe("createTransaction", () => {
    it("inserts transaction linked to asset and user", async () => {
      mockQuery.mockResolvedValue({
        rows: [{ id: "t1", user_id: "u1", asset_id: "a1", type: "delta", amount: -0.2, note: null, date: new Date(), created_at: new Date() }],
      });

      const { createTransaction } = await import("../userTransactions.js");
      const tx = await createTransaction("u1", "a1", {
        type: "delta", amount: -0.2, date: new Date().toISOString(),
      });

      expect(tx.amount).toBe(-0.2);
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain("INSERT INTO user_transactions");
    });
  });

  describe("deleteTransaction", () => {
    it("deletes transaction owned by user", async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: "t1" }] });

      const { deleteTransaction } = await import("../userTransactions.js");
      const deleted = await deleteTransaction("u1", "t1");

      expect(deleted).toBe(true);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain("DELETE FROM user_transactions");
      expect(params).toContain("u1");
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- src/repositories/__tests__/userTransactions.test.ts`
Expected: FAIL

**Step 3: Implement user transactions repository**

Create: `backend/src/repositories/userTransactions.ts`

```typescript
import { query } from "../db.js";

export interface UserTransactionRow {
  id: string;
  userId: string;
  assetId: string;
  type: string;
  amount: number;
  note: string | null;
  date: Date;
  createdAt: Date;
}

export interface CreateTransactionInput {
  type: string;
  amount: number;
  date: string;
  note?: string;
}

export async function getTransactions(userId: string, assetId: string): Promise<UserTransactionRow[]> {
  const result = await query(
    `SELECT id, user_id, asset_id, type, amount, note, date, created_at
     FROM user_transactions
     WHERE user_id = $1 AND asset_id = $2
     ORDER BY date ASC`,
    [userId, assetId]
  );
  return result.rows.map(mapRow);
}

export async function createTransaction(
  userId: string,
  assetId: string,
  input: CreateTransactionInput
): Promise<UserTransactionRow> {
  const result = await query(
    `INSERT INTO user_transactions (user_id, asset_id, type, amount, note, date)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, user_id, asset_id, type, amount, note, date, created_at`,
    [userId, assetId, input.type, input.amount, input.note || null, input.date]
  );
  return mapRow(result.rows[0]);
}

export async function deleteTransaction(userId: string, transactionId: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM user_transactions WHERE user_id = $1 AND id = $2 RETURNING id`,
    [userId, transactionId]
  );
  return result.rows.length > 0;
}

function mapRow(row: any): UserTransactionRow {
  return {
    id: row.id,
    userId: row.user_id,
    assetId: row.asset_id,
    type: row.type,
    amount: parseFloat(row.amount),
    note: row.note,
    date: row.date,
    createdAt: row.created_at,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- src/repositories/__tests__/userTransactions.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/repositories/userTransactions.ts backend/src/repositories/__tests__/userTransactions.test.ts
git commit -m "feat: add user transactions repository"
```

---

## Task 9: Auth Routes

**Files:**
- Create: `backend/src/routes/auth.ts`
- Create: `backend/src/routes/__tests__/auth.test.ts`

**Step 1: Write failing tests**

Create: `backend/src/routes/__tests__/auth.test.ts`

```typescript
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

// Mock apple-signin-auth for Apple Sign In tests
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
      // First create a user to get valid tokens
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
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- src/routes/__tests__/auth.test.ts`
Expected: FAIL

**Step 3: Implement auth routes**

Create: `backend/src/routes/auth.ts`

```typescript
import { Router } from "express";
import appleSignin from "apple-signin-auth";
import { createAnonymousUser, findOrCreateAppleUser, mergeAnonymousIntoApple } from "../repositories/users.js";
import { generateTokens, verifyRefreshToken, verifyAccessToken } from "../services/auth.js";

export function createAuthRouter(): Router {
  const router = Router();

  router.post("/anonymous", async (req, res) => {
    try {
      const userId = await createAnonymousUser();
      const tokens = generateTokens(userId, "anonymous");
      res.json({ userId, ...tokens });
    } catch (error) {
      console.error("Failed to create anonymous user:", error);
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  router.post("/apple", async (req, res) => {
    const { identityToken } = req.body;
    if (!identityToken) {
      res.status(400).json({ error: "Missing identityToken" });
      return;
    }

    try {
      const applePayload = await appleSignin.verifyIdToken(identityToken, {
        audience: process.env.APPLE_CLIENT_ID,
      });
      const appleUserId = applePayload.sub;
      const { userId, created } = await findOrCreateAppleUser(appleUserId);
      const tokens = generateTokens(userId, "apple");
      res.json({ userId, created, ...tokens });
    } catch (error) {
      console.error("Apple sign-in failed:", error);
      res.status(401).json({ error: "Invalid Apple identity token" });
    }
  });

  router.post("/merge", async (req, res) => {
    const { anonymousToken, identityToken } = req.body;
    if (!anonymousToken || !identityToken) {
      res.status(400).json({ error: "Missing anonymousToken or identityToken" });
      return;
    }

    try {
      const anonPayload = verifyAccessToken(anonymousToken);
      const applePayload = await appleSignin.verifyIdToken(identityToken, {
        audience: process.env.APPLE_CLIENT_ID,
      });
      const { userId: appleUserId } = await findOrCreateAppleUser(applePayload.sub);
      await mergeAnonymousIntoApple(anonPayload.userId, appleUserId);
      const tokens = generateTokens(appleUserId, "apple");
      res.json({ userId: appleUserId, ...tokens });
    } catch (error) {
      console.error("Merge failed:", error);
      res.status(500).json({ error: "Failed to merge accounts" });
    }
  });

  router.post("/refresh", async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ error: "Missing refreshToken" });
      return;
    }

    try {
      const payload = verifyRefreshToken(refreshToken);
      const tokens = generateTokens(payload.userId, payload.authType);
      res.json({ accessToken: tokens.accessToken });
    } catch (error) {
      res.status(401).json({ error: "Invalid refresh token" });
    }
  });

  return router;
}
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- src/routes/__tests__/auth.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/routes/auth.ts backend/src/routes/__tests__/auth.test.ts
git commit -m "feat: add auth routes (anonymous, apple, merge, refresh)"
```

---

## Task 10: User Routes (Settings, Assets, Transactions)

**Files:**
- Create: `backend/src/routes/user.ts`
- Create: `backend/src/routes/__tests__/user.test.ts`

**Step 1: Write failing tests**

Create: `backend/src/routes/__tests__/user.test.ts`

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- src/routes/__tests__/user.test.ts`
Expected: FAIL

**Step 3: Implement user routes**

Create: `backend/src/routes/user.ts`

```typescript
import { Router } from "express";
import { getOrCreateSettings, updateSettings } from "../repositories/userSettings.js";
import { getUserAssets, createAsset, updateAsset, deleteAsset } from "../repositories/userAssets.js";
import { getTransactions, createTransaction, deleteTransaction } from "../repositories/userTransactions.js";
import { deleteUser } from "../repositories/users.js";

export function createUserRouter(): Router {
  const router = Router();

  // --- Settings ---

  router.get("/settings", async (req, res) => {
    try {
      const settings = await getOrCreateSettings(req.userId!);
      res.json(settings);
    } catch (error) {
      console.error("Failed to get settings:", error);
      res.status(500).json({ error: "Failed to get settings" });
    }
  });

  router.patch("/settings", async (req, res) => {
    try {
      const { displayCurrency, isPremium } = req.body;
      const settings = await updateSettings(req.userId!, { displayCurrency, isPremium });
      res.json(settings);
    } catch (error) {
      console.error("Failed to update settings:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // --- Assets ---

  router.get("/assets", async (req, res) => {
    try {
      const assets = await getUserAssets(req.userId!);
      res.json({ assets });
    } catch (error) {
      console.error("Failed to get assets:", error);
      res.status(500).json({ error: "Failed to get assets" });
    }
  });

  router.post("/assets", async (req, res) => {
    const { name, symbol, ticker, category, amount } = req.body;
    if (!name || !symbol || !ticker || !category) {
      res.status(400).json({ error: "Required: name, symbol, ticker, category" });
      return;
    }

    try {
      const asset = await createAsset(req.userId!, {
        name, symbol, ticker, category, amount: amount ?? 0,
      });
      res.status(201).json({ asset });
    } catch (error) {
      console.error("Failed to create asset:", error);
      res.status(500).json({ error: "Failed to create asset" });
    }
  });

  router.patch("/assets/:id", async (req, res) => {
    const { name, amount } = req.body;
    try {
      const asset = await updateAsset(req.userId!, req.params.id, { name, amount });
      if (!asset) {
        res.status(404).json({ error: "Asset not found" });
        return;
      }
      res.json({ asset });
    } catch (error) {
      console.error("Failed to update asset:", error);
      res.status(500).json({ error: "Failed to update asset" });
    }
  });

  router.delete("/assets/:id", async (req, res) => {
    try {
      const deleted = await deleteAsset(req.userId!, req.params.id);
      if (!deleted) {
        res.status(404).json({ error: "Asset not found" });
        return;
      }
      res.json({ message: "Asset deleted" });
    } catch (error) {
      console.error("Failed to delete asset:", error);
      res.status(500).json({ error: "Failed to delete asset" });
    }
  });

  // --- Transactions ---

  router.get("/assets/:id/transactions", async (req, res) => {
    try {
      const transactions = await getTransactions(req.userId!, req.params.id);
      res.json({ transactions });
    } catch (error) {
      console.error("Failed to get transactions:", error);
      res.status(500).json({ error: "Failed to get transactions" });
    }
  });

  router.post("/assets/:id/transactions", async (req, res) => {
    const { type, amount, date, note } = req.body;
    if (!type || amount === undefined || !date) {
      res.status(400).json({ error: "Required: type, amount, date" });
      return;
    }

    try {
      const transaction = await createTransaction(req.userId!, req.params.id, {
        type, amount, date, note,
      });
      res.status(201).json({ transaction });
    } catch (error) {
      console.error("Failed to create transaction:", error);
      res.status(500).json({ error: "Failed to create transaction" });
    }
  });

  router.delete("/assets/:id/transactions/:txId", async (req, res) => {
    try {
      const deleted = await deleteTransaction(req.userId!, req.params.txId);
      if (!deleted) {
        res.status(404).json({ error: "Transaction not found" });
        return;
      }
      res.json({ message: "Transaction deleted" });
    } catch (error) {
      console.error("Failed to delete transaction:", error);
      res.status(500).json({ error: "Failed to delete transaction" });
    }
  });

  // --- Account ---

  router.delete("/account", async (req, res) => {
    try {
      await deleteUser(req.userId!);
      res.json({ message: "Account deleted" });
    } catch (error) {
      console.error("Failed to delete account:", error);
      res.status(500).json({ error: "Failed to delete account" });
    }
  });

  return router;
}
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- src/routes/__tests__/user.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/routes/user.ts backend/src/routes/__tests__/user.test.ts
git commit -m "feat: add user routes (settings, assets, transactions, account deletion)"
```

---

## Task 11: Wire Routes into Express App

**Files:**
- Modify: `backend/src/index.ts`

**Step 1: Add imports and mount routes**

Add to `backend/src/index.ts`:

```typescript
import { createAuthRouter } from "./routes/auth.js";
import { createUserRouter } from "./routes/user.js";
import { authMiddleware } from "./middleware/auth.js";
import rateLimit from "express-rate-limit";
```

Mount after existing routes:

```typescript
// Rate limit auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: "Too many auth requests, try again later" },
});

app.use("/api/auth", authLimiter, createAuthRouter());
app.use("/api/user", authMiddleware, createUserRouter());
```

**Step 2: Verify existing tests still pass**

Run: `cd backend && npm test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add backend/src/index.ts
git commit -m "feat: wire auth and user routes into Express app"
```

---

## Task 12: iOS — Plain Codable Models

**Files:**
- Create: `mobile/Summa/Summa/Models/APIModels.swift`

**Step 1: Create Codable structs that replace SwiftData models**

Create: `mobile/Summa/Summa/Models/APIModels.swift`

```swift
import Foundation

// MARK: - Auth

struct AuthResponse: Codable {
    let userId: String
    let accessToken: String
    let refreshToken: String?
}

struct RefreshResponse: Codable {
    let accessToken: String
}

// MARK: - User Settings

struct UserSettings: Codable, Equatable {
    let id: String
    let userId: String
    let displayCurrency: String
    let isPremium: Bool
}

// MARK: - User Asset

struct Asset: Codable, Identifiable, Equatable {
    let id: String
    let name: String
    let symbol: String
    let ticker: String
    let category: String
    let amount: Double
    let currentAmount: Double
    let createdAt: String

    var assetCategory: AssetCategory {
        AssetCategory(rawValue: category) ?? .crypto
    }

    var displayTicker: String {
        ticker.isEmpty ? symbol.uppercased() : ticker
    }
}

struct CreateAssetRequest: Codable {
    let name: String
    let symbol: String
    let ticker: String
    let category: String
    let amount: Double
}

struct AssetListResponse: Codable {
    let assets: [Asset]
}

struct AssetResponse: Codable {
    let asset: Asset
}

// MARK: - Transaction

struct Transaction: Codable, Identifiable, Equatable {
    let id: String
    let userId: String
    let assetId: String
    let type: String
    let amount: Double
    let note: String?
    let date: String
    let createdAt: String

    var transactionType: TransactionType {
        TransactionType(rawValue: type) ?? .delta
    }
}

enum TransactionType: String, Codable {
    case delta
    case snapshot
}

struct CreateTransactionRequest: Codable {
    let type: String
    let amount: Double
    let date: String
    let note: String?
}

struct TransactionListResponse: Codable {
    let transactions: [Transaction]
}

struct TransactionResponse: Codable {
    let transaction: Transaction
}
```

**Step 2: Commit**

```bash
git add mobile/Summa/Summa/Models/APIModels.swift
git commit -m "feat(ios): add Codable API models replacing SwiftData @Model classes"
```

---

## Task 13: iOS — Keychain Helper

**Files:**
- Create: `mobile/Summa/Summa/Services/KeychainHelper.swift`

**Step 1: Create Keychain storage utility**

Create: `mobile/Summa/Summa/Services/KeychainHelper.swift`

```swift
import Foundation
import Security

enum KeychainHelper {
    static func save(key: String, value: String) {
        guard let data = value.data(using: .utf8) else { return }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(query as CFDictionary)
        var addQuery = query
        addQuery[kSecValueData as String] = data
        SecItemAdd(addQuery as CFDictionary, nil)
    }

    static func load(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func delete(key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
```

**Step 2: Commit**

```bash
git add mobile/Summa/Summa/Services/KeychainHelper.swift
git commit -m "feat(ios): add KeychainHelper for secure token storage"
```

---

## Task 14: iOS — AuthManager

**Files:**
- Create: `mobile/Summa/Summa/Services/AuthManager.swift`

**Step 1: Create AuthManager**

Create: `mobile/Summa/Summa/Services/AuthManager.swift`

```swift
import Foundation
import AuthenticationServices

@MainActor
@Observable
final class AuthManager {
    static let shared = AuthManager()

    private(set) var isAuthenticated = false
    private(set) var userId: String?
    private(set) var authType: String = "anonymous"

    private let accessTokenKey = "summa_access_token"
    private let refreshTokenKey = "summa_refresh_token"

    var accessToken: String? {
        KeychainHelper.load(key: accessTokenKey)
    }

    private init() {
        if KeychainHelper.load(key: accessTokenKey) != nil {
            isAuthenticated = true
        }
    }

    func ensureAuthenticated() async throws {
        if isAuthenticated { return }
        try await createAnonymousSession()
    }

    func createAnonymousSession() async throws {
        let response: AuthResponse = try await UserAPIClient.shared.post(
            path: "/auth/anonymous",
            body: Optional<String>.none,
            authenticated: false
        )
        saveTokens(response)
    }

    func signInWithApple(identityToken: Data) async throws {
        guard let tokenString = String(data: identityToken, encoding: .utf8) else {
            throw APIError.invalidData
        }

        let currentToken = accessToken
        if currentToken != nil && authType == "anonymous" {
            // Merge anonymous into Apple account
            let body = ["anonymousToken": currentToken!, "identityToken": tokenString]
            let response: AuthResponse = try await UserAPIClient.shared.post(
                path: "/auth/merge",
                body: body,
                authenticated: false
            )
            saveTokens(response)
        } else {
            let body = ["identityToken": tokenString]
            let response: AuthResponse = try await UserAPIClient.shared.post(
                path: "/auth/apple",
                body: body,
                authenticated: false
            )
            saveTokens(response)
        }
        authType = "apple"
    }

    func refreshAccessToken() async throws {
        guard let refreshToken = KeychainHelper.load(key: refreshTokenKey) else {
            throw APIError.unauthorized
        }

        let body = ["refreshToken": refreshToken]
        let response: RefreshResponse = try await UserAPIClient.shared.post(
            path: "/auth/refresh",
            body: body,
            authenticated: false
        )
        KeychainHelper.save(key: accessTokenKey, value: response.accessToken)
    }

    func signOut() {
        KeychainHelper.delete(key: accessTokenKey)
        KeychainHelper.delete(key: refreshTokenKey)
        isAuthenticated = false
        userId = nil
        authType = "anonymous"
    }

    func deleteAccount() async throws {
        try await UserAPIClient.shared.delete(path: "/user/account")
        signOut()
    }

    private func saveTokens(_ response: AuthResponse) {
        KeychainHelper.save(key: accessTokenKey, value: response.accessToken)
        if let refresh = response.refreshToken {
            KeychainHelper.save(key: refreshTokenKey, value: refresh)
        }
        userId = response.userId
        isAuthenticated = true
    }
}

enum APIError: Error, LocalizedError {
    case serverError
    case invalidData
    case unauthorized
    case notFound

    var errorDescription: String? {
        switch self {
        case .serverError: "Server error. Please try again."
        case .invalidData: "Invalid data received."
        case .unauthorized: "Session expired. Please sign in again."
        case .notFound: "Not found."
        }
    }
}
```

**Step 2: Commit**

```bash
git add mobile/Summa/Summa/Services/AuthManager.swift
git commit -m "feat(ios): add AuthManager with anonymous + Apple Sign In + auto-merge"
```

---

## Task 15: iOS — UserAPIClient

**Files:**
- Create: `mobile/Summa/Summa/Services/UserAPIClient.swift`

**Step 1: Create authenticated HTTP client**

Create: `mobile/Summa/Summa/Services/UserAPIClient.swift`

```swift
import Foundation

final class UserAPIClient {
    static let shared = UserAPIClient()

    private let baseURL: String = {
        #if targetEnvironment(simulator)
        return "http://localhost:3001/api"
        #else
        return "http://192.168.1.171:3001/api"
        #endif
    }()

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }()

    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.keyEncodingStrategy = .convertToSnakeCase
        return e
    }()

    private init() {}

    // MARK: - Generic Methods

    func get<T: Decodable>(path: String) async throws -> T {
        let request = try buildRequest(method: "GET", path: path)
        return try await execute(request)
    }

    func post<T: Decodable, B: Encodable>(path: String, body: B?, authenticated: Bool = true) async throws -> T {
        var request = try buildRequest(method: "POST", path: path, authenticated: authenticated)
        if let body {
            request.httpBody = try encoder.encode(body)
        }
        return try await execute(request)
    }

    func patch<T: Decodable, B: Encodable>(path: String, body: B) async throws -> T {
        var request = try buildRequest(method: "PATCH", path: path)
        request.httpBody = try encoder.encode(body)
        return try await execute(request)
    }

    func delete(path: String) async throws {
        let request = try buildRequest(method: "DELETE", path: path)
        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.serverError }
        if http.statusCode == 401 {
            try await AuthManager.shared.refreshAccessToken()
            let retry = try buildRequest(method: "DELETE", path: path)
            let (_, retryResponse) = try await URLSession.shared.data(for: retry)
            guard let retryHttp = retryResponse as? HTTPURLResponse, retryHttp.statusCode == 200 else {
                throw APIError.serverError
            }
            return
        }
        guard http.statusCode == 200 else { throw APIError.serverError }
    }

    // MARK: - Private

    private func buildRequest(method: String, path: String, authenticated: Bool = true) throws -> URLRequest {
        guard let url = URL(string: baseURL + path) else { throw APIError.serverError }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if authenticated, let token = AuthManager.shared.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    private func execute<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.serverError }

        if http.statusCode == 401 {
            // Token expired — refresh and retry
            try await AuthManager.shared.refreshAccessToken()
            var retry = request
            if let token = AuthManager.shared.accessToken {
                retry.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            }
            let (retryData, retryResponse) = try await URLSession.shared.data(for: retry)
            guard let retryHttp = retryResponse as? HTTPURLResponse,
                  (200...299).contains(retryHttp.statusCode) else {
                throw APIError.unauthorized
            }
            return try decoder.decode(T.self, from: retryData)
        }

        guard (200...299).contains(http.statusCode) else {
            if http.statusCode == 404 { throw APIError.notFound }
            throw APIError.serverError
        }

        return try decoder.decode(T.self, from: data)
    }
}
```

**Step 2: Commit**

```bash
git add mobile/Summa/Summa/Services/UserAPIClient.swift
git commit -m "feat(ios): add UserAPIClient with JWT auth and auto-refresh"
```

---

## Task 16: iOS — Remove SwiftData and Update App Entry Point

**Files:**
- Modify: `mobile/Summa/Summa/SummaApp.swift`
- Delete or gut: `mobile/Summa/Summa/Models/Asset.swift` (SwiftData @Model)
- Delete or gut: `mobile/Summa/Summa/Models/Transaction.swift` (SwiftData @Model)
- Delete or gut: `mobile/Summa/Summa/Models/UserSettings.swift` (SwiftData @Model)

**Step 1: Remove ModelContainer from SummaApp.swift**

Replace the init and body to remove SwiftData:

```swift
@main
struct SummaApp: App {
    @State private var authManager = AuthManager.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(authManager)
                .task {
                    try? await authManager.ensureAuthenticated()
                }
        }
    }
}
```

**Step 2: Delete old SwiftData model files**

Delete these files (they're replaced by `APIModels.swift`):
- `mobile/Summa/Summa/Models/Asset.swift`
- `mobile/Summa/Summa/Models/Transaction.swift`
- `mobile/Summa/Summa/Models/UserSettings.swift`

Keep `AssetCategory.swift` — it's an enum used everywhere.

**Step 3: This will cause compile errors in views — that's expected, we fix them in the next tasks**

**Step 4: Commit**

```bash
git add -A mobile/Summa/Summa/Models/ mobile/Summa/Summa/SummaApp.swift
git commit -m "feat(ios): remove SwiftData, use API-backed auth on launch"
```

---

## Task 17: iOS — Update DashboardViewModel to Use API

**Files:**
- Modify: `mobile/Summa/Summa/ViewModels/DashboardViewModel.swift`

**Step 1: Update DashboardViewModel to fetch assets from backend**

Replace `@Query` and `modelContext` usage with API calls. The key change:

```swift
// Before: assets came from @Query in the view and were passed in
// After: ViewModel fetches assets from backend directly

func refresh(baseCurrency: String) async {
    isLoading = true
    priceError = nil

    do {
        // Fetch assets from backend
        let response: AssetListResponse = try await UserAPIClient.shared.get(path: "/user/assets")
        let assets = response.assets

        // Rest of the logic stays the same — fetch prices, compute portfolio
        let prices = try await PriceAPIClient.shared.fetchPrices(
            assets: assets.map { AssetRequest(id: $0.symbol, category: $0.category) },
            baseCurrency: baseCurrency
        )
        // ... existing portfolio computation logic ...
    } catch {
        priceError = PriceErrorMessage.userMessage(from: error)
    }

    isLoading = false
}
```

**Step 2: Update all views that pass assets to the ViewModel**

Views no longer pass `assets:` parameter — the ViewModel fetches its own data.

**Step 3: Commit**

```bash
git add mobile/Summa/Summa/ViewModels/DashboardViewModel.swift
git commit -m "feat(ios): update DashboardViewModel to fetch assets from backend API"
```

---

## Task 18: iOS — Update Views to Use API Instead of SwiftData

**Files:**
- Modify: All views in `mobile/Summa/Summa/Views/` that use `@Query`, `@Environment(\.modelContext)`, or SwiftData models

**Step 1: Update each view file**

For each view that uses SwiftData:
- Remove `@Query var assets: [Asset]` — replace with `@State var assets: [Asset] = []` populated via API
- Remove `@Environment(\.modelContext) private var modelContext` — replace writes with API calls
- Replace `modelContext.insert(asset)` with `UserAPIClient.shared.post(...)` calls
- Replace `modelContext.delete(asset)` with `UserAPIClient.shared.delete(...)` calls

Common pattern for views that list assets:

```swift
struct AssetListView: View {
    @State private var assets: [Asset] = []

    var body: some View {
        List(assets) { asset in
            // ... existing UI ...
        }
        .task {
            await loadAssets()
        }
    }

    private func loadAssets() async {
        do {
            let response: AssetListResponse = try await UserAPIClient.shared.get(path: "/user/assets")
            assets = response.assets
        } catch {
            // handle error
        }
    }
}
```

**Step 2: Update AddAssetView to POST to backend**

```swift
// Before: modelContext.insert(Asset(...))
// After:
let request = CreateAssetRequest(name: name, symbol: symbol, ticker: ticker, category: category, amount: amount)
let _: AssetResponse = try await UserAPIClient.shared.post(path: "/user/assets", body: request)
```

**Step 3: Update TransactionViews to use API**

```swift
// Before: modelContext.insert(Transaction(...))
// After:
let request = CreateTransactionRequest(type: "delta", amount: amount, date: date.ISO8601Format(), note: note)
let _: TransactionResponse = try await UserAPIClient.shared.post(path: "/user/assets/\(assetId)/transactions", body: request)
```

**Step 4: Update Settings view to use API**

```swift
// Load settings
let settings: UserSettings = try await UserAPIClient.shared.get(path: "/user/settings")

// Update settings
let _: UserSettings = try await UserAPIClient.shared.patch(path: "/user/settings", body: ["displayCurrency": newCurrency])
```

**Step 5: Commit after each view file is updated (or batch if small)**

```bash
git add mobile/Summa/Summa/Views/
git commit -m "feat(ios): update all views to use backend API instead of SwiftData"
```

---

## Task 19: iOS — Add Apple Sign In UI

**Files:**
- Modify: `mobile/Summa/Summa/Views/SettingsView.swift`

**Step 1: Add Sign in with Apple button to Settings**

```swift
import AuthenticationServices

// In SettingsView body, add:
Section("Account") {
    if authManager.authType == "anonymous" {
        SignInWithAppleButton(.signIn) { request in
            request.requestedScopes = []
        } onCompletion: { result in
            Task {
                switch result {
                case .success(let auth):
                    if let credential = auth.credential as? ASAuthorizationAppleIDCredential,
                       let tokenData = credential.identityToken {
                        try? await authManager.signInWithApple(identityToken: tokenData)
                    }
                case .failure:
                    break
                }
            }
        }
        .signInWithAppleButtonStyle(.black)
        .frame(height: 44)
    } else {
        Label("Signed in with Apple", systemImage: "checkmark.circle.fill")
    }

    Button("Delete Account", role: .destructive) {
        showDeleteConfirmation = true
    }
}
```

**Step 2: Commit**

```bash
git add mobile/Summa/Summa/Views/SettingsView.swift
git commit -m "feat(ios): add Apple Sign In and account deletion to Settings"
```

---

## Task 20: Integration Test — Full Flow

**Files:**
- Create: `backend/src/__tests__/integration.test.ts`

**Step 1: Write end-to-end test**

Create: `backend/src/__tests__/integration.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.stubEnv("JWT_SECRET", "integration-test-secret");
vi.stubEnv("JWT_REFRESH_SECRET", "integration-test-refresh-secret");

// Mock DB query to use in-memory storage
const store: Record<string, any[]> = { users: [], user_assets: [], user_transactions: [], user_settings: [] };
const mockQuery = vi.hoisted(() => vi.fn());

vi.mock("../db.js", () => ({
  query: mockQuery,
}));

vi.mock("apple-signin-auth", () => ({
  default: {
    verifyIdToken: vi.fn().mockResolvedValue({ sub: "apple-test-user" }),
  },
}));

describe("full auth + CRUD flow", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());

    const { createAuthRouter } = await import("../routes/auth.js");
    const { createUserRouter } = await import("../routes/user.js");
    const { authMiddleware } = await import("../middleware/auth.js");

    app.use("/api/auth", createAuthRouter());
    app.use("/api/user", authMiddleware, createUserRouter());
  });

  it("anonymous signup → create asset → add transaction → list assets → delete account", async () => {
    // 1. Create anonymous user
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "test-user-1" }] });
    const authRes = await request(app).post("/api/auth/anonymous");
    expect(authRes.status).toBe(200);
    const { accessToken } = authRes.body;

    // 2. Create asset
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "asset-1", user_id: "test-user-1", name: "Bitcoin", symbol: "bitcoin", ticker: "BTC", category: "crypto", amount: 1.0, current_amount: 1.0, created_at: new Date() }],
    });
    const assetRes = await request(app)
      .post("/api/user/assets")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Bitcoin", symbol: "bitcoin", ticker: "BTC", category: "crypto", amount: 1.0 });
    expect(assetRes.status).toBe(201);
    expect(assetRes.body.asset.name).toBe("Bitcoin");

    // 3. Add transaction
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "tx-1", user_id: "test-user-1", asset_id: "asset-1", type: "delta", amount: 0.5, note: null, date: new Date(), created_at: new Date() }],
    });
    const txRes = await request(app)
      .post("/api/user/assets/asset-1/transactions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ type: "delta", amount: 0.5, date: "2025-01-15T00:00:00Z" });
    expect(txRes.status).toBe(201);

    // 4. List assets
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "asset-1", user_id: "test-user-1", name: "Bitcoin", symbol: "bitcoin", ticker: "BTC", category: "crypto", amount: 1.0, current_amount: 1.5, created_at: new Date() }],
    });
    const listRes = await request(app)
      .get("/api/user/assets")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.assets[0].currentAmount).toBe(1.5);

    // 5. Delete account
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const deleteRes = await request(app)
      .delete("/api/user/account")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(deleteRes.status).toBe(200);
  });
});
```

**Step 2: Run all tests**

Run: `cd backend && npm test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add backend/src/__tests__/integration.test.ts
git commit -m "test: add integration test for full auth + CRUD flow"
```

---

## Task 21: Update .env.example and CLAUDE.md

**Files:**
- Modify: `backend/.env.example`
- Modify: `CLAUDE.md`

**Step 1: Update .env.example with all new variables**

Already done in Task 1, verify it includes:
```
JWT_SECRET=your-jwt-secret-here
JWT_REFRESH_SECRET=your-refresh-secret-here
APPLE_CLIENT_ID=your-apple-bundle-id
```

**Step 2: Update CLAUDE.md with new architecture notes**

Add to Key decisions section:

```markdown
- User data (assets, transactions, settings) stored in backend PostgreSQL, not on-device
- Auth: anonymous device tokens (auto-created on first launch) + Apple Sign In with auto-merge
- JWT access tokens (1h) + refresh tokens (30d) stored in iOS Keychain
- All `/api/user/*` endpoints require JWT auth; existing price/search/history endpoints remain unauthenticated
- Account deletion cascades to all user data (App Store requirement)
```

Update iOS architecture section to note SwiftData removal.

**Step 3: Commit**

```bash
git add CLAUDE.md backend/.env.example
git commit -m "docs: update CLAUDE.md and .env.example for backend user data architecture"
```
