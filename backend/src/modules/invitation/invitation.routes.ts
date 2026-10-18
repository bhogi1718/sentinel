import { Request, Response, Router } from "express";
import { sendSuccess } from "../../common/ApiResponse";
import { asyncHandler } from "../../common/asyncHandler";
import { getOrg, getUser } from "../../common/requestContext";
import { authGuard } from "../../middleware/authGuard";
import { inviteRateLimiter } from "../../middleware/rateLimiter";
import { requirePermission } from "../../middleware/requirePermission";
import { validateRequest } from "../../middleware/validateRequest";
import { invitationService } from "./invitation.service";
import { CreateInvitationInput, createInvitationSchema, invitationIdSchema, inviteTokenParamsSchema } from "./invitation.validation";

/// Mounted at /api/orgs/:orgId/invites, inside the org-scoped router:
/// managing an organization's invite links is for its owners.
export const invitationRouter = Router({ mergeParams: true });

invitationRouter.use(requirePermission("members:manage"));

invitationRouter.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    sendSuccess(res, await invitationService.listPending(getOrg(req).id));
  }),
);

invitationRouter.post(
  "/",
  validateRequest(createInvitationSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const created = await invitationService.create(getOrg(req).id, getUser(req), req.body as CreateInvitationInput);
    sendSuccess(res, created, 201);
  }),
);

invitationRouter.delete(
  "/:invitationId",
  validateRequest(invitationIdSchema),
  asyncHandler(async (req: Request, res: Response) => {
    await invitationService.revoke(getOrg(req).id, getUser(req), req.params.invitationId);
    sendSuccess(res, { revoked: true });
  }),
);

/// Mounted at /api/invites: what the person holding a link sees and does.
/// Looking a link up needs no account; accepting it does.
export const publicInvitationRouter = Router();

publicInvitationRouter.get(
  "/:token",
  inviteRateLimiter,
  validateRequest(inviteTokenParamsSchema),
  asyncHandler(async (req: Request, res: Response) => {
    sendSuccess(res, await invitationService.lookup(req.params.token));
  }),
);

publicInvitationRouter.post(
  "/:token/accept",
  authGuard,
  inviteRateLimiter,
  validateRequest(inviteTokenParamsSchema),
  asyncHandler(async (req: Request, res: Response) => {
    sendSuccess(res, await invitationService.accept(getUser(req), req.params.token));
  }),
);
