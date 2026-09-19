import { NextFunction, Request, Response } from "express";
import { ApiError } from "../common/ApiError";
import { authService } from "../modules/auth/auth.service";

export function authGuard(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    next(ApiError.unauthorized("Missing or malformed Authorization header"));
    return;
  }

  const token = header.slice("Bearer ".length);

  try {
    req.user = authService.verifyAccessToken(token);
    next();
  } catch (err) {
    next(err);
  }
}

/// File downloads are triggered by plain browser navigation (an <a href>
/// or window.location assignment), which cannot attach an Authorization
/// header - the access token has to travel as a query param instead. Kept
/// separate from authGuard rather than folded in, so every other route
/// keeps requiring the header and this broader (and slightly less safe,
/// since URLs can end up in logs/history) acceptance is scoped to only
/// the one endpoint that genuinely needs it.
export function authGuardQuery(req: Request, _res: Response, next: NextFunction): void {
  const token = req.query.token;

  if (typeof token !== "string" || !token) {
    next(ApiError.unauthorized("Missing token query parameter"));
    return;
  }

  try {
    req.user = authService.verifyAccessToken(token);
    next();
  } catch (err) {
    next(err);
  }
}
