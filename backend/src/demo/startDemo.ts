import { logger } from "../config/logger";
import { prepareDemo, pruneDemoHistory } from "./demoSetup";
import { startDemoSimulator } from "./simulator";

const PRUNE_EVERY_MS = 60 * 60_000;

/// Brings up the public demo inside this process: the demo organization,
/// its simulated device (connected to this server like any agent), and an
/// hourly clean-up of old demo activity. Call once the server is listening.
export async function startDemo(port: number): Promise<void> {
  const demo = await prepareDemo();
  await pruneDemoHistory(demo.orgId);

  startDemoSimulator({ serverUrl: `http://127.0.0.1:${port}`, deviceToken: demo.deviceToken });

  const pruneTimer = setInterval(() => {
    pruneDemoHistory(demo.orgId).catch((err: unknown) => {
      logger.error("Failed to prune demo history", { error: err instanceof Error ? err.message : err });
    });
  }, PRUNE_EVERY_MS);
  pruneTimer.unref();

  logger.info(`Demo mode on: simulated device ${demo.deviceId} in demo organization ${demo.orgId}`);
}
