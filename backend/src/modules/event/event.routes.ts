import { Router } from "express";
import { asyncHandler } from "../../common/asyncHandler";
import { requirePermission } from "../../middleware/requirePermission";
import { validateRequest } from "../../middleware/validateRequest";
import { eventController } from "./event.controller";
import { listEventsSchema } from "./event.validation";

/// Mounted at /api/orgs/:orgId/events, inside the org-scoped router.
export const eventRouter = Router({ mergeParams: true });

eventRouter.get("/", requirePermission("devices:view"), validateRequest(listEventsSchema), asyncHandler(eventController.list));
