import { Router } from "express";
import { asyncHandler } from "../../common/asyncHandler";
import { authGuard } from "../../middleware/authGuard";
import { deviceController } from "./device.controller";

export const deviceRouter = Router();

deviceRouter.get("/status", authGuard, asyncHandler(deviceController.getStatus));
