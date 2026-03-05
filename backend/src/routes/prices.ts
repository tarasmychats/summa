import { Router } from "express";
import { fetchCryptoPrices } from "../services/crypto.js";
import { fetchStockPrices } from "../services/stocks.js";
import { fetchExchangeRates } from "../services/fiat.js";
import { PriceCache } from "../cache.js";
import { logger } from "../logger.js";
import { normalizeCurrency } from "../currency.js";
import type { PriceRequest, AssetPrice, PriceResponse } from "../types.js";

const cache = new PriceCache(300_000); // 5 minute per-asset cache

function assetCacheKey(id: string, category: string, base: string): string {
  return `${category}:${id}:${base}`;
}

export function createPricesRouter(): Router {
  const router = Router();

  router.post("/prices", async (req, res) => {
    const body = req.body as PriceRequest;

    if (!body.assets || !Array.isArray(body.assets) || !body.baseCurrency) {
      res.status(400).json({ error: "Invalid request. Required: assets[], baseCurrency" });
      return;
    }

    if (body.assets.length > 50) {
      res.status(400).json({ error: "Too many assets. Maximum 50 per request." });
      return;
    }

    const base = body.baseCurrency.toUpperCase();

    // Check cache for each asset individually
    const cachedPrices: AssetPrice[] = [];
    const uncachedAssets: typeof body.assets = [];

    for (const asset of body.assets) {
      const cached = cache.get<AssetPrice>(assetCacheKey(asset.id, asset.category, base));
      if (cached) {
        cachedPrices.push(cached);
      } else {
        uncachedAssets.push(asset);
      }
    }

    // If everything was cached, return immediately
    if (uncachedAssets.length === 0) {
      const response: PriceResponse = {
        prices: cachedPrices,
        baseCurrency: base,
        timestamp: new Date().toISOString(),
      };
      addUnconvertedWarnings(response, base);
      res.json(response);
      return;
    }

    // Fetch only uncached assets
    const cryptoIds = uncachedAssets
      .filter((a) => a.category === "crypto")
      .map((a) => a.id);
    const stockIds = uncachedAssets
      .filter((a) => a.category === "stock" || a.category === "etf")
      .map((a) => a.id);
    const fiatIds = uncachedAssets
      .filter((a) => a.category === "fiat")
      .map((a) => a.id);

    let freshPrices: AssetPrice[];
    try {
      const [cryptoPrices, stockPrices, fiatPrices] = await Promise.all([
        fetchCryptoPrices(cryptoIds, base.toLowerCase()),
        fetchStockPrices(stockIds),
        fetchExchangeRates(base, fiatIds),
      ]);

      const convertedStockPrices = await convertStockPricesToBase(stockPrices, base);

      // Restore original category for ETFs (fetchStockPrices returns category: "stock")
      const etfIds = new Set(
        uncachedAssets.filter((a) => a.category === "etf").map((a) => a.id)
      );
      for (const price of convertedStockPrices) {
        if (etfIds.has(price.id)) {
          (price as any).category = "etf";
        }
      }

      freshPrices = [...cryptoPrices, ...convertedStockPrices, ...fiatPrices];
    } catch {
      res.status(500).json({ error: "Failed to fetch prices" });
      return;
    }

    // Cache each freshly fetched price individually
    for (const price of freshPrices) {
      cache.set(assetCacheKey(price.id, price.category, base), price);
    }

    const allPrices = [...cachedPrices, ...freshPrices];

    const response: PriceResponse = {
      prices: allPrices,
      baseCurrency: base,
      timestamp: new Date().toISOString(),
    };
    addUnconvertedWarnings(response, base);

    res.json(response);
  });

  return router;
}

/**
 * Adds warnings about unconverted stocks to the response.
 * Used for both cache hits and misses.
 */
function addUnconvertedWarnings(response: PriceResponse, base: string): void {
  const unconvertedStocks = response.prices.filter(
    (p) => (p.category === "stock" || p.category === "etf") && p.currency.toUpperCase() !== base
  );
  if (unconvertedStocks.length > 0) {
    response.warnings = [
      `FX conversion unavailable for ${unconvertedStocks.map((s) => s.id).join(", ")}; prices returned in native currency (check each price's currency field)`,
    ];
  }
}

/**
 * Converts stock prices from their native currency to the requested base currency.
 * Groups stocks by native currency to minimize exchange rate API calls.
 * Handles minor-unit currencies (e.g., GBp/GBX pence → GBP pounds).
 */
async function convertStockPricesToBase(
  stockPrices: AssetPrice[],
  base: string
): Promise<AssetPrice[]> {
  if (stockPrices.length === 0) return stockPrices;

  // Normalize minor-unit currencies first (e.g., GBp → GBP with price / 100)
  const normalizedPrices = stockPrices.map((stock) => {
    const { iso, divisor } = normalizeCurrency(stock.currency);
    if (divisor === 1 && iso === stock.currency.toUpperCase()) return stock;
    return {
      ...stock,
      price: stock.price / divisor,
      currency: iso,
    };
  });

  // Find unique native currencies that differ from the base
  const currenciesToConvert = [
    ...new Set(
      normalizedPrices
        .map((s) => s.currency.toUpperCase())
        .filter((c) => c !== base)
    ),
  ];

  if (currenciesToConvert.length === 0) return normalizedPrices;

  // Fetch conversion rates: how many units of each native currency per 1 unit of base
  // e.g., fetchExchangeRates("EUR", ["USD"]) → rate = 1.10 means 1 EUR = 1.10 USD
  let rateMap: Map<string, number>;
  try {
    const rates = await fetchExchangeRates(base, currenciesToConvert);
    rateMap = new Map(rates.map((r) => [r.id.toUpperCase(), r.price]));
  } catch (err) {
    logger.warn("could not fetch FX rates for stock price conversion", {
      base,
      currencies: currenciesToConvert,
      error: String(err),
    });
    // Return normalized (but unconverted) prices rather than failing the whole request
    return normalizedPrices;
  }

  return normalizedPrices.map((stock) => {
    const nativeCurrency = stock.currency.toUpperCase();
    if (nativeCurrency === base) return stock;

    const rateFromBaseToNative = rateMap.get(nativeCurrency);
    if (rateFromBaseToNative == null || rateFromBaseToNative === 0) return stock;

    // price_in_base = price_in_native / rate_from_base_to_native
    return {
      ...stock,
      price: stock.price / rateFromBaseToNative,
      currency: base,
    };
  });
}
