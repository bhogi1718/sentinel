import { Server as SocketIOServer, Socket } from "socket.io";
import { logger } from "../../config/logger";
import { authService } from "../../modules/auth/auth.service";
import { AuthenticatedUser } from "../../modules/auth/auth.types";

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

    socket.on("disconnect", () => {
      logger.info(`Dashboard disconnected: ${socket.user?.email}`);
    });
  });
}
