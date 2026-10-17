import { ApiError } from "../../common/ApiError";
import { findAgentSocket } from "../../realtime/socket";
import { OrgDevice } from "./device.types";

/// The live agent socket for a device that has already been authorized for
/// this request (see deviceContext), or a 409 explaining why it can't be
/// reached. `action` completes the sentence "cannot ..." in the error, e.g.
/// "fetch metrics".
export async function connectedAgentFor(device: OrgDevice, action: string) {
  if (!device.isOnline) {
    throw ApiError.conflict(`Device is offline - cannot ${action}`);
  }

  const agentSocket = await findAgentSocket(device.id);
  if (!agentSocket) {
    throw ApiError.conflict("Device is not currently connected");
  }

  return agentSocket;
}
