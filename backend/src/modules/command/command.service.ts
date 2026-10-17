import { logger } from "../../config/logger";
import { connectedAgentFor } from "../device/agentConnection";
import { OrgDevice } from "../device/device.types";
import { DeviceBoundRequest, settlePending } from "../../realtime/pendingRequests";
import { broadcastCommandUpdate } from "../../realtime/socket";
import { commandRepository } from "./command.repository";
import { CreateCommandInput, ListCommandsQuery } from "./command.validation";

const COMMAND_ACK_TIMEOUT_MS = 15_000;

// Tracks commands sent to the agent that haven't been acknowledged yet, so
// resolveAck (called from the /agent namespace's "command:ack" listener)
// can cancel the timeout and finalize the command's status. The rust
// Socket.IO client library has no way to reply to a server-initiated ack
// request, so this is a plain event + separate reply event instead of
// Socket.IO's built-in ack mechanism. Keyed by command id; only the agent
// of the device the command was sent to can acknowledge it.
const pendingCommands = new Map<string, DeviceBoundRequest>();

export const commandService = {
  async sendCommand(device: OrgDevice, input: CreateCommandInput, requestedById: string) {
    const { type } = input;
    const agentSocket = await connectedAgentFor(device, "send a remote command");

    const target = type === "KILL_PROCESS" ? { targetPid: input.pid, targetName: input.name } : {};
    const command = await commandRepository.create({
      orgId: device.orgId,
      deviceId: device.id,
      requestedById,
      type,
      ...target,
    });

    // Recorded as SENT - and announced - before the agent is told, never
    // after: a fast agent (a lock completes in milliseconds) can ack before
    // a later SENT write lands, and that write would then overwrite its
    // ACKNOWLEDGED/FAILED outcome, leaving the command stuck as SENT.
    const sent = await commandRepository.updateStatus(command.id, "SENT");
    broadcastCommandUpdate(sent);

    const timeout = setTimeout(() => {
      pendingCommands.delete(command.id);
      logger.error(`Command ${command.id} timed out waiting for agent ack`, { deviceId: device.id, type });
      commandRepository
        .updateStatus(command.id, "FAILED", "No response from agent")
        .then((updated) => broadcastCommandUpdate(updated))
        .catch((err: unknown) => {
          logger.error(`Failed to mark command ${command.id} as FAILED after timeout`, {
            error: err instanceof Error ? err.message : err,
          });
        });
    }, COMMAND_ACK_TIMEOUT_MS);

    pendingCommands.set(command.id, { deviceId: device.id, timeout });
    // The agent's CommandType enum is #[serde(tag = "type")] with
    // KillProcess's pid/name flattened alongside it - mirroring that flat
    // shape here (rather than nesting a "payload" object) means the same
    // JSON deserializes on the Rust side without a translation layer.
    agentSocket.emit("command:execute", { commandId: command.id, ...input });

    return sent;
  },

  async listForDevice(device: OrgDevice, query: ListCommandsQuery) {
    const { items, total } = await commandRepository.listForDevice({
      orgId: device.orgId,
      deviceId: device.id,
      page: query.page,
      pageSize: query.pageSize,
    });
    return {
      items,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  },

  /// Called from the /agent namespace's "command:ack" listener when a
  /// device's agent reports the outcome of a command it was asked to run.
  async resolveAck(fromDeviceId: string, commandId: string, success: boolean, error?: string) {
    // Nothing pending means it already timed out and was finalized, or the
    // ack is for an unknown command - or for another device's command.
    if (!settlePending(pendingCommands, commandId, fromDeviceId)) return;

    const status = success ? "ACKNOWLEDGED" : "FAILED";
    const updated = await commandRepository.updateStatus(commandId, status, error);
    broadcastCommandUpdate(updated);
  },
};
