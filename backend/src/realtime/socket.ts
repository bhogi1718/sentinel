import { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { corsOrigins } from "../config/env";
import { EventWithDevice } from "../modules/event/event.types";
import { AgentSocketData, registerAgentNamespace } from "./namespaces/agentNamespace";
import { registerDashboardNamespace } from "./namespaces/dashboardNamespace";

let io: SocketIOServer | undefined;

/// Dashboard sockets that have actually started/joined the live view join
/// this room; live frames are emitted only to it, so a dashboard tab that
/// never requested the stream (but is sitting on the Device page) doesn't
/// receive - and render - frames it didn't ask for. Membership is managed in
/// dashboardNamespace on stream:start / stream:stop / disconnect.
export const LIVE_VIEWERS_ROOM = "live-viewers";

// A single on-demand screenshot is a full-resolution PNG of the entire
// virtual screen (every monitor), which routinely exceeds Socket.IO's default
// 1 MB per-message cap - when it does, the server rejects the agent's
// screenshot:response as an oversized frame ("EngineIO Error" on the agent
// side) AND drops the connection, so the capture never arrives and the agent
// briefly reconnects. Raise the cap to comfortably fit even a multi-monitor
// 4K PNG. Safe here: this is a single-owner, authenticated tool, screenshots
// are rate-limited, and file downloads are chunked (64 KB) so nothing else
// relies on large single messages.
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

export function broadcastEventToDashboards(event: EventWithDevice): void {
  io?.of("/dashboard").emit("event:new", event);
}

export function broadcastDeviceStatus(deviceId: string, online: boolean): void {
  io?.of("/dashboard").emit("device:status", { deviceId, online });
}

export function broadcastCommandUpdate(command: unknown): void {
  io?.of("/dashboard").emit("command:update", command);
}

/// Sends one live-view JPEG frame to every connected dashboard. Raw bytes
/// (no base64) - socket.io carries binary natively and the browser renders
/// it straight into an <img> via a Blob URL.
export function broadcastStreamFrame(jpeg: Buffer): void {
  io?.of("/dashboard").to(LIVE_VIEWERS_ROOM).emit("stream:frame", jpeg);
}

/// Tells dashboards whether a live view is currently active (so a viewer
/// opening a second tab, or one that just connected, reflects reality).
export function broadcastStreamState(active: boolean, sessionId: string | null): void {
  io?.of("/dashboard").emit("stream:state", { active, sessionId });
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
