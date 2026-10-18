import { Request } from "express";
import { AuditSubject } from "../modules/audit/audit.types";
import { AuthenticatedUser } from "../modules/auth/auth.types";
import { OrgDevice } from "../modules/device/device.types";
import { OrgContext } from "../modules/organization/organization.types";
import { ApiError } from "./ApiError";

// Typed accessors for what the auth/org/device middlewares attach to the
// request. A missing value here means a route was registered without the
// middleware it depends on - a server bug, not a client error, so it's
// reported as a 500 rather than a 401/404.

export function getUser(req: Request): AuthenticatedUser {
  if (!req.user) throw ApiError.internal("Route is missing authGuard");
  return req.user;
}

export function getOrg(req: Request): OrgContext {
  if (!req.org) throw ApiError.internal("Route is missing orgContext");
  return req.org;
}

export function getDevice(req: Request): OrgDevice {
  if (!req.device) throw ApiError.internal("Route is missing deviceContext");
  return req.device;
}

/// The member and device of a device-scoped request, for its audit entry.
export function getAuditSubject(req: Request): AuditSubject {
  return { actor: getUser(req), device: getDevice(req) };
}
