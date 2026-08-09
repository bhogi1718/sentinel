import { DefaultEventsMap, Server as SocketIOServer, Socket } from "socket.io";
import { logger } from "../../config/logger";
import { commandService } from "../../modules/command/command.service";
import { commandAckSchema } from "../../modules/command/command.validation";
import { deviceRepository } from "../../modules/device/device.repository";
import { deviceService } from "../../modules/device/device.service";
import { AuthenticatedDevice } from "../../modules/device/device.types";
import { eventService } from "../../modules/event/event.service";
import { reportEventSchema } from "../../modules/event/event.validation";
import { fileService } from "../../modules/file/file.service";
import { fileListErrorSchema, fileListResponseSchema } from "../../modules/file/file.validation";
import { metricsService } from "../../modules/metrics/metrics.service";
import { metricsResponseSchema } from "../../modules/metrics/metrics.validation";
import { processService } from "../../modules/process/process.service";
import { processListResponseSchema } from "../../modules/process/process.validation";
import { broadcastDeviceStatus } from "../socket";

export interface AgentSocketData {
  deviceId?: string;
}

type AgentSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, AgentSocketData> & {
  device?: AuthenticatedDevice;
};

// Tracks which socket most recently claimed each device as online, so a
// disconnect handler from a stale (already-superseded) socket can't
// clobber isOnline back to false after a newer reconnect already marked it
// true. Reconnects can arrive fast enough (a few ms apart, e.g. the
// force-reconnect-on-failed-emit path) that the two setOnlineStatus calls
// are not guaranteed to land in the order their sockets actually occurred.
const latestSocketByDevice = new Map<string, string>();

export function registerAgentNamespace(io: SocketIOServer): void {
  const namespace = io.of("/agent");

  namespace.use((socket: AgentSocket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;

    if (!token) {
      next(new Error("Missing device token"));
      return;
    }

    // socket.io's middleware type expects a void-returning function, so the
    // actual (necessarily async) authentication work runs in this inner
    // IIFE rather than making the outer callback itself async.
    void (async () => {
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
    })();
  });

  namespace.on("connection", (socket: AgentSocket) => {
    const device = socket.device!;
    logger.info(`Agent connected: ${device.name} (${device.id})`);
    socket.data.deviceId = device.id;
    latestSocketByDevice.set(device.id, socket.id);

    deviceRepository.setOnlineStatus(device.id, true).catch((err: unknown) => {
      logger.error(`Failed to mark device ${device.id} online`, { error: err instanceof Error ? err.message : err });
    });
    broadcastDeviceStatus(device.id, true);

    socket.on("event:report", (payload: unknown, ack: (response: { success: boolean; error?: string }) => void) => {
      const parsed = reportEventSchema.safeParse(payload);

      if (!parsed.success) {
        ack({ success: false, error: "Invalid event payload" });
        return;
      }

      void (async () => {
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
      })();
    });

    socket.on("command:ack", (payload: unknown) => {
      const parsed = commandAckSchema.safeParse(payload);
      if (!parsed.success) {
        logger.error(`Received malformed command:ack from device ${device.id}`, { payload });
        return;
      }

      void (async () => {
        try {
          await commandService.resolveAck(parsed.data.commandId, parsed.data.success, parsed.data.error);
        } catch (err) {
          logger.error(`Failed to resolve command:ack from device ${device.id}`, {
            error: err instanceof Error ? err.message : err,
          });
        }
      })();
    });

    socket.on("metrics:response", (payload: unknown) => {
      const parsed = metricsResponseSchema.safeParse(payload);
      if (!parsed.success) {
        logger.error(`Received malformed metrics:response from device ${device.id}`, { payload });
        return;
      }

      metricsService.resolveResponse(parsed.data.requestId, parsed.data.metrics);
    });

    socket.on("process:list:response", (payload: unknown) => {
      const parsed = processListResponseSchema.safeParse(payload);
      if (!parsed.success) {
        logger.error(`Received malformed process:list:response from device ${device.id}`, { payload });
        return;
      }

      processService.resolveResponse(parsed.data.requestId, parsed.data.processes);
    });

    socket.on("files:list:response", (payload: unknown) => {
      const parsed = fileListResponseSchema.safeParse(payload);
      if (!parsed.success) {
        logger.error(`Received malformed files:list:response from device ${device.id}`, { payload });
        return;
      }

      fileService.resolveListResponse(parsed.data.requestId, parsed.data.entries);
    });

    socket.on("files:list:error", (payload: unknown) => {
      const parsed = fileListErrorSchema.safeParse(payload);
      if (!parsed.success) {
        logger.error(`Received malformed files:list:error from device ${device.id}`, { payload });
        return;
      }

      fileService.rejectListResponse(parsed.data.requestId, parsed.data.error);
    });

    // The agent's Socket.IO client library can only send a single Payload
    // per emit - no variant mixes text and binary - so the requestId is
    // prefixed onto the binary chunk itself as a fixed 36-byte UUID string
    // rather than sent as a separate argument (see socket_client.rs).
    const REQUEST_ID_PREFIX_LENGTH = 36;

    socket.on("files:download:chunk", (framed: unknown) => {
      if (!Buffer.isBuffer(framed) || framed.length < REQUEST_ID_PREFIX_LENGTH) {
        logger.error(`Received malformed files:download:chunk from device ${device.id}`);
        return;
      }

      const requestId = framed.toString("utf8", 0, REQUEST_ID_PREFIX_LENGTH);
      const chunk = framed.subarray(REQUEST_ID_PREFIX_LENGTH);
      fileService.handleDownloadChunk(requestId, chunk);
    });

    socket.on("files:download:complete", (payload: unknown) => {
      const requestId = (payload as { requestId?: unknown } | undefined)?.requestId;
      if (typeof requestId !== "string") {
        logger.error(`Received malformed files:download:complete from device ${device.id}`);
        return;
      }

      fileService.handleDownloadComplete(requestId);
    });

    socket.on("files:download:error", (payload: unknown) => {
      const data = payload as { requestId?: unknown; error?: unknown } | undefined;
      if (typeof data?.requestId !== "string" || typeof data.error !== "string") {
        logger.error(`Received malformed files:download:error from device ${device.id}`);
        return;
      }

      fileService.handleDownloadError(data.requestId, data.error);
    });

    socket.on("disconnect", () => {
      logger.info(`Agent disconnected: ${device.name} (${device.id})`);

      // A fast reconnect (e.g. the agent's force-reconnect-on-failed-emit
      // path) can already have a newer socket registered as "latest" by
      // the time this fires - if so, this disconnect is stale and must not
      // clobber isOnline back to false for a device that is, in fact,
      // still connected via that newer socket.
      if (latestSocketByDevice.get(device.id) !== socket.id) {
        logger.info(`Ignoring stale disconnect for device ${device.id} (superseded by a newer connection)`);
        return;
      }
      latestSocketByDevice.delete(device.id);

      deviceRepository.setOnlineStatus(device.id, false).catch((err: unknown) => {
        logger.error(`Failed to mark device ${device.id} offline`, { error: err instanceof Error ? err.message : err });
      });
      broadcastDeviceStatus(device.id, false);
    });
  });
}
