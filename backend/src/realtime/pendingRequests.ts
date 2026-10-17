import { logger } from "../config/logger";

/// A request sent to one device's agent that is still waiting for its reply.
export interface DeviceBoundRequest {
  /// The device the request was sent to - the only one allowed to answer it.
  deviceId: string;
  timeout: NodeJS.Timeout;
}

// Agent replies arrive as separate events matched back to their request by
// id (the agent's Socket.IO client can't answer a server-initiated ack).
// Request ids are random UUIDs, but with many tenants' agents on one server,
// knowing an id must still not be enough: a reply only counts when it comes
// from the agent of the device that was actually asked.

/// The pending request with this id, if it exists and was sent to
/// `fromDeviceId`. Leaves it pending - for streams of replies (download
/// chunks) that settle later.
export function pendingFor<T extends DeviceBoundRequest>(
  pending: Map<string, T>,
  requestId: string,
  fromDeviceId: string,
): T | undefined {
  const request = pending.get(requestId);
  if (!request) return undefined;

  if (request.deviceId !== fromDeviceId) {
    logger.warn(
      `Ignoring reply to request ${requestId} from device ${fromDeviceId}: it was sent to device ${request.deviceId}`,
    );
    return undefined;
  }

  return request;
}

/// Like pendingFor, but also settles the request: cancels its timeout and
/// removes it, so the caller can resolve or reject it exactly once.
export function settlePending<T extends DeviceBoundRequest>(
  pending: Map<string, T>,
  requestId: string,
  fromDeviceId: string,
): T | undefined {
  const request = pendingFor(pending, requestId, fromDeviceId);
  if (!request) return undefined;

  clearTimeout(request.timeout);
  pending.delete(requestId);
  return request;
}
