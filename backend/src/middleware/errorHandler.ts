import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ApiError } from "../common/ApiError";
import { sendError } from "../common/ApiResponse";
import { logger } from "../config/logger";

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    if (err.statusCode >= 500) {
      logger.error(`${req.method} ${req.originalUrl} - ${err.message}`, { stack: err.stack });
    }
    sendError(res, err.statusCode, err.code, err.message, err.details);
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    logger.error(`${req.method} ${req.originalUrl} - Prisma error ${err.code}: ${err.message}`);
    sendError(res, 500, "DATABASE_ERROR", "A database error occurred");
    return;
  }

  const error = err instanceof Error ? err : new Error("Unknown error");
  logger.error(`${req.method} ${req.originalUrl} - ${error.message}`, { stack: error.stack });
  sendError(res, 500, "INTERNAL_ERROR", "Internal server error");
}
