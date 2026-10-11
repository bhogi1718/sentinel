import { Server as SocketIOServer, Socket } from "socket.io";
import { logger } from "../../config/logger";
import { authService } from "../../modules/auth/auth.service";
import { AuthenticatedUser } from "../../modules/auth/auth.types";
import { streamService } from "../../modules/stream/stream.service";

interface DashboardSocket extends Socket {
  user?: AuthenticatedUser;
}

export function registerDashboardNamespace(io: SocketIOServer): void {
  const namespace = io.of("/dashboard");

  namespace.use((socket: DashboardSocket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;

    if (!token) {
      next(new Error("Missing access token"));
      return;
    }

    try {
      socket.user = authService.verifyAccessToken(token);
      next();
    } catch {
      next(new Error("Invalid or expired access token"));
    }
  });

  namespace.on("connection", (socket: DashboardSocket) => {
    logger.info(`Dashboard connected: ${socket.user?.email}`);

    socket.on("stream:start", async (_payload: unknown, ack?: (response: { success: boolean; error?: string }) => void) => {
      try {
        await streamService.startViewing(socket.id);
        ack?.({ success: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to start live view";
        logger.error(`Dashboard ${socket.user?.email} failed to start live view`, { error: message });
        ack?.({ success: false, error: message });
      }
    });

    socket.on("stream:stop", () => {
      void streamService.stopViewing(socket.id);
    });

    // Shared annotations: forward the viewer's shapes to the agent, which
    // paints them on its display-only on-screen overlay. Also mirror to any
    // other dashboard tabs so multiple viewers see the same markup.
    socket.on("annotation:update", (payload: unknown) => {
      void streamService.forwardAnnotation(payload);
      socket.broadcast.emit("annotation:update", payload);
    });

    socket.on("annotation:clear", () => {
      void streamService.clearAnnotation();
      socket.broadcast.emit("annotation:clear");
    });

    socket.on("disconnect", () => {
      logger.info(`Dashboard disconnected: ${socket.user?.email}`);
      // If this tab was the last viewer, stop the agent stream.
      void streamService.stopViewing(socket.id);
    });
  });
}
