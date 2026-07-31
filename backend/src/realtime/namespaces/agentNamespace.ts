import { Server as SocketIOServer, Socket } from "socket.io";
import { logger } from "../../config/logger";
import { commandService } from "../../modules/command/command.service";
import { commandAckSchema } from "../../modules/command/command.validation";
import { deviceRepository } from "../../modules/device/device.repository";
import { deviceService } from "../../modules/device/device.service";
import { AuthenticatedDevice } from "../../modules/device/device.types";
import { eventService } from "../../modules/event/event.service";
import { reportEventSchema } from "../../modules/event/event.validation";
import { processService } from "../../modules/process/process.service";
import { processListResponseSchema } from "../../modules/process/process.validation";
import { broadcastDeviceStatus } from "../socket";

interface AgentSocket extends Socket {
  device?: AuthenticatedDevice;
}

export function registerAgentNamespace(io: SocketIOServer): void {
  const namespace = io.of("/agent");

  namespace.use(async (socket: AgentSocket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;

    if (!token) {
      next(new Error("Missing device token"));
      return;
    }

    try {
      const device = await deviceService.authenticate(token);
      if (!device) {
        next(new Error("Invalid device token"));
        return;
      }

      socket.device = device;
      next();
    } catch (err) {
      logger.error("Agent auth middleware failed", { error: err instanceof Error ? err.message : err });
      next(new Error("Authentication temporarily unavailable"));
    }
  });

  namespace.on("connection", (socket: AgentSocket) => {
    const device = socket.device!;
    logger.info(`Agent connected: ${device.name} (${device.id})`);
    socket.data.deviceId = device.id;

    deviceRepository.setOnlineStatus(device.id, true).catch((err) => {
      logger.error(`Failed to mark device ${device.id} online`, { error: err instanceof Error ? err.message : err });
    });
    broadcastDeviceStatus(device.id, true);

    socket.on("event:report", async (payload, ack) => {
      const parsed = reportEventSchema.safeParse(payload);

      if (!parsed.success) {
        ack({ success: false, error: "Invalid event payload" });
        return;
      }

      try {
        await eventService.recordEvent(device.id, device.name, parsed.data);
        await deviceRepository.updateLastSeen(device.id);
        ack({ success: true });
      } catch (err) {
        logger.error(`Failed to record event from device ${device.id}`, {
          error: err instanceof Error ? err.message : err,
        });
        ack({ success: false, error: "Failed to record event" });
      }
    });

    socket.on("command:ack", async (payload) => {
      const parsed = commandAckSchema.safeParse(payload);
      if (!parsed.success) {
        logger.error(`Received malformed command:ack from device ${device.id}`, { payload });
        return;
      }

      try {
        await commandService.resolveAck(parsed.data.commandId, parsed.data.success, parsed.data.error);
      } catch (err) {
        logger.error(`Failed to resolve command:ack from device ${device.id}`, {
          error: err instanceof Error ? err.message : err,
        });
      }
    });

    socket.on("process:list:response", (payload) => {
      const parsed = processListResponseSchema.safeParse(payload);
      if (!parsed.success) {
        logger.error(`Received malformed process:list:response from device ${device.id}`, { payload });
        return;
      }

      processService.resolveResponse(parsed.data.requestId, parsed.data.processes);
    });

    socket.on("disconnect", () => {
      logger.info(`Agent disconnected: ${device.name} (${device.id})`);
      deviceRepository.setOnlineStatus(device.id, false).catch((err) => {
        logger.error(`Failed to mark device ${device.id} offline`, { error: err instanceof Error ? err.message : err });
      });
      broadcastDeviceStatus(device.id, false);
    });
  });
}
