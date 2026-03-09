import { Router } from "express";
import { getOrCreateSettings, updateSettings } from "../repositories/userSettings.js";
import { getUserAssets, createAsset, updateAsset, deleteAsset } from "../repositories/userAssets.js";
import { isAssetEnabled } from "../repositories/assets.js";
import { getTransactions, createTransaction, deleteTransaction } from "../repositories/userTransactions.js";
import { deleteUser } from "../repositories/users.js";

export function createUserRouter(): Router {
  const router = Router();

  // --- Settings ---

  router.get("/settings", async (req, res) => {
    try {
      const settings = await getOrCreateSettings(req.userId!);
      res.json({ settings });
    } catch (error) {
      console.error("Failed to get settings:", error);
      res.status(500).json({ error: "Failed to get settings" });
    }
  });

  router.patch("/settings", async (req, res) => {
    try {
      const { displayCurrency, isPremium } = req.body;
      const settings = await updateSettings(req.userId!, { displayCurrency, isPremium });
      res.json({ settings });
    } catch (error) {
      console.error("Failed to update settings:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // --- Assets ---

  router.get("/assets", async (req, res) => {
    try {
      const assets = await getUserAssets(req.userId!);
      res.json({ assets });
    } catch (error) {
      console.error("Failed to get assets:", error);
      res.status(500).json({ error: "Failed to get assets" });
    }
  });

  router.post("/assets", async (req, res) => {
    const { name, symbol, ticker, category } = req.body;
    if (!name || !symbol || !ticker || !category) {
      res.status(400).json({ error: "Required: name, symbol, ticker, category" });
      return;
    }

    try {
      const enabled = await isAssetEnabled(symbol, category);
      if (!enabled) {
        res.status(403).json({ error: "This asset is currently disabled" });
        return;
      }

      const asset = await createAsset(req.userId!, {
        name, symbol, ticker, category,
      });
      res.status(201).json({ asset });
    } catch (error) {
      console.error("Failed to create asset:", error);
      res.status(500).json({ error: "Failed to create asset" });
    }
  });

  router.patch("/assets/:id", async (req, res) => {
    const { name } = req.body;
    try {
      const asset = await updateAsset(req.userId!, req.params.id, { name });
      if (!asset) {
        res.status(404).json({ error: "Asset not found" });
        return;
      }
      res.json({ asset });
    } catch (error) {
      console.error("Failed to update asset:", error);
      res.status(500).json({ error: "Failed to update asset" });
    }
  });

  router.delete("/assets/:id", async (req, res) => {
    try {
      const deleted = await deleteAsset(req.userId!, req.params.id);
      if (!deleted) {
        res.status(404).json({ error: "Asset not found" });
        return;
      }
      res.json({ message: "Asset deleted" });
    } catch (error) {
      console.error("Failed to delete asset:", error);
      res.status(500).json({ error: "Failed to delete asset" });
    }
  });

  // --- Transactions ---

  router.get("/assets/:id/transactions", async (req, res) => {
    try {
      const transactions = await getTransactions(req.userId!, req.params.id);
      res.json({ transactions });
    } catch (error) {
      console.error("Failed to get transactions:", error);
      res.status(500).json({ error: "Failed to get transactions" });
    }
  });

  router.post("/assets/:id/transactions", async (req, res) => {
    const { type, amount, date, note } = req.body;
    if (!type || amount === undefined || !date) {
      res.status(400).json({ error: "Required: type, amount, date" });
      return;
    }

    try {
      const transaction = await createTransaction(req.userId!, req.params.id, {
        type, amount, date, note,
      });
      res.status(201).json({ transaction });
    } catch (error) {
      console.error("Failed to create transaction:", error);
      res.status(500).json({ error: "Failed to create transaction" });
    }
  });

  router.delete("/assets/:id/transactions/:txId", async (req, res) => {
    try {
      const deleted = await deleteTransaction(req.userId!, req.params.txId);
      if (!deleted) {
        res.status(404).json({ error: "Transaction not found" });
        return;
      }
      res.json({ message: "Transaction deleted" });
    } catch (error) {
      console.error("Failed to delete transaction:", error);
      res.status(500).json({ error: "Failed to delete transaction" });
    }
  });

  // --- Account ---

  router.delete("/account", async (req, res) => {
    try {
      await deleteUser(req.userId!);
      res.json({ message: "Account deleted" });
    } catch (error) {
      console.error("Failed to delete account:", error);
      res.status(500).json({ error: "Failed to delete account" });
    }
  });

  return router;
}
