import rateLimit from "express-rate-limit";
import { ApiError } from "../common/ApiError";
import { env } from "../config/env";

export const generalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => next(ApiError.tooManyRequests()),
});

// Stricter limit on auth endpoints specifically, to resist credential
// brute-forcing against the single admin account. Raised in development
// so manual testing doesn't get self-blocked; production always uses 10.
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.NODE_ENV === "production" ? 10 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => next(ApiError.tooManyRequests("Too many auth attempts, try again later")),
});
