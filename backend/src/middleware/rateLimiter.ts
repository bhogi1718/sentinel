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

// Remote commands (lock/restart/shutdown/etc.) are high-impact actions on
// real hardware - capped well below general API traffic to limit the blast
// radius of a compromised session spamming destructive commands.
export const commandRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: env.NODE_ENV === "production" ? 10 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => next(ApiError.tooManyRequests("Too many commands sent, try again later")),
});

// File downloads stream over the single agent Socket.IO connection - unlike
// stateless JSON endpoints, each one holds a pending request + open HTTP
// response for as long as the transfer takes, so this also caps request
// *rate* (concurrency is separately capped in file.service.ts).
export const downloadRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: env.NODE_ENV === "production" ? 20 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => next(ApiError.tooManyRequests("Too many downloads requested, try again later")),
});
