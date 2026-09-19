import cors from "cors";
import express, { Application } from "express";
import helmet from "helmet";
import { corsOrigins } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { generalRateLimiter } from "./middleware/rateLimiter";
import { authRouter } from "./modules/auth/auth.routes";
import { deviceRouter } from "./modules/device/device.routes";
import { eventRouter } from "./modules/event/event.routes";
import { settingsRouter } from "./modules/settings/settings.routes";
import { sendSuccess } from "./common/ApiResponse";

export function createApp(): Application {
  const app = express();

  // Exactly one reverse proxy (Render's) sits in front of this app in
  // production, so trust the single hop's X-Forwarded-* headers - needed
  // for express-rate-limit to see real client IPs instead of the proxy's.
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(generalRateLimiter);

  app.get("/health", (_req, res) => {
    sendSuccess(res, { status: "ok", timestamp: new Date().toISOString() });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/device", deviceRouter);
  app.use("/api/events", eventRouter);
  app.use("/api/settings", settingsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
