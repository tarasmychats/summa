import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

loadDotenv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../.env") });

type LogLevel = "debug" | "info" | "warn" | "error";

const VALID_LOG_LEVELS: ReadonlySet<string> = new Set(["debug", "info", "warn", "error"]);

function parseLogLevel(value: string | undefined): LogLevel {
  if (value && VALID_LOG_LEVELS.has(value)) {
    return value as LogLevel;
  }
  return "info";
}

export const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT) || 3001,
  logLevel: parseLogLevel(process.env.LOG_LEVEL),

  db: {
    connectionString: process.env.DATABASE_URL || undefined,
    host: process.env.PGHOST || "localhost",
    port: Number(process.env.PGPORT) || 5432,
    user: process.env.PGUSER || "wealthtrack",
    password: process.env.PGPASSWORD || "wealthtrack",
    database: process.env.PGDATABASE || "wealthtrack",
  },

  runCronOnStartup: process.env.RUN_CRON_ON_STARTUP === "true",

  coingeckoApiKey: process.env.COINGECKO_API_KEY || undefined,
  exchangerateApiKey: process.env.EXCHANGERATE_API_KEY || undefined,
};
