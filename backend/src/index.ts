import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../.env") });

import express from "express";
import { createPricesRouter } from "./routes/prices.js";
import { createSearchRouter } from "./routes/search.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { logger } from "./logger.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(requestLogger);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", createPricesRouter());
app.use("/api", createSearchRouter());

app.listen(PORT, () => {
  logger.info("server started", { port: Number(PORT) });
});

export default app;
