import { Router } from "express";
import { asyncHandler } from "../../common/asyncHandler";
import { authRateLimiter } from "../../middleware/rateLimiter";
import { requirePermission } from "../../middleware/requirePermission";
import { validateRequest } from "../../middleware/validateRequest";
import { settingsController } from "./settings.controller";
import { connectTelegramSchema } from "./settings.validation";

/// Mounted at /api/orgs/:orgId/settings, inside the org-scoped router.
export const settingsRouter = Router({ mergeParams: true });

settingsRouter.get("/integrations", requirePermission("org:view"), asyncHandler(settingsController.getIntegrationStatus));
settingsRouter.post(
  "/integrations/telegram",
  requirePermission("settings:manage"),
  authRateLimiter,
  validateRequest(connectTelegramSchema),
  asyncHandler(settingsController.connectTelegram),
);
settingsRouter.delete(
  "/integrations/telegram",
  requirePermission("settings:manage"),
  authRateLimiter,
  asyncHandler(settingsController.disconnectTelegram),
);
