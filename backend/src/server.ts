import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { prisma } from "./prisma/client";
import { initSocketServer } from "./realtime/socket";

async function main(): Promise<void> {
  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled promise rejection", { error: reason instanceof Error ? reason.message : reason });
  });

  await prisma.$connect();
  logger.info("Connected to database");

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`Sentinel backend listening on port ${env.PORT} [${env.NODE_ENV}]`);
  });

  initSocketServer(server);
  logger.info("Socket.IO server initialized (/agent, /dashboard namespaces)");

  const shutdown = (signal: string): void => {
    logger.info(`Received ${signal}, shutting down gracefully`);
    server.close(() => {
      prisma
        .$disconnect()
        .then(() => {
          logger.info("Shutdown complete");
          process.exit(0);
        })
        .catch((err: unknown) => {
          logger.error("Error while disconnecting from the database during shutdown", {
            error: err instanceof Error ? err.message : err,
          });
          process.exit(1);
        });
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err: unknown) => {
  logger.error("Fatal error during startup", { error: err instanceof Error ? err.message : err });
  process.exit(1);
});
