import { Request, Response } from "express";
import { sendSuccess } from "../../common/ApiResponse";
import { getOrg, getUser } from "../../common/requestContext";
import { memberService } from "./member.service";
import { ChangeRoleInput, CreateOrganizationInput } from "./organization.validation";
import { organizationService } from "./organization.service";

export const organizationController = {
  async create(req: Request, res: Response): Promise<void> {
    const { name } = req.body as CreateOrganizationInput;
    sendSuccess(res, await organizationService.create(getUser(req), name), 201);
  },

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

  async changeMemberRole(req: Request, res: Response): Promise<void> {
    const { role } = req.body as ChangeRoleInput;
    await memberService.changeRole(getOrg(req), getUser(req), req.params.userId, role);
    sendSuccess(res, { role });
  },

  /// Removing someone else, or leaving when it's the caller's own id.
  async removeMember(req: Request, res: Response): Promise<void> {
    await memberService.remove(getOrg(req), getUser(req), req.params.userId);
    sendSuccess(res, { removed: true });
  },
};
