import { randomUUID } from "crypto";
import { ApiError } from "../../common/ApiError";
import { connectedAgentFor } from "../device/agentConnection";
import { OrgDevice } from "../device/device.types";
import { DeviceBoundRequest, settlePending } from "../../realtime/pendingRequests";

const SCREENSHOT_TIMEOUT_MS = 20_000;

interface PendingCapture extends DeviceBoundRequest {
  resolve: (pngBytes: Buffer) => void;
  reject: (error: Error) => void;
}

// Same plain-event-plus-reply pattern as metrics/processes/files: the
// agent's Socket.IO client library can't respond to a server-initiated
// ack, so a request is tracked here by ID and resolved when the matching
// screenshot:response (or rejected on screenshot:error) arrives (see
// agentNamespace.ts). Longer timeout than metrics/processes since capture
// involves an extra hop through the per-session helper process.
const pendingCaptures = new Map<string, PendingCapture>();

export const screenshotService = {
  async capture(device: OrgDevice): Promise<Buffer> {
    const agentSocket = await connectedAgentFor(device, "capture a screenshot");

    const requestId = randomUUID();

    return new Promise<Buffer>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingCaptures.delete(requestId);
        reject(ApiError.conflict("No response from agent"));
      }, SCREENSHOT_TIMEOUT_MS);

      pendingCaptures.set(requestId, { deviceId: device.id, resolve, reject, timeout });
      agentSocket.emit("screenshot:request", { requestId });
    });
  },

  resolveResponse(fromDeviceId: string, requestId: string, pngBytes: Buffer): void {
    settlePending(pendingCaptures, requestId, fromDeviceId)?.resolve(pngBytes);
  },

  rejectResponse(fromDeviceId: string, requestId: string, message: string): void {
    const pending = settlePending(pendingCaptures, requestId, fromDeviceId);
    if (!pending) return;
    // 502-shaped: the agent reported a genuine capture failure (e.g. no
    // interactive session, GDI error) rather than this backend rejecting
    // the request itself - same "upstream failed" precedent file.controller
    // .ts uses for download failures reported mid-stream.
    pending.reject(new ApiError(502, "SCREENSHOT_FAILED", message));
  },
};
