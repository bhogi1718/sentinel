import { Router } from "express";
import { asyncHandler } from "../../common/asyncHandler";
import { authGuard } from "../../middleware/authGuard";
import { orgContext } from "../../middleware/orgContext";
import { createOrganizationRateLimiter } from "../../middleware/rateLimiter";
import { requirePermission } from "../../middleware/requirePermission";
import { validateRequest } from "../../middleware/validateRequest";
import { auditRouter } from "../audit/audit.routes";
import { deviceRouter, fileDownloadRouter } from "../device/device.routes";
import { eventRouter } from "../event/event.routes";
import { invitationRouter } from "../invitation/invitation.routes";
import { settingsRouter } from "../settings/settings.routes";
import { organizationController } from "./organization.controller";
import { changeRoleSchema, createOrganizationSchema, memberParamsSchema } from "./organization.validation";

export const organizationRouter = Router();

organizationRouter.get("/", authGuard, asyncHandler(organizationController.list));
organizationRouter.post(
  "/",
  authGuard,
  createOrganizationRateLimiter,
  validateRequest(createOrganizationSchema),
  asyncHandler(organizationController.create),
);

// Must come before the /:orgId subtree below, whose authGuard would reject
// the download's query-param token.
organizationRouter.use(fileDownloadRouter);

/// Everything under /api/orgs/:orgId. mergeParams lets handlers and nested
/// routers read :orgId; authGuard + orgContext run once for the whole
/// subtree, so no route under it can forget them.
const orgScopedRouter = Router({ mergeParams: true });

orgScopedRouter.get("/", requirePermission("org:view"), asyncHandler(organizationController.get));
orgScopedRouter.get("/members", requirePermission("members:view"), asyncHandler(organizationController.listMembers));
orgScopedRouter.patch(
  "/members/:userId",
  requirePermission("members:manage"),
  validateRequest(changeRoleSchema),
  asyncHandler(organizationController.changeMemberRole),
);
// Any member may remove themselves (leave); removing anyone else needs
// members:manage, checked in memberService.remove.
orgScopedRouter.delete(
  "/members/:userId",
  requirePermission("members:view"),
  validateRequest(memberParamsSchema),
  asyncHandler(organizationController.removeMember),
);
orgScopedRouter.use("/devices", deviceRouter);
orgScopedRouter.use("/events", eventRouter);
orgScopedRouter.use("/settings", settingsRouter);
orgScopedRouter.use("/audit", auditRouter);
orgScopedRouter.use("/invites", invitationRouter);

organizationRouter.use("/:orgId", authGuard, orgContext, orgScopedRouter);
