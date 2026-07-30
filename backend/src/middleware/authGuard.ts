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
