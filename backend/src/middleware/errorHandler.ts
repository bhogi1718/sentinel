import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ApiError } from "../common/ApiError";
import { sendError } from "../common/ApiResponse";
import { logger } from "../config/logger";

// The file-download route accepts its access token as a ?token= query
// param (see authGuardQuery's doc comment), since a plain <a href> can't
// attach an Authorization header - that means req.originalUrl can carry a
// live JWT, and nothing here should ever hand it to the logger verbatim.
const SENSITIVE_QUERY_PARAMS = ["token"];

export function redactSensitiveQueryParams(originalUrl: string): string {
  const [path, query] = originalUrl.split("?", 2);
  if (!query) return originalUrl;

  const params = new URLSearchParams(query);
  for (const param of SENSITIVE_QUERY_PARAMS) {
    if (params.has(param)) params.set(param, "[REDACTED]");
  }

  return `${path}?${params.toString()}`;
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`Route not found: ${req.method} ${redactSensitiveQueryParams(req.originalUrl)}`));
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const safeUrl = redactSensitiveQueryParams(req.originalUrl);

  if (err instanceof ApiError) {
    if (err.statusCode >= 500) {
      logger.error(`${req.method} ${safeUrl} - ${err.message}`, { stack: err.stack });
    }
    sendError(res, err.statusCode, err.code, err.message, err.details);
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    logger.error(`${req.method} ${safeUrl} - Prisma error ${err.code}: ${err.message}`);
    sendError(res, 500, "DATABASE_ERROR", "A database error occurred");
    return;
  }

  const error = err instanceof Error ? err : new Error("Unknown error");
  logger.error(`${req.method} ${safeUrl} - ${error.message}`, { stack: error.stack });
  sendError(res, 500, "INTERNAL_ERROR", "Internal server error");
}
