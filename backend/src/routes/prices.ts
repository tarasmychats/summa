import { Router } from "express";
import { fetchCryptoPrices } from "../services/crypto.js";
import { fetchStockPrices } from "../services/stocks.js";
import { fetchExchangeRates } from "../services/fiat.js";
import { PriceCache } from "../cache.js";
import { upsertTrackedAssets } from "../repositories/trackedAssets.js";
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
      res.json(response);
      return;
    }

    const [cryptoPrices, stockPrices, fiatPrices] = await Promise.all([
      fetchCryptoPrices(cryptoIds, base.toLowerCase()),
      fetchStockPrices(stockIds),
      fetchExchangeRates(base, fiatIds),
    ]);

    const allPrices = [...cryptoPrices, ...stockPrices, ...fiatPrices];
    cache.set(cacheKey, allPrices);

    const response: PriceResponse = {
      prices: allPrices,
      baseCurrency: base,
      timestamp: new Date().toISOString(),
    };

    res.json(response);

    // Fire-and-forget: track requested assets for the daily cron job
    upsertTrackedAssets(
      body.assets.map((a) => ({ assetId: a.id, category: a.category }))
    ).catch(() => {
      // Silently ignore DB errors — tracking is best-effort
    });
  });

  return router;
}
