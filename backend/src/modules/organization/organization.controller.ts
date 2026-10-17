import { Request, Response } from "express";
import { sendSuccess } from "../../common/ApiResponse";
import { getOrg, getUser } from "../../common/requestContext";
import { organizationService } from "./organization.service";

export const organizationController = {
  async list(req: Request, res: Response): Promise<void> {
    const organizations = await organizationService.listForUser(getUser(req).id);
    sendSuccess(res, organizations);
  },

  // asyncHandler requires every handler to return a Promise.
  // eslint-disable-next-line @typescript-eslint/require-await
  async get(req: Request, res: Response): Promise<void> {
    sendSuccess(res, organizationService.forMember(getOrg(req)));
  },

  async listMembers(req: Request, res: Response): Promise<void> {
    const members = await organizationService.listMembers(getOrg(req).id);
    sendSuccess(res, members);
  },
};
