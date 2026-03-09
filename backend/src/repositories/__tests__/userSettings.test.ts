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
