import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { createServer } from "net";
import { applyMigrations } from "./migrations";

/// A throwaway Postgres for one test file: PGlite (Postgres compiled to
/// WebAssembly, running in-process) with every migration applied, served
/// over the normal Postgres wire protocol so the real Prisma client - not a
/// mock - talks to it. Needs no Docker or external database, locally or in CI.
export interface TestDatabase {
  /// A DATABASE_URL for Prisma.
  url: string;
  /// Deletes every row, keeping the schema, so each test starts empty.
  reset(): Promise<void>;
  stop(): Promise<void>;
}

const TABLES_TO_RESET = [
  "invitations",
  "audit_events",
  "commands",
  "events",
  "devices",
  "organization_settings",
  "memberships",
  "organizations",
  "refresh_tokens",
  "users",
];

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

export async function startTestDatabase(): Promise<TestDatabase> {
  const db = new PGlite();
  await db.waitReady;
  await applyMigrations(db);

  const port = await freePort();
  const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1", maxConnections: 1 });
  await server.start();

  return {
    // PGlite serves a single session, so Prisma's pool is held to one
    // connection to match.
    url: `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?connection_limit=1&sslmode=disable`,
    async reset() {
      await db.exec(`TRUNCATE ${TABLES_TO_RESET.map((table) => `"${table}"`).join(", ")} CASCADE;`);
    },
    async stop() {
      await server.stop();
      await db.close();
    },
  };
}
