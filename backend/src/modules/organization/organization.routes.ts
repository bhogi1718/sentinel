import { Router } from "express";
import { asyncHandler } from "../../common/asyncHandler";
import { authGuard } from "../../middleware/authGuard";
import { orgContext } from "../../middleware/orgContext";
import { requirePermission } from "../../middleware/requirePermission";
import { deviceRouter, fileDownloadRouter } from "../device/device.routes";
import { eventRouter } from "../event/event.routes";
import { settingsRouter } from "../settings/settings.routes";
import { organizationController } from "./organization.controller";

export const organizationRouter = Router();

organizationRouter.get("/", authGuard, asyncHandler(organizationController.list));

// Must come before the /:orgId subtree below, whose authGuard would reject
// the download's query-param token.
organizationRouter.use(fileDownloadRouter);

/// Everything under /api/orgs/:orgId. mergeParams lets handlers and nested
/// routers read :orgId; authGuard + orgContext run once for the whole
/// subtree, so no route under it can forget them.
const orgScopedRouter = Router({ mergeParams: true });

orgScopedRouter.get("/", requirePermission("org:view"), asyncHandler(organizationController.get));
orgScopedRouter.get("/members", requirePermission("members:view"), asyncHandler(organizationController.listMembers));
orgScopedRouter.use("/devices", deviceRouter);
orgScopedRouter.use("/events", eventRouter);
orgScopedRouter.use("/settings", settingsRouter);

organizationRouter.use("/:orgId", authGuard, orgContext, orgScopedRouter);
