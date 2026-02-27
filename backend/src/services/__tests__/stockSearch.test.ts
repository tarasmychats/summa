import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchStocks } from "../stockSearch.js";

vi.mock("yahoo-finance2", () => ({
  default: {
    search: vi.fn(),
  },
}));

import yahooFinance from "yahoo-finance2";

describe("searchStocks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns matching stocks from Yahoo Finance", async () => {
    vi.mocked(yahooFinance.search).mockResolvedValueOnce({
      quotes: [
        {
          symbol: "AAPL",
          shortname: "Apple Inc.",
          quoteType: "EQUITY",
          isYahooFinance: true,
          exchange: "NMS",
          index: "quotes",
          score: 100,
        },
        {
          symbol: "QQQ",
          shortname: "Invesco QQQ Trust",
          quoteType: "ETF",
          isYahooFinance: true,
          exchange: "NMS",
          index: "quotes",
          score: 90,
        },
      ],
      news: [],
      explains: [],
      count: 2,
      nav: [],
      lists: [],
      researchReports: [],
      totalTime: 100,
      timeTakenForQuotes: 50,
      timeTakenForNews: 30,
      timeTakenForAlgowatchlist: 0,
      timeTakenForPredefinedScreener: 0,
      timeTakenForCrunchbase: 0,
      timeTakenForNav: 0,
      timeTakenForResearchReports: 0,
      timeTakenForScreenerField: 0,
      timeTakenForCulturalAssets: 0,
      timeTakenForSearchLists: 0,
    } as any);

    const result = await searchStocks("apple");

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: "AAPL",
      name: "Apple Inc.",
      symbol: "AAPL",
      category: "stock",
    });
  });

  it("filters out non-Yahoo results", async () => {
    vi.mocked(yahooFinance.search).mockResolvedValueOnce({
      quotes: [
        {
          name: "Some Startup",
          permalink: "some-startup",
          isYahooFinance: false,
          index: "crunchbase",
        },
      ],
      news: [],
      explains: [],
      count: 1,
      nav: [],
      lists: [],
      researchReports: [],
      totalTime: 50,
      timeTakenForQuotes: 25,
      timeTakenForNews: 10,
      timeTakenForAlgowatchlist: 0,
      timeTakenForPredefinedScreener: 0,
      timeTakenForCrunchbase: 0,
      timeTakenForNav: 0,
      timeTakenForResearchReports: 0,
      timeTakenForScreenerField: 0,
      timeTakenForCulturalAssets: 0,
      timeTakenForSearchLists: 0,
    } as any);

    const result = await searchStocks("startup");
    expect(result).toEqual([]);
  });

  it("returns empty array on error", async () => {
    vi.mocked(yahooFinance.search).mockRejectedValueOnce(new Error("API down"));

    const result = await searchStocks("apple");
    expect(result).toEqual([]);
  });
});
