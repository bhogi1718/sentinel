import { Router } from "express";
import { asyncHandler } from "../../common/asyncHandler";
import { authGuardQuery } from "../../middleware/authGuard";
import { deviceContext } from "../../middleware/deviceContext";
import { orgContext } from "../../middleware/orgContext";
import { commandRateLimiter, downloadRateLimiter, screenshotRateLimiter } from "../../middleware/rateLimiter";
import { requirePermission } from "../../middleware/requirePermission";
import { validateRequest } from "../../middleware/validateRequest";
import { commandController } from "../command/command.controller";
import { createCommandSchema, listCommandsSchema } from "../command/command.validation";
import { fileController } from "../file/file.controller";
import { downloadFileQuerySchema, listFilesQuerySchema } from "../file/file.validation";
import { metricsController } from "../metrics/metrics.controller";
import { processController } from "../process/process.controller";
import { screenshotController } from "../screenshot/screenshot.controller";
import { deviceController } from "./device.controller";
import { createDeviceSchema } from "./device.validation";

/// Mounted at /api/orgs/:orgId/devices, inside the org-scoped router - so
/// authGuard and orgContext have already run for everything here.
export const deviceRouter = Router({ mergeParams: true });

deviceRouter.get("/", requirePermission("devices:view"), asyncHandler(deviceController.list));
deviceRouter.post(
  "/",
  requirePermission("devices:manage"),
  validateRequest(createDeviceSchema),
  asyncHandler(deviceController.create),
);

/// Everything under /api/orgs/:orgId/devices/:deviceId. deviceContext runs
/// once for the whole subtree and 404s any device outside the org.
const deviceScopedRouter = Router({ mergeParams: true });

deviceScopedRouter.get("/", requirePermission("devices:view"), asyncHandler(deviceController.get));
deviceScopedRouter.delete("/", requirePermission("devices:manage"), asyncHandler(deviceController.remove));
deviceScopedRouter.get(
  "/commands",
  requirePermission("devices:view"),
  validateRequest(listCommandsSchema),
  asyncHandler(commandController.list),
);
deviceScopedRouter.post(
  "/commands",
  requirePermission("commands:send"),
  commandRateLimiter,
  validateRequest(createCommandSchema),
  asyncHandler(commandController.create),
);
deviceScopedRouter.get("/processes", requirePermission("processes:view"), asyncHandler(processController.list));
deviceScopedRouter.get(
  "/files",
  requirePermission("files:access"),
  validateRequest(listFilesQuerySchema),
  asyncHandler(fileController.list),
);
deviceScopedRouter.get("/metrics", requirePermission("devices:view"), asyncHandler(metricsController.get));
deviceScopedRouter.post(
  "/screenshot",
  requirePermission("screen:view"),
  screenshotRateLimiter,
  asyncHandler(screenshotController.capture),
);

deviceRouter.use("/:deviceId", deviceContext, deviceScopedRouter);

/// File downloads are plain browser navigations, which can't carry an
/// Authorization header, so this one route authenticates from the ?token=
/// query param instead (see authGuardQuery). Mounted at /api/orgs *ahead of*
/// the header-authenticated /:orgId subtree, with the same org, permission
/// and device checks spelled out explicitly.
export const fileDownloadRouter = Router();

fileDownloadRouter.get(
  "/:orgId/devices/:deviceId/files/download",
  authGuardQuery,
  orgContext,
  requirePermission("files:access"),
  deviceContext,
  downloadRateLimiter,
  validateRequest(downloadFileQuerySchema),
  asyncHandler(fileController.download),
);
