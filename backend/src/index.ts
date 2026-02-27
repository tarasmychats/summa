import express from "express";
import { createPricesRouter } from "./routes/prices.js";
import { createSearchRouter } from "./routes/search.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", createPricesRouter());
app.use("/api", createSearchRouter());

app.listen(PORT, () => {
  console.log(`WealthTrack API running on port ${PORT}`);
});

export default app;
