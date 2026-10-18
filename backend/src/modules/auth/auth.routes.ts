import { Router } from "express";
import { asyncHandler } from "../../common/asyncHandler";
import { authGuard } from "../../middleware/authGuard";
import { authRateLimiter, signupRateLimiter } from "../../middleware/rateLimiter";
import { validateRequest } from "../../middleware/validateRequest";
import { authController } from "./auth.controller";
import { changePasswordSchema, loginSchema, refreshSchema, signupSchema } from "./auth.validation";

export const authRouter = Router();

authRouter.post("/signup", signupRateLimiter, validateRequest(signupSchema), asyncHandler(authController.signup));
authRouter.post("/login", authRateLimiter, validateRequest(loginSchema), asyncHandler(authController.login));
authRouter.post("/refresh", authRateLimiter, validateRequest(refreshSchema), asyncHandler(authController.refresh));
authRouter.post("/logout", validateRequest(refreshSchema), asyncHandler(authController.logout));
authRouter.get("/me", authGuard, asyncHandler(authController.me));
authRouter.post(
  "/change-password",
  authGuard,
  authRateLimiter,
  validateRequest(changePasswordSchema),
  asyncHandler(authController.changePassword),
);
