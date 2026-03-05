import { Router } from "express";
import { searchAssets } from "../repositories/assets.js";
import type { SearchResponse } from "../types.js";

export function createSearchRouter(): Router {
  const router = Router();

  router.get("/search", async (req, res) => {
    const q = ((req.query.q as string) ?? "").trim();
    const category = (req.query.category as string) || undefined;

    if (!q) {
      res.status(400).json({ error: "Query parameter 'q' is required" });
      return;
    }

    const results = await searchAssets(q, category);
    const response: SearchResponse = { results };
    res.json(response);
  });

  return router;
}
