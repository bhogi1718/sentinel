import { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { env } from "../config/env";
import { EventWithDevice } from "../modules/event/event.types";
import { registerAgentNamespace } from "./namespaces/agentNamespace";
import { registerDashboardNamespace } from "./namespaces/dashboardNamespace";

let io: SocketIOServer | undefined;

export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN,
      credentials: true,
    },
  });

  registerAgentNamespace(io);
  registerDashboardNamespace(io);

  return io;
}

export function broadcastEventToDashboards(event: EventWithDevice): void {
  io?.of("/dashboard").emit("event:new", event);
}

export function broadcastDeviceStatus(deviceId: string, online: boolean): void {
  io?.of("/dashboard").emit("device:status", { deviceId, online });
}
