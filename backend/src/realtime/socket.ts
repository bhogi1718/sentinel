import { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { env } from "../config/env";
import { EventWithDevice } from "../modules/event/event.types";
import { AgentSocketData, registerAgentNamespace } from "./namespaces/agentNamespace";
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

export function broadcastCommandUpdate(command: unknown): void {
  io?.of("/dashboard").emit("command:update", command);
}

/// Finds the agent namespace's currently connected socket for a device (at
/// most one is ever expected) so the command service can emit directly to
/// it with an ack, mirroring how the agent itself emits event:report.
export async function findAgentSocket(deviceId: string) {
  const agentNamespace = io?.of("/agent");
  if (!agentNamespace) return undefined;

  const sockets = await agentNamespace.fetchSockets();
  return sockets.find((socket) => (socket.data as AgentSocketData).deviceId === deviceId);
}
