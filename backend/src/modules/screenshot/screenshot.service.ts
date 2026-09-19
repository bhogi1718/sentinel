import { randomUUID } from "crypto";
import { ApiError } from "../../common/ApiError";
import { deviceRepository } from "../device/device.repository";
import { findAgentSocket } from "../../realtime/socket";

const SCREENSHOT_TIMEOUT_MS = 20_000;

interface PendingCapture {
  resolve: (pngBytes: Buffer) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

// Same plain-event-plus-reply pattern as metrics/processes/files: the
// agent's Socket.IO client library can't respond to a server-initiated
// ack, so a request is tracked here by ID and resolved when the matching
// screenshot:response (or rejected on screenshot:error) arrives (see
// agentNamespace.ts). Longer timeout than metrics/processes since capture
// involves an extra hop through the per-session helper process.
const pendingCaptures = new Map<string, PendingCapture>();

export const screenshotService = {
  async capture(): Promise<Buffer> {
    const device = await deviceRepository.findFirst();
    if (!device) {
      throw ApiError.notFound("No device has been registered yet");
    }
    if (!device.isOnline) {
      throw ApiError.conflict("Device is offline - cannot capture a screenshot");
    }

    const agentSocket = await findAgentSocket(device.id);
    if (!agentSocket) {
      throw ApiError.conflict("Device is not currently connected");
    }

    const requestId = randomUUID();

    return new Promise<Buffer>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingCaptures.delete(requestId);
        reject(ApiError.conflict("No response from agent"));
      }, SCREENSHOT_TIMEOUT_MS);

      pendingCaptures.set(requestId, { resolve, reject, timeout });
      agentSocket.emit("screenshot:request", { requestId });
    });
  },

  resolveResponse(requestId: string, pngBytes: Buffer): void {
    const pending = pendingCaptures.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timeout);
    pendingCaptures.delete(requestId);
    pending.resolve(pngBytes);
  },

  rejectResponse(requestId: string, message: string): void {
    const pending = pendingCaptures.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timeout);
    pendingCaptures.delete(requestId);
    // 502-shaped: the agent reported a genuine capture failure (e.g. no
    // interactive session, GDI error) rather than this backend rejecting
    // the request itself - same "upstream failed" precedent file.controller
    // .ts uses for download failures reported mid-stream.
    pending.reject(new ApiError(502, "SCREENSHOT_FAILED", message));
  },
};
