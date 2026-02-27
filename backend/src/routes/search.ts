import { Router } from "express";
import { searchCrypto } from "../services/cryptoSearch.js";
import { searchStocks } from "../services/stockSearch.js";
import { searchFiat } from "../services/fiatSearch.js";
import { PriceCache } from "../cache.js";
import type { SearchResult, SearchResponse, AssetCategory } from "../types.js";

const searchCache = new PriceCache(300_000); // 5 minute cache
const fiatCache = new PriceCache(86_400_000); // 24 hour cache for fiat list

export function createSearchRouter(): Router {
  const router = Router();

  router.get("/search", async (req, res) => {
    const q = ((req.query.q as string) ?? "").trim();
    const category = req.query.category as AssetCategory | undefined;

    if (!q) {
      res.status(400).json({ error: "Query parameter 'q' is required" });
      return;
    }

    const cacheKey = `search_${q.toLowerCase()}_${category ?? "all"}`;
    const cached = searchCache.get<SearchResult[]>(cacheKey);

    if (cached) {
      const response: SearchResponse = { results: cached };
      res.json(response);
      return;
    }

    const searches: Promise<SearchResult[]>[] = [];

    if (!category || category === "crypto") {
      searches.push(searchCrypto(q));
    }
    if (!category || category === "stock") {
      searches.push(searchStocks(q));
    }
    if (!category || category === "fiat") {
      const fiatCacheKey = `fiat_list_${q.toLowerCase()}`;
      const cachedFiat = fiatCache.get<SearchResult[]>(fiatCacheKey);
      if (cachedFiat) {
        searches.push(Promise.resolve(cachedFiat));
      } else {
        searches.push(
          searchFiat(q).then((results) => {
            fiatCache.set(fiatCacheKey, results);
            return results;
          })
        );
      }
    }

    const results = (await Promise.all(searches)).flat();
    searchCache.set(cacheKey, results);

    const response: SearchResponse = { results };
    res.json(response);
  });

  return router;
}
