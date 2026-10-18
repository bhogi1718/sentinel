import { Request, Response, Router } from "express";
import { sendSuccess } from "../../common/ApiResponse";
import { asyncHandler } from "../../common/asyncHandler";
import { getOrg } from "../../common/requestContext";
import { requirePermission } from "../../middleware/requirePermission";
import { validateRequest } from "../../middleware/validateRequest";
import { auditService } from "./audit.service";
import { listAuditSchema, ListAuditQuery } from "./audit.validation";

/// Mounted at /api/orgs/:orgId/audit, inside the org-scoped router. Read
/// only: there is no route that changes or removes an entry.
export const auditRouter = Router({ mergeParams: true });

auditRouter.get(
  "/",
  requirePermission("audit:view"),
  validateRequest(listAuditSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as ListAuditQuery;
    sendSuccess(res, await auditService.list(getOrg(req).id, query));
  }),
);
