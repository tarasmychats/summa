import type { Request, Response, NextFunction } from "express";
import { logger } from "../logger.js";

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? "warn" : "info";

    logger[level]("request", {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration,
    });
  });

  next();
}
