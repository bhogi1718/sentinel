import { Router } from "express";
import { asyncHandler } from "../../common/asyncHandler";
import { authGuard } from "../../middleware/authGuard";
import { commandRateLimiter } from "../../middleware/rateLimiter";
import { validateRequest } from "../../middleware/validateRequest";
import { commandController } from "../command/command.controller";
import { createCommandSchema } from "../command/command.validation";
import { deviceController } from "./device.controller";

export const deviceRouter = Router();

deviceRouter.get("/status", authGuard, asyncHandler(deviceController.getStatus));
deviceRouter.post(
  "/commands",
  authGuard,
  commandRateLimiter,
  validateRequest(createCommandSchema),
  asyncHandler(commandController.create),
);
