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

// Each demo session issues a refresh token; capped so the shared demo
// can't be used to fill the database.
export const demoSessionRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.NODE_ENV === "production" ? 20 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => next(ApiError.tooManyRequests("Too many demo sessions started, try again later")),
});

// Each capture round-trips through GDI + PNG encoding on the agent side
// (via the per-session helper) and produces a multi-hundred-KB-to-few-MB
// payload - capped tighter than general traffic for the same resource-cost
// reason as commandRateLimiter.
export const screenshotRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: env.NODE_ENV === "production" ? 10 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => next(ApiError.tooManyRequests("Too many screenshots requested, try again later")),
});

// Every sign-up adds an account and an organization to a free-tier
// database, so a script mustn't be able to create them in bulk.
export const signupRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: env.NODE_ENV === "production" ? 5 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => next(ApiError.tooManyRequests("Too many accounts created, try again later")),
});

// Creating organizations is capped per user in the service; this caps the
// request rate on top.
export const createOrganizationRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: env.NODE_ENV === "production" ? 10 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => next(ApiError.tooManyRequests("Too many organizations created, try again later")),
});

// Invite links are long random tokens, so guessing one isn't practical;
// this just keeps the public lookup from being hammered.
export const inviteRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.NODE_ENV === "production" ? 30 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => next(ApiError.tooManyRequests("Too many invite requests, try again later")),
});

// A pairing code is the only credential an agent presents to get its token,
// so claims are capped per address: with codes living 15 minutes and
// working once, guessing one in a few attempts is out of reach.
export const pairingRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.NODE_ENV === "production" ? 10 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => next(ApiError.tooManyRequests("Too many pairing attempts, try again later")),
});
