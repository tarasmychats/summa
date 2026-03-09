import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuery = vi.fn();
vi.mock("../../db.js", () => ({
  getPool: () => ({ query: mockQuery }),
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
