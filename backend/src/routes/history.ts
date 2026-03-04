import { Router } from "express";
import { getMultiAssetPrices } from "../repositories/dailyPrices.js";
import { backfillAsset } from "../services/backfill.js";
import { logger } from "../logger.js";

/**
 * Validates a date string is in YYYY-MM-DD format and represents a real date.
 */
function isValidDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = new Date(dateStr + "T00:00:00Z");
  return !isNaN(d.getTime());
}

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

    // Validate arrays have same length
    if (assetList.length === 0 || assetList.length !== categoryList.length) {
      res.status(400).json({
        error: "assets and categories must be non-empty and have the same length",
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

    // Validate currency
    if (currencyStr !== "usd" && currencyStr !== "eur") {
      res.status(400).json({
        error: "currency must be 'usd' or 'eur'",
      });
      return;
    }

    try {
      const assetPairs = assetList.map((id, i) => ({
        assetId: id,
        category: categoryList[i],
      }));

      const history = await getMultiAssetPrices(
        assetPairs,
        fromStr,
        toStr,
        currencyStr
      );

      // For assets with no history, trigger async backfill (fire-and-forget)
      for (const pair of assetPairs) {
        if (history[pair.assetId] && history[pair.assetId].length === 0) {
          backfillAsset(pair.assetId, pair.category).catch((err) => {
            logger.error("async backfill failed", {
              assetId: pair.assetId,
              category: pair.category,
              error: String(err),
            });
          });
        }
      }

      res.json({
        history,
        currency: currencyStr,
        from: fromStr,
        to: toStr,
      });
    } catch (err) {
      logger.error("history endpoint error", { error: String(err) });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}
