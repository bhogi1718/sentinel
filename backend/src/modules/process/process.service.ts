import { randomUUID } from "crypto";
import { ApiError } from "../../common/ApiError";
import { deviceRepository } from "../device/device.repository";
import { findAgentSocket } from "../../realtime/socket";
import { ProcessInfo } from "./process.types";

const PROCESS_LIST_TIMEOUT_MS = 15_000;

interface PendingRequest {
  resolve: (processes: ProcessInfo[]) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

// Same plain-event-plus-reply pattern as commands: the agent's Socket.IO
// client library can't respond to a server-initiated ack, so a request is
// tracked here by ID and resolved when the matching process:list:response
// event arrives (see agentNamespace.ts).
const pendingRequests = new Map<string, PendingRequest>();

export const processService = {
  async listProcesses(): Promise<ProcessInfo[]> {
    const device = await deviceRepository.findFirst();
    if (!device) {
      throw ApiError.notFound("No device has been registered yet");
    }
    if (!device.isOnline) {
      throw ApiError.conflict("Device is offline - cannot list processes");
    }

    const agentSocket = await findAgentSocket(device.id);
    if (!agentSocket) {
      throw ApiError.conflict("Device is not currently connected");
    }

    const requestId = randomUUID();

    return new Promise<ProcessInfo[]>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(ApiError.conflict("No response from agent"));
      }, PROCESS_LIST_TIMEOUT_MS);

      pendingRequests.set(requestId, { resolve, reject, timeout });
      agentSocket.emit("process:list:request", { requestId });
    });
  },

  /// Called from the /agent namespace's "process:list:response" listener
  /// when the agent replies with a requested process snapshot.
  resolveResponse(requestId: string, processes: ProcessInfo[]): void {
    const pending = pendingRequests.get(requestId);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timeout);
    pendingRequests.delete(requestId);
    pending.resolve(processes);
  },
};
