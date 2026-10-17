import { EventType } from "@prisma/client";
import { io, Socket } from "socket.io-client";
import { logger } from "../config/logger";
import {
  fileContents,
  initialMetrics,
  listFolder,
  nextMetrics,
  pickBackgroundActivity,
  processList,
  Random,
  renderScreen,
} from "./simulatedData";

// The demo device. It connects to this server's /agent namespace with an
// ordinary device token and speaks the real agent's protocol - the same
// events, request/reply pairs and binary framing as agent/src/socket_client.rs
// - so every backend code path it exercises is the one real devices use.
// Only the data it reports is made up.

export interface SimulatorOptions {
  /// Base URL of the server to connect to, e.g. http://127.0.0.1:5000.
  serverUrl: string;
  deviceToken: string;
  random?: Random;
  /// Bounds for the gap between background events, in milliseconds.
  eventIntervalMs?: [number, number];
  /// Delay before a command is acknowledged, in milliseconds.
  commandDelayMs?: number;
}

export interface RunningSimulator {
  stop(): void;
}

const METRICS_TICK_MS = 2_000;
const FOLLOW_UP_DELAY_MS = 20_000;

/// The 36-byte request/session id prefix the agent puts in front of every
/// binary payload (see agentNamespace.ts).
function framed(id: string, bytes: Buffer): Buffer {
  return Buffer.concat([Buffer.from(id, "utf8"), bytes]);
}

export function startDemoSimulator(options: SimulatorOptions): RunningSimulator {
  const random = options.random ?? Math.random;
  const [minGap, maxGap] = options.eventIntervalMs ?? [45_000, 120_000];
  const commandDelayMs = options.commandDelayMs ?? 600;

  const timers = new Set<NodeJS.Timeout>();
  const later = (ms: number, run: () => void) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      run();
    }, ms);
    timers.add(timer);
  };

  let metrics = initialMetrics();
  const ended = new Set<number>();
  let streamTimer: NodeJS.Timeout | undefined;
  let bootReported = false;

  const socket: Socket = io(`${options.serverUrl}/agent`, {
    auth: { token: options.deviceToken },
    transports: ["websocket"],
    reconnectionDelay: 2_000,
  });

  const report = (type: EventType, metadata?: Record<string, unknown>) => {
    socket.emit("event:report", { type, metadata, occurredAt: new Date().toISOString() }, (ack: { success: boolean }) => {
      if (!ack?.success) logger.warn(`Demo device: event ${type} was not recorded`);
    });
  };

  const scheduleBackgroundActivity = () => {
    later(minGap + random() * (maxGap - minGap), () => {
      const activity = pickBackgroundActivity(random);
      report(activity.type, activity.metadata);
      if (activity.followUp) {
        const followUp = activity.followUp;
        later(FOLLOW_UP_DELAY_MS * (0.5 + random()), () => report(followUp));
      }
      scheduleBackgroundActivity();
    });
  };

  const metricsTimer = setInterval(() => {
    metrics = nextMetrics(metrics, random, METRICS_TICK_MS / 1000);
  }, METRICS_TICK_MS);
  metricsTimer.unref();

  socket.on("connect", () => {
    logger.info("Demo device connected");
    if (!bootReported) {
      bootReported = true;
      report("BOOT");
      scheduleBackgroundActivity();
    }
  });

  socket.on("connect_error", (err: Error) => {
    logger.warn(`Demo device could not connect: ${err.message}`);
  });

  socket.on("metrics:request", ({ requestId }: { requestId: string }) => {
    socket.emit("metrics:response", { requestId, metrics });
  });

  socket.on("process:list:request", ({ requestId }: { requestId: string }) => {
    socket.emit("process:list:response", { requestId, processes: processList(random, ended) });
  });

  socket.on("files:list:request", ({ requestId, path }: { requestId: string; path: string }) => {
    const entries = listFolder(path);
    if (entries) socket.emit("files:list:response", { requestId, entries });
    else socket.emit("files:list:error", { requestId, error: "Folder not found" });
  });

  socket.on("files:download:request", ({ requestId, path }: { requestId: string; path: string }) => {
    const contents = fileContents(path);
    if (!contents) {
      socket.emit("files:download:error", { requestId, error: "File not found" });
      return;
    }
    socket.emit("files:download:chunk", framed(requestId, contents));
    socket.emit("files:download:complete", { requestId });
  });

  socket.on("screenshot:request", ({ requestId }: { requestId: string }) => {
    socket.emit("screenshot:response", framed(requestId, renderScreen()));
  });

  socket.on("stream:start", ({ sessionId, intervalMs }: { sessionId: string; intervalMs?: number }) => {
    clearInterval(streamTimer);
    // Frames are smaller than screenshots, like the real agent's downscaled stream.
    streamTimer = setInterval(() => socket.emit("stream:frame", framed(sessionId, renderScreen(new Date(), 0.75))), intervalMs ?? 500);
  });

  socket.on("stream:stop", () => {
    clearInterval(streamTimer);
    streamTimer = undefined;
  });

  socket.on(
    "command:execute",
    ({ commandId, type, pid }: { commandId: string; type: string; pid?: number }) => {
      later(commandDelayMs, () => {
        socket.emit("command:ack", { commandId, success: true });
        switch (type) {
          case "LOCK":
            report("LOCK");
            later(FOLLOW_UP_DELAY_MS, () => report("UNLOCK"));
            break;
          case "SLEEP":
            report("SLEEP");
            later(FOLLOW_UP_DELAY_MS, () => report("WAKE"));
            break;
          case "RESTART":
            report("RESTART");
            later(FOLLOW_UP_DELAY_MS, () => report("BOOT"));
            break;
          case "SHUTDOWN":
            // The demo device "powers back on" by itself so the demo keeps
            // working for the next visitor.
            report("SHUTDOWN");
            later(FOLLOW_UP_DELAY_MS, () => report("BOOT"));
            break;
          case "KILL_PROCESS":
            if (pid !== undefined) {
              ended.add(pid);
              later(5 * 60_000, () => ended.delete(pid));
            }
            break;
          default:
            break;
        }
      });
    },
  );

  // The overlay of shared annotations is display-only on a real laptop;
  // the demo device has no screen to draw on, so these are accepted silently.
  socket.on("annotation:update", () => undefined);
  socket.on("annotation:clear", () => undefined);

  return {
    stop() {
      clearInterval(metricsTimer);
      clearInterval(streamTimer);
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      socket.disconnect();
    },
  };
}
