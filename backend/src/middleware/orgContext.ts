import { ApiError } from "../common/ApiError";
import { asyncHandler } from "../common/asyncHandler";
import { getUser } from "../common/requestContext";
import { organizationRepository } from "../modules/organization/organization.repository";

/// Resolves the `:orgId` route param to the caller's membership in that
/// organization and attaches it as req.org. Runs after authGuard.
///
/// A caller who isn't a member gets the same 404 as for an organization
/// that doesn't exist, so organization ids can't be probed. The role is
/// read from the database on every request (not baked into the JWT), so
/// removing a member or changing their role takes effect immediately.
export const orgContext = asyncHandler(async (req, _res, next) => {
  const user = getUser(req);
  const orgId = req.params.orgId;
  if (!orgId) throw ApiError.internal("orgContext used on a route without an :orgId param");

  const membership = await organizationRepository.findMembership(user.id, orgId);
  if (!membership) throw ApiError.notFound("Organization not found");

  req.org = { id: orgId, name: membership.org.name, slug: membership.org.slug, role: membership.role };
  next();
});
