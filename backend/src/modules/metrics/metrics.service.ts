import { randomUUID } from "crypto";
import { ApiError } from "../../common/ApiError";
import { deviceRepository } from "../device/device.repository";
import { findAgentSocket } from "../../realtime/socket";
import { SystemMetrics } from "./metrics.types";

const METRICS_TIMEOUT_MS = 15_000;

interface PendingRequest {
  resolve: (metrics: SystemMetrics) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

// Same plain-event-plus-reply pattern as commands/processes/files: the
// agent's Socket.IO client library can't respond to a server-initiated
// ack, so a request is tracked here by ID and resolved when the matching
// metrics:response event arrives (see agentNamespace.ts).
const pendingRequests = new Map<string, PendingRequest>();

export const metricsService = {
  async getMetrics(): Promise<SystemMetrics> {
    const device = await deviceRepository.findFirst();
    if (!device) {
      throw ApiError.notFound("No device has been registered yet");
    }
    if (!device.isOnline) {
      throw ApiError.conflict("Device is offline - cannot fetch metrics");
    }

    const agentSocket = await findAgentSocket(device.id);
    if (!agentSocket) {
      throw ApiError.conflict("Device is not currently connected");
    }

    const requestId = randomUUID();

    return new Promise<SystemMetrics>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(ApiError.conflict("No response from agent"));
      }, METRICS_TIMEOUT_MS);

      pendingRequests.set(requestId, { resolve, reject, timeout });
      agentSocket.emit("metrics:request", { requestId });
    });
  },

  resolveResponse(requestId: string, metrics: SystemMetrics): void {
    const pending = pendingRequests.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timeout);
    pendingRequests.delete(requestId);
    pending.resolve(metrics);
  },
};
