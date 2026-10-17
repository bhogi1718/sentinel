import { ApiError } from "../common/ApiError";
import { asyncHandler } from "../common/asyncHandler";
import { getOrg } from "../common/requestContext";
import { deviceService } from "../modules/device/device.service";

/// Resolves the `:deviceId` route param within req.org and attaches it as
/// req.device. Runs after orgContext. The lookup is scoped by organization
/// in the query itself, so a device in another organization is
/// indistinguishable from one that doesn't exist (404).
export const deviceContext = asyncHandler(async (req, _res, next) => {
  const org = getOrg(req);
  const deviceId = req.params.deviceId;
  if (!deviceId) throw ApiError.internal("deviceContext used on a route without a :deviceId param");

  const device = await deviceService.findInOrg(org.id, deviceId);
  if (!device) throw ApiError.notFound("Device not found");

  req.device = device;
  next();
});
