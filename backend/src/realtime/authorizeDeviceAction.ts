import { can, Permission } from "../common/permissions";
import { AuthenticatedUser } from "../modules/auth/auth.types";
import { deviceService } from "../modules/device/device.service";
import { OrgDevice } from "../modules/device/device.types";
import { organizationRepository } from "../modules/organization/organization.repository";

/// The socket-side equivalent of the REST chain orgContext ->
/// requirePermission -> deviceContext, with the same rules: the caller must
/// be a member of the organization, their role must allow the action, and
/// the device must belong to that organization. Throws an Error whose
/// message is safe to send back in an ack.
///
/// Non-membership and a device outside the organization produce the same
/// message, so ids can't be probed from a socket either.
export async function authorizeDeviceAction(
  user: AuthenticatedUser,
  target: { orgId: string; deviceId: string },
  permission: Permission,
): Promise<OrgDevice> {
  const membership = await organizationRepository.findMembership(user.id, target.orgId);
  if (!membership) throw new Error("Device not found");

  if (!can(membership.role, permission, { isDemo: membership.org.isDemo })) {
    throw new Error("Your role in this organization doesn't allow this action");
  }

  const device = await deviceService.findInOrg(target.orgId, target.deviceId);
  if (!device) throw new Error("Device not found");

  return device;
}
