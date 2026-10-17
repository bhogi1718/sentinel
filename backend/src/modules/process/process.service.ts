import { randomUUID } from "crypto";
import { ApiError } from "../../common/ApiError";
import { connectedAgentFor } from "../device/agentConnection";
import { OrgDevice } from "../device/device.types";
import { DeviceBoundRequest, settlePending } from "../../realtime/pendingRequests";
import { ProcessInfo } from "./process.types";

const PROCESS_LIST_TIMEOUT_MS = 15_000;

interface PendingRequest extends DeviceBoundRequest {
  resolve: (processes: ProcessInfo[]) => void;
  reject: (error: Error) => void;
}

// Same plain-event-plus-reply pattern as commands: the agent's Socket.IO
// client library can't respond to a server-initiated ack, so a request is
// tracked here by ID and resolved when the matching process:list:response
// event arrives (see agentNamespace.ts).
const pendingRequests = new Map<string, PendingRequest>();

export const processService = {
  async listProcesses(device: OrgDevice): Promise<ProcessInfo[]> {
    const agentSocket = await connectedAgentFor(device, "list processes");

    const requestId = randomUUID();

    return new Promise<ProcessInfo[]>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(ApiError.conflict("No response from agent"));
      }, PROCESS_LIST_TIMEOUT_MS);

      pendingRequests.set(requestId, { deviceId: device.id, resolve, reject, timeout });
      agentSocket.emit("process:list:request", { requestId });
    });
  },

  /// Called from the /agent namespace's "process:list:response" listener
  /// when a device's agent replies with a requested process snapshot.
  resolveResponse(fromDeviceId: string, requestId: string, processes: ProcessInfo[]): void {
    settlePending(pendingRequests, requestId, fromDeviceId)?.resolve(processes);
  },
};
