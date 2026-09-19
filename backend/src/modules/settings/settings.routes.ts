import { Router } from "express";
import { asyncHandler } from "../../common/asyncHandler";
import { authGuard } from "../../middleware/authGuard";
import { authRateLimiter } from "../../middleware/rateLimiter";
import { validateRequest } from "../../middleware/validateRequest";
import { settingsController } from "./settings.controller";
import { connectTelegramSchema } from "./settings.validation";

export const settingsRouter = Router();

settingsRouter.get("/integrations", authGuard, asyncHandler(settingsController.getIntegrationStatus));
settingsRouter.post(
  "/integrations/telegram",
  authGuard,
  authRateLimiter,
  validateRequest(connectTelegramSchema),
  asyncHandler(settingsController.connectTelegram),
);
settingsRouter.delete(
  "/integrations/telegram",
  authGuard,
  authRateLimiter,
  asyncHandler(settingsController.disconnectTelegram),
);
