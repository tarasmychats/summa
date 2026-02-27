import { describe, it, expect, vi, beforeEach } from "vitest";
import { PriceCache } from "../cache.js";

describe("PriceCache", () => {
  let cache: PriceCache;

  beforeEach(() => {
    cache = new PriceCache(60_000); // 60s TTL
  });

  it("returns undefined for missing keys", () => {
    expect(cache.get("missing")).toBeUndefined();
  });

  it("stores and retrieves values", () => {
    cache.set("btc", { price: 95000 });
    expect(cache.get("btc")).toEqual({ price: 95000 });
  });

  it("returns undefined for expired entries", () => {
    cache.set("btc", { price: 95000 });

    // Advance time past TTL
    vi.useFakeTimers();
    vi.advanceTimersByTime(61_000);

    expect(cache.get("btc")).toBeUndefined();
    vi.useRealTimers();
  });
});
