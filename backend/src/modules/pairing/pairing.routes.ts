import { Request, Response, Router } from "express";
import { sendSuccess } from "../../common/ApiResponse";
import { asyncHandler } from "../../common/asyncHandler";
import { getOrg, getUser } from "../../common/requestContext";
import { pairingRateLimiter } from "../../middleware/rateLimiter";
import { validateRequest } from "../../middleware/validateRequest";
import { pairingService } from "./pairing.service";
import {
  ClaimPairingCodeInput,
  claimPairingCodeSchema,
  CreatePairingCodeInput,
  createPairingCodeSchema,
  pairingCodeIdSchema,
} from "./pairing.validation";

/// Mounted at /api/orgs/:orgId/devices/pairing-codes, behind the
/// devices:manage check: creating and cancelling an organization's codes.
export const pairingRouter = Router({ mergeParams: true });

pairingRouter.post(
  "/",
  validateRequest(createPairingCodeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { name } = req.body as CreatePairingCodeInput;
    sendSuccess(res, await pairingService.create(getOrg(req).id, getUser(req), name), 201);
  }),
);

pairingRouter.delete(
  "/:pairingCodeId",
  validateRequest(pairingCodeIdSchema),
  asyncHandler(async (req: Request, res: Response) => {
    await pairingService.cancel(getOrg(req).id, req.params.pairingCodeId);
    sendSuccess(res, { cancelled: true });
  }),
);

/// Mounted at /api/agent: what an agent calls before it has a token. The
/// code is the only credential, so this is rate-limited per address.
export const agentPairingRouter = Router();

agentPairingRouter.post(
  "/pair",
  pairingRateLimiter,
  validateRequest(claimPairingCodeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { code } = req.body as ClaimPairingCodeInput;
    sendSuccess(res, await pairingService.claim(code), 201);
  }),
);
