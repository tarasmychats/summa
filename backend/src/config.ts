type LogLevel = "debug" | "info" | "warn" | "error";

const VALID_LOG_LEVELS: ReadonlySet<string> = new Set(["debug", "info", "warn", "error"]);

function parseLogLevel(value: string | undefined): LogLevel {
  if (value && VALID_LOG_LEVELS.has(value)) {
    return value as LogLevel;
  }
  return "info";
}

export const config = {
  port: Number(process.env.PORT) || 3001,
  logLevel: parseLogLevel(process.env.LOG_LEVEL),

  db: {
    connectionString: process.env.DATABASE_URL,
    host: process.env.PGHOST || "localhost",
    port: Number(process.env.PGPORT) || 5432,
    user: process.env.PGUSER || "wealthtrack",
    password: process.env.PGPASSWORD || "wealthtrack",
    database: process.env.PGDATABASE || "wealthtrack",
  },

  coingeckoApiKey: process.env.COINGECKO_API_KEY,
  exchangerateApiKey: process.env.EXCHANGERATE_API_KEY,
};
