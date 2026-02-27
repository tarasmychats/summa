import express from "express";

const app = express();
const PORT = process.env.PORT || 3001;

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`WealthTrack API running on port ${PORT}`);
});

export default app;
