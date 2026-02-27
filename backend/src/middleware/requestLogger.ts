import type { Request, Response, NextFunction } from "express";
import { logger } from "../logger.js";

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  logger.info("req", {
    method: req.method,
    path: req.originalUrl,
    body: req.body && Object.keys(req.body).length > 0 ? req.body : undefined,
  });

  const originalJson = res.json.bind(res);
  let responseBody: unknown;

  res.json = (body: any) => {
    responseBody = body;
    return originalJson(body);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? "warn" : "info";

    logger[level]("res", {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration,
      body: responseBody,
    });
  });

  next();
}
