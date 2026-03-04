import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../.env") });

import express from "express";
import { createPricesRouter } from "./routes/prices.js";
import { createSearchRouter } from "./routes/search.js";
import { createHistoryRouter } from "./routes/history.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { logger } from "./logger.js";
import { initDb } from "./db.js";
import { startDailyCron } from "./services/cronJob.js";

const app = express();
const PORT = process.env.PORT || 3001;

let dbReady = false;

export function isDbReady(): boolean {
  return dbReady;
}

app.use(express.json());
app.use(requestLogger);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", db: dbReady });
});

app.use("/api", createPricesRouter());
app.use("/api", createSearchRouter());
app.use("/api", createHistoryRouter());

export async function startServer(): Promise<void> {
  try {
    await initDb();
    dbReady = true;
    logger.info("database initialized");
  } catch (err) {
    logger.error("database initialization failed, running without DB", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  app.listen(PORT, () => {
    logger.info("server started", { port: Number(PORT) });
    if (dbReady) {
      startDailyCron();
    } else {
      logger.warn("cron job skipped — database not available");
    }
  });
}

// Only auto-start when running as main module (not in tests)
const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === resolve(currentFile)) {
  startServer();
}

export default app;
