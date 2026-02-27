import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchCrypto } from "../cryptoSearch.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("searchCrypto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns matching coins from CoinGecko search", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        coins: [
          { id: "bitcoin", name: "Bitcoin", symbol: "BTC" },
          { id: "bitcoin-cash", name: "Bitcoin Cash", symbol: "BCH" },
        ],
      }),
    });

    const result = await searchCrypto("bitcoin");

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: "bitcoin",
      name: "Bitcoin",
      symbol: "BTC",
      category: "crypto",
    });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/search?query=bitcoin")
    );
  });

  it("returns empty array when API fails", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await searchCrypto("bitcoin");
    expect(result).toEqual([]);
  });

  it("returns empty array for empty query", async () => {
    const result = await searchCrypto("");
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
