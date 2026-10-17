import { NextFunction, Request, Response } from "express";
import { ApiError } from "../common/ApiError";
import { can, Permission } from "../common/permissions";
import { getOrg } from "../common/requestContext";

/// Rejects the request with 403 unless the caller's role in req.org allows
/// the given action. Runs after orgContext, which has already turned
/// non-members away with a 404 - so reaching a 403 here means the caller
/// is a member who simply lacks the role.
export function requirePermission(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const org = getOrg(req);
      if (!can(org.role, permission)) {
        throw ApiError.forbidden("Your role in this organization doesn't allow this action");
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
