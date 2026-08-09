import { Router } from "express";
import { asyncHandler } from "../../common/asyncHandler";
import { authGuard, authGuardQuery } from "../../middleware/authGuard";
import { commandRateLimiter, downloadRateLimiter } from "../../middleware/rateLimiter";
import { validateRequest } from "../../middleware/validateRequest";
import { commandController } from "../command/command.controller";
import { createCommandSchema } from "../command/command.validation";
import { fileController } from "../file/file.controller";
import { downloadFileQuerySchema, listFilesQuerySchema } from "../file/file.validation";
import { metricsController } from "../metrics/metrics.controller";
import { processController } from "../process/process.controller";
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
deviceRouter.get("/processes", authGuard, asyncHandler(processController.list));
deviceRouter.get(
  "/files",
  authGuard,
  validateRequest(listFilesQuerySchema),
  asyncHandler(fileController.list),
);
deviceRouter.get(
  "/files/download",
  authGuardQuery,
  downloadRateLimiter,
  validateRequest(downloadFileQuerySchema),
  asyncHandler(fileController.download),
);
deviceRouter.get("/metrics", authGuard, asyncHandler(metricsController.get));
