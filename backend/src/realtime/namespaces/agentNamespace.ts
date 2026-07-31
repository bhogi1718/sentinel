import { Server as SocketIOServer, Socket } from "socket.io";
import { logger } from "../../config/logger";
import { deviceRepository } from "../../modules/device/device.repository";
import { deviceService } from "../../modules/device/device.service";
import { AuthenticatedDevice } from "../../modules/device/device.types";
import { eventService } from "../../modules/event/event.service";
import { reportEventSchema } from "../../modules/event/event.validation";
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

    socket.on("disconnect", () => {
      logger.info(`Agent disconnected: ${device.name} (${device.id})`);
      deviceRepository.setOnlineStatus(device.id, false).catch((err) => {
        logger.error(`Failed to mark device ${device.id} offline`, { error: err instanceof Error ? err.message : err });
      });
      broadcastDeviceStatus(device.id, false);
    });
  });
}
