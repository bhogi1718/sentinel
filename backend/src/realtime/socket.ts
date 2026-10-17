import { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { corsOrigins } from "../config/env";
import { EventWithDevice } from "../modules/event/event.types";
import { registerAgentNamespace } from "./namespaces/agentNamespace";
import { registerDashboardNamespace } from "./namespaces/dashboardNamespace";
import { presence } from "./presence";
import { deviceRoom, orgRoom, streamRoom } from "./rooms";

let io: SocketIOServer | undefined;

// A single on-demand screenshot is a full-resolution PNG of the entire
// virtual screen (every monitor), which routinely exceeds Socket.IO's default
// 1 MB per-message cap - when it does, the server rejects the agent's
// screenshot:response as an oversized frame ("EngineIO Error" on the agent
// side) AND drops the connection, so the capture never arrives and the agent
// briefly reconnects. Raise the cap to comfortably fit even a multi-monitor
// 4K PNG. Screenshots are rate-limited and file downloads are chunked
// (64 KB), so nothing else relies on large single messages.
const MAX_MESSAGE_BYTES = 50 * 1024 * 1024; // 50 MB

export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    maxHttpBufferSize: MAX_MESSAGE_BYTES,
    cors: {
      origin: corsOrigins,
      credentials: true,
    },
  });

  registerAgentNamespace(io);
  registerDashboardNamespace(io);

  return io;
}

// Every dashboard broadcast below targets one organization's room (or one
// device's live-view room). There is deliberately no helper that emits to
// the whole /dashboard namespace: with several organizations connected,
// that would hand one tenant's data to every other tenant.

export function broadcastEventToDashboards(event: EventWithDevice): void {
  io?.of("/dashboard").to(orgRoom(event.orgId)).emit("event:new", event);
}

export function broadcastDeviceStatus(orgId: string, deviceId: string, online: boolean): void {
  io?.of("/dashboard").to(orgRoom(orgId)).emit("device:status", { deviceId, online });
}

export function broadcastCommandUpdate<T extends { orgId: string }>(command: T): void {
  io?.of("/dashboard").to(orgRoom(command.orgId)).emit("command:update", command);
}

/// Sends one live-view JPEG frame to the sockets watching that device's
/// live view - and only them, so a dashboard that never asked for this
/// device's stream never receives its frames. Raw bytes (no base64) -
/// socket.io carries binary natively and the browser renders it straight
/// into an <img> via a Blob URL. Viewers join the room in
/// dashboardNamespace on stream:start, once authorized.
export function broadcastStreamFrame(deviceId: string, jpeg: Buffer): void {
  io?.of("/dashboard").to(streamRoom(deviceId)).emit("stream:frame", jpeg);
}

/// Tells an organization's dashboards whether one of its devices' live view
/// is currently active (so a viewer opening a second tab, or one that just
/// connected, reflects reality).
export function broadcastStreamState(orgId: string, deviceId: string, active: boolean, sessionId: string | null): void {
  io?.of("/dashboard").to(orgRoom(orgId)).emit("stream:state", { deviceId, active, sessionId });
}

/// The device's connected agent socket, found through its device room
/// rather than by scanning every connected agent. During a fast reconnect
/// the old and new sockets can briefly both be in the room; the one that
/// connected most recently is the live one.
export async function findAgentSocket(deviceId: string) {
  const agentNamespace = io?.of("/agent");
  if (!agentNamespace) return undefined;

  const sockets = await agentNamespace.in(deviceRoom(deviceId)).fetchSockets();
  const currentId = presence.currentSocketId(deviceId);
  return sockets.find((socket) => socket.id === currentId) ?? sockets[0];
}
