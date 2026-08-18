import { ApiError } from "../../common/ApiError";
import { logger } from "../../config/logger";
import { deviceRepository } from "../device/device.repository";
import { broadcastCommandUpdate, findAgentSocket } from "../../realtime/socket";
import { commandRepository } from "./command.repository";
import { CreateCommandInput } from "./command.validation";

const COMMAND_ACK_TIMEOUT_MS = 15_000;

// Tracks commands sent to the agent that haven't been acknowledged yet, so
// resolveAck (called from the /agent namespace's "command:ack" listener)
// can cancel the timeout and finalize the command's status. The rust
// Socket.IO client library has no way to reply to a server-initiated ack
// request, so this is a plain event + separate reply event instead of
// Socket.IO's built-in ack mechanism.
const pendingCommands = new Map<string, NodeJS.Timeout>();

export const commandService = {
  async sendCommand(input: CreateCommandInput) {
    const { type } = input;
    const device = await deviceRepository.findFirst();
    if (!device) {
      throw ApiError.notFound("No device has been registered yet");
    }
    if (!device.isOnline) {
      throw ApiError.conflict("Device is offline - cannot send a remote command");
    }

    const agentSocket = await findAgentSocket(device.id);
    if (!agentSocket) {
      throw ApiError.conflict("Device is not currently connected");
    }

    const target = type === "KILL_PROCESS" ? { targetPid: input.pid, targetName: input.name } : {};
    const command = await commandRepository.create({ deviceId: device.id, type, ...target });

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

    pendingCommands.set(command.id, timeout);
    // The agent's CommandType enum is #[serde(tag = "type")] with
    // KillProcess's pid/name flattened alongside it - mirroring that flat
    // shape here (rather than nesting a "payload" object) means the same
    // JSON deserializes on the Rust side without a translation layer.
    agentSocket.emit("command:execute", { commandId: command.id, ...input });

    const sent = await commandRepository.updateStatus(command.id, "SENT");
    broadcastCommandUpdate(sent);

    return sent;
  },

  /// Called from the /agent namespace's "command:ack" listener when the
  /// agent reports the outcome of a command it was asked to run.
  async resolveAck(commandId: string, success: boolean, error?: string) {
    const timeout = pendingCommands.get(commandId);
    if (!timeout) {
      // Already timed out and finalized, or an ack for an unknown command -
      // nothing to do.
      return;
    }
    clearTimeout(timeout);
    pendingCommands.delete(commandId);

    const status = success ? "ACKNOWLEDGED" : "FAILED";
    const updated = await commandRepository.updateStatus(commandId, status, error);
    broadcastCommandUpdate(updated);
  },
};
