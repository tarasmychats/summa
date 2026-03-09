# Backend User Data Migration Design

Move all user data (assets, transactions, settings) from on-device SwiftData/CloudKit to the Express + PostgreSQL backend.

## Motivation

- Full control over data schema and migrations post-release
- Enable analytics (total users, portfolio sizes, popular assets)
- Enable future social features (sharing, leaderboards)
- No personal data collected — portfolio data is financial, not PII

## Constraints

- Pre-launch: no existing users to migrate
- Always online: no offline support needed
- iOS-only client for now

---

## Authentication

Two auth modes:

1. **Anonymous** — first launch calls `POST /api/auth/anonymous`. Backend generates UUID + JWT. Device stores token in Keychain.
2. **Apple Sign In** — user taps sign-in in settings. App sends Apple identity token to `POST /api/auth/apple`. Backend verifies with Apple, returns JWT.

**Auto-merge:** When anonymous user signs in with Apple, app sends both anonymous JWT and Apple token. Backend transfers all data from anonymous user to Apple user, deletes anonymous record.

**Tokens:** Short-lived access token (1 hour) + long-lived refresh token (30 days), both stored in Keychain.

### Users Table

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apple_user_id VARCHAR UNIQUE,
  auth_type VARCHAR NOT NULL, -- 'anonymous' or 'apple'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## Database Schema

### user_settings

```sql
CREATE TABLE user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  display_currency VARCHAR DEFAULT 'USD',
  is_premium BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id)
);
```

### user_assets

```sql
CREATE TABLE user_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR NOT NULL,
  symbol VARCHAR NOT NULL,
  ticker VARCHAR NOT NULL,
  category VARCHAR NOT NULL, -- crypto/stock/etf/fiat
  amount DOUBLE PRECISION DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### user_transactions

```sql
CREATE TABLE user_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  asset_id UUID REFERENCES user_assets(id) ON DELETE CASCADE,
  type VARCHAR NOT NULL, -- delta/snapshot
  amount DOUBLE PRECISION NOT NULL,
  note TEXT,
  date TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

All tables use `ON DELETE CASCADE` — deleting a user cleans up everything.

---

## API Endpoints

All `/api/user/*` endpoints require `Authorization: Bearer <token>` header.

### Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/anonymous` | Create anonymous user, return tokens |
| POST | `/api/auth/apple` | Sign in with Apple, return tokens |
| POST | `/api/auth/merge` | Merge anonymous into Apple account |
| POST | `/api/auth/refresh` | Refresh access token |

### Settings

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/user/settings` | Get settings (auto-creates defaults) |
| PATCH | `/api/user/settings` | Update display currency, premium |

### Assets

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/user/assets` | List assets with computed currentAmount |
| POST | `/api/user/assets` | Add an asset |
| PATCH | `/api/user/assets/:id` | Update an asset |
| DELETE | `/api/user/assets/:id` | Delete asset + its transactions |

### Transactions

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/user/assets/:id/transactions` | List transactions for asset |
| POST | `/api/user/assets/:id/transactions` | Add a transaction |
| DELETE | `/api/user/assets/:id/transactions/:txId` | Delete a transaction |

### Account

| Method | Path | Description |
|--------|------|-------------|
| DELETE | `/api/user/account` | Delete user and all data (App Store requirement) |

Existing endpoints (`/api/prices`, `/api/search`, `/api/history`) remain unchanged and unauthenticated.

---

## Backend Architecture

### New Files

```
backend/src/
  middleware/
    auth.ts              — JWT verification, extracts userId
  repositories/
    users.ts             — create/find/delete/merge users
    userAssets.ts         — CRUD + currentAmount computation
    userTransactions.ts   — CRUD for transactions
    userSettings.ts       — get/upsert settings
  routes/
    auth.ts              — auth endpoints
    user.ts              — settings, assets, transactions
  services/
    auth.ts              — JWT signing, Apple token verification
```

### Auth Middleware

```typescript
app.use('/api/user', authMiddleware);
// Extracts userId from JWT, sets req.userId
// Routes pass req.userId to repository functions
```

### currentAmount Computation

Server-side replay of transactions, same logic as current iOS implementation:

```sql
SELECT COALESCE(
  (SELECT SUM(amount) FROM user_transactions
   WHERE asset_id = $1 ORDER BY date ASC),
  0
) + user_assets.amount AS current_amount
FROM user_assets WHERE id = $1
```

### Dependencies

- `jsonwebtoken` — JWT signing and verification
- `apple-signin-auth` — Apple identity token verification
- `express-rate-limit` — rate limiting on auth endpoints

---

## iOS App Changes

### Remove

- SwiftData `@Model` classes (Asset, Transaction, UserSettings)
- `ModelContainer` setup in app entry point
- CloudKit sync configuration
- All `@Query` and `modelContext` usage

### Add

- Plain Codable structs for Asset, Transaction, UserSettings
- `UserAPIClient` for all CRUD endpoints
- `AuthManager` (observable) — handles tokens, auth state, Keychain storage
- Token storage in Keychain (access + refresh tokens)

### Auth Flow

1. App launches → check Keychain for existing token
2. No token → `POST /api/auth/anonymous`, store token
3. Has token → use for all `/api/user/*` calls
4. Token expired → auto-refresh via `/api/auth/refresh`
5. User taps "Sign in with Apple" → merge endpoint

### Unchanged

Business logic stays on-device — these take asset data as input regardless of source:

- PortfolioCalculator, RiskCalculator, ProjectionEngine, InsightsEngine
- ChartSelectionHelper, AssetValueFormatter, DuplicateAssetDetector

---

## Security & Privacy

**Stored:** Anonymous UUID or Apple's opaque user ID, portfolio data (symbols, amounts, transactions).

**Not stored:** Email, name, device identifiers, IP addresses.

**Protection:**
- HTTPS for all traffic
- JWT signed with server secret (in `.env`)
- Tokens in iOS Keychain (not UserDefaults)
- `ON DELETE CASCADE` for easy account deletion (GDPR/App Store compliance)
- Rate limiting on auth endpoints

**Privacy policy:** Required, but straightforward since no PII is collected.
