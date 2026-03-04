import { Router } from "express";
import { fetchCryptoPrices } from "../services/crypto.js";
import { fetchStockPrices } from "../services/stocks.js";
import { fetchExchangeRates } from "../services/fiat.js";
import { PriceCache } from "../cache.js";
import { upsertTrackedAssets } from "../repositories/trackedAssets.js";
import { logger } from "../logger.js";
import { normalizeCurrency } from "../currency.js";
import type { PriceRequest, AssetPrice, PriceResponse } from "../types.js";

const cache = new PriceCache(60_000); // 1 minute cache

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

    const cryptoIds = body.assets
      .filter((a) => a.category === "crypto")
      .map((a) => a.id);
    const stockIds = body.assets
      .filter((a) => a.category === "stock")
      .map((a) => a.id);
    const fiatIds = body.assets
      .filter((a) => a.category === "fiat")
      .map((a) => a.id);

    const cacheKey = `${cryptoIds.join(",")}_${stockIds.join(",")}_${fiatIds.join(",")}_${base}`;
    const cached = cache.get<AssetPrice[]>(cacheKey);

    if (cached) {
      const response: PriceResponse = {
        prices: cached,
        baseCurrency: base,
        timestamp: new Date().toISOString(),
      };
      addUnconvertedWarnings(response, base);
      res.json(response);
      return;
    }

    let allPrices: AssetPrice[];
    try {
      const [cryptoPrices, stockPrices, fiatPrices] = await Promise.all([
        fetchCryptoPrices(cryptoIds, base.toLowerCase()),
        fetchStockPrices(stockIds),
        fetchExchangeRates(base, fiatIds),
      ]);

      // Convert stock prices to the requested base currency.
      // Yahoo Finance returns prices in the stock's native currency (usually USD).
      // When base != stock currency, we need to convert.
      const convertedStockPrices = await convertStockPricesToBase(stockPrices, base);

      allPrices = [...cryptoPrices, ...convertedStockPrices, ...fiatPrices];
    } catch {
      res.status(500).json({ error: "Failed to fetch prices" });
      return;
    }
    cache.set(cacheKey, allPrices);

    const response: PriceResponse = {
      prices: allPrices,
      baseCurrency: base,
      timestamp: new Date().toISOString(),
    };
    addUnconvertedWarnings(response, base);

    res.json(response);

    // Fire-and-forget: track requested assets for the daily cron job
    const validCategories = new Set(["crypto", "stock", "fiat"]);
    const trackableAssets = body.assets
      .filter((a) => validCategories.has(a.category))
      .map((a) => ({ assetId: a.id, category: a.category }));
    if (trackableAssets.length > 0) {
      upsertTrackedAssets(trackableAssets).catch(() => {
        // Silently ignore DB errors — tracking is best-effort
      });
    }
  });

  return router;
}

/**
 * Adds warnings about unconverted stocks to the response.
 * Used for both cache hits and misses.
 */
function addUnconvertedWarnings(response: PriceResponse, base: string): void {
  const unconvertedStocks = response.prices.filter(
    (p) => p.category === "stock" && p.currency.toUpperCase() !== base
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
