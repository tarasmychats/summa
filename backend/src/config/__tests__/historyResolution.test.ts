import { describe, it, expect } from "vitest";
import { getResolution } from "../historyResolution.js";

describe("getResolution", () => {
  it("returns 'daily' for 30-day range", () => {
    expect(getResolution("2026-01-01", "2026-01-31")).toBe("daily");
  });

  it("returns 'daily' for 90-day range (boundary)", () => {
    expect(getResolution("2026-01-01", "2026-04-01")).toBe("daily");
  });

  it("returns '3day' for 91-day range", () => {
    expect(getResolution("2026-01-01", "2026-04-02")).toBe("3day");
  });

  it("returns '3day' for 180-day range (boundary)", () => {
    expect(getResolution("2026-01-01", "2026-06-30")).toBe("3day");
  });

  it("returns 'weekly' for 181-day range", () => {
    expect(getResolution("2026-01-01", "2026-07-01")).toBe("weekly");
  });

  it("returns 'weekly' for 365-day range (boundary)", () => {
    expect(getResolution("2025-01-01", "2026-01-01")).toBe("weekly");
  });

  it("returns 'monthly' for 366-day range", () => {
    expect(getResolution("2025-01-01", "2026-01-02")).toBe("monthly");
  });

  it("returns 'monthly' for 5-year range", () => {
    expect(getResolution("2021-03-09", "2026-03-09")).toBe("monthly");
  });

  it("returns 'daily' for same-day range", () => {
    expect(getResolution("2026-01-01", "2026-01-01")).toBe("daily");
  });
});
