import { Router } from "express";
import { asyncHandler } from "../../common/asyncHandler";
import { authGuard } from "../../middleware/authGuard";
import { settingsController } from "./settings.controller";

export const settingsRouter = Router();

settingsRouter.get("/integrations", authGuard, asyncHandler(settingsController.getIntegrationStatus));
