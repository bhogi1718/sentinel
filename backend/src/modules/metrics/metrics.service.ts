import { randomUUID } from "crypto";
import { ApiError } from "../../common/ApiError";
import { connectedAgentFor } from "../device/agentConnection";
import { OrgDevice } from "../device/device.types";
import { DeviceBoundRequest, settlePending } from "../../realtime/pendingRequests";
import { SystemMetrics } from "./metrics.types";

const METRICS_TIMEOUT_MS = 15_000;

interface PendingRequest extends DeviceBoundRequest {
  resolve: (metrics: SystemMetrics) => void;
  reject: (error: Error) => void;
}

// Same plain-event-plus-reply pattern as commands/processes/files: the
// agent's Socket.IO client library can't respond to a server-initiated
// ack, so a request is tracked here by ID and resolved when the matching
// metrics:response event arrives (see agentNamespace.ts).
const pendingRequests = new Map<string, PendingRequest>();

export const metricsService = {
  async getMetrics(device: OrgDevice): Promise<SystemMetrics> {
    const agentSocket = await connectedAgentFor(device, "fetch metrics");

    const requestId = randomUUID();

    return new Promise<SystemMetrics>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(ApiError.conflict("No response from agent"));
      }, METRICS_TIMEOUT_MS);

      pendingRequests.set(requestId, { deviceId: device.id, resolve, reject, timeout });
      agentSocket.emit("metrics:request", { requestId });
    });
  },

  /// Called from the /agent namespace's "metrics:response" listener with
  /// the id of the device whose agent sent the reply.
  resolveResponse(fromDeviceId: string, requestId: string, metrics: SystemMetrics): void {
    settlePending(pendingRequests, requestId, fromDeviceId)?.resolve(metrics);
  },
};
