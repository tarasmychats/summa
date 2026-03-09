import { Router } from "express";
import { getMultiAssetPricesAggregated, assetKey } from "../repositories/dailyPrices.js";
import { backfillAsset } from "../services/backfill.js";
import { logger } from "../logger.js";
import { isDbReady } from "../db.js";
import { getResolution } from "../config/historyResolution.js";

/**
 * Validates a date string is in YYYY-MM-DD format and represents a real date.
 */
function isValidDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = new Date(dateStr + "T00:00:00Z");
  if (isNaN(d.getTime())) return false;
  // Verify round-trip to catch silently rolled-over dates like Feb 31 → Mar 3
  return d.toISOString().split("T")[0] === dateStr;
}

// Tracks in-flight backfills to prevent duplicate concurrent requests
const inFlightBackfills = new Set<string>();

export function createHistoryRouter(): Router {
  const router = Router();

  router.get("/history", async (req, res) => {
    const { assets, categories, from, to, currency } = req.query;

    // Validate required params
    if (!assets || !categories || !from || !to || !currency) {
      res.status(400).json({
        error:
          "Missing required query parameters: assets, categories, from, to, currency",
      });
      return;
    }

    const assetList = (assets as string).split(",").filter(Boolean);
    const categoryList = (categories as string).split(",").filter(Boolean);
    const currencyStr = (currency as string).toLowerCase();
    const fromStr = from as string;
    const toStr = to as string;

    // Validate arrays have same length and reasonable size
    if (assetList.length === 0 || assetList.length !== categoryList.length) {
      res.status(400).json({
        error: "assets and categories must be non-empty and have the same length",
      });
      return;
    }

    if (assetList.length > 50) {
      res.status(400).json({
        error: "Maximum 50 assets per request",
      });
      return;
    }

    // Validate categories
    const validCategories = new Set(["crypto", "stock", "etf", "fiat"]);
    if (categoryList.some((c) => !validCategories.has(c))) {
      res.status(400).json({
        error: "Invalid category. Must be one of: crypto, stock, etf, fiat",
      });
      return;
    }

    // Validate dates
    if (!isValidDate(fromStr) || !isValidDate(toStr)) {
      res.status(400).json({
        error: "from and to must be valid dates in YYYY-MM-DD format",
      });
      return;
    }

    if (fromStr > toStr) {
      res.status(400).json({
        error: "'from' date must be before or equal to 'to' date",
      });
      return;
    }

    // Validate currency
    if (currencyStr !== "usd" && currencyStr !== "eur") {
      res.status(400).json({
        error: "currency must be 'usd' or 'eur'",
      });
      return;
    }

    const resolution = getResolution(fromStr, toStr);

    // If DB is not available, return empty history (graceful degradation)
    if (!isDbReady()) {
      const emptyHistory: Record<string, Array<{ date: string; price: number }>> = {};
      for (let i = 0; i < assetList.length; i++) {
        emptyHistory[assetKey(assetList[i], categoryList[i])] = [];
      }
      res.json({
        history: emptyHistory,
        currency: currencyStr,
        from: fromStr,
        to: toStr,
        resolution,
      });
      return;
    }

    try {
      const assetPairs = assetList.map((id, i) => ({
        assetId: id,
        category: categoryList[i],
      }));

      const history = await getMultiAssetPricesAggregated(
        assetPairs,
        fromStr,
        toStr,
        currencyStr,
        resolution
      );

      // For assets with no history, trigger async backfill (fire-and-forget)
      // Uses in-flight set to prevent duplicate concurrent backfills
      for (const pair of assetPairs) {
        const compositeKey = assetKey(pair.assetId, pair.category);
        if (history[compositeKey] && history[compositeKey].length === 0) {
          const key = `${pair.assetId}:${pair.category}`;
          if (!inFlightBackfills.has(key)) {
            inFlightBackfills.add(key);
            backfillAsset(pair.assetId, pair.category)
              .catch((err) => {
                logger.error("async backfill failed", {
                  assetId: pair.assetId,
                  category: pair.category,
                  error: String(err),
                });
              })
              .finally(() => inFlightBackfills.delete(key));
          }
        }
      }

      res.json({
        history,
        currency: currencyStr,
        from: fromStr,
        to: toStr,
        resolution,
      });
    } catch (err) {
      logger.error("history endpoint error", { error: String(err) });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}
