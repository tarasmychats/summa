import chalk from "chalk";
import { config } from "./config.js";

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_COLORS: Record<LogLevel, (s: string) => string> = {
  debug: chalk.gray,
  info: chalk.green,
  warn: chalk.yellow,
  error: chalk.red,
};

const minLevel: LogLevel = config.logLevel as LogLevel;
const isDev = config.nodeEnv !== "production";

function log(level: LogLevel, msg: string, data?: Record<string, unknown>) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;

  if (isDev) {
    const time = chalk.dim(new Date().toISOString());
    const tag = LEVEL_COLORS[level](`[${level.toUpperCase()}]`);
    const extra = data ? " " + chalk.dim(JSON.stringify(data)) : "";
    const line = `${time} ${tag} ${msg}${extra}`;

    if (level === "error") {
      process.stderr.write(line + "\n");
    } else {
      process.stdout.write(line + "\n");
    }
    return;
  }

  const entry = {
    level,
    msg,
    time: new Date().toISOString(),
    ...data,
  };

  const line = JSON.stringify(entry);

  if (level === "error") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

export const logger = {
  debug: (msg: string, data?: Record<string, unknown>) => log("debug", msg, data),
  info: (msg: string, data?: Record<string, unknown>) => log("info", msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => log("warn", msg, data),
  error: (msg: string, data?: Record<string, unknown>) => log("error", msg, data),
};
