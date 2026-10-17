import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { applyMigrations } from "../src/test/database/migrations";

// A throwaway local database for development: PGlite (Postgres compiled to
// WebAssembly) in memory, with every migration applied and demo data
// seeded, served over the Postgres wire protocol. Nothing persists - stop
// it and the data is gone. Point the backend at it with:
//
//   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54329/postgres?connection_limit=1&sslmode=disable&pgbouncer=true"
//
// Every account below is a local-only test account sharing SANDBOX_PASSWORD.

const PORT = Number(process.env.SANDBOX_DB_PORT ?? 54329);
const SANDBOX_PASSWORD = "sandbox-password";

const USERS = {
  maya: { email: "maya@acme.test", name: "Maya Chen" }, // Owner of Acme
  sam: { email: "sam@acme.test", name: "Sam Ortiz" }, // Viewer in Acme
  alex: { email: "alex@bravo.test", name: "Alex Kim" }, // Owner of Bravo, Admin in Acme
};

const ORGS = {
  acme: { name: "Acme Studio", slug: "acme" },
  bravo: { name: "Bravo Logistics", slug: "bravo" },
};

// No real agent backs these demo devices, so they show offline: the backend
// reports a device online only while its agent is actually connected.
const DEVICES = [
  { org: "acme", name: "Design MacBook" },
  { org: "acme", name: "Finance desktop" },
  { org: "acme", name: "Reception laptop" },
  { org: "bravo", name: "Field laptop" },
] as const;

const EVENT_TYPES = ["BOOT", "UNLOCK", "LOCK", "INTERNET_DISCONNECTED", "INTERNET_CONNECTED", "SLEEP", "WAKE", "BATTERY_LOW"];

function id(): string {
  return crypto.randomUUID();
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

async function seed(db: PGlite): Promise<void> {
  const passwordHash = await bcrypt.hash(SANDBOX_PASSWORD, 10);

  const userIds: Record<string, string> = {};
  for (const [key, user] of Object.entries(USERS)) {
    userIds[key] = id();
    await db.query(
      `INSERT INTO users (id, email, name, "passwordHash", "updatedAt") VALUES ($1, $2, $3, $4, now())`,
      [userIds[key], user.email, user.name, passwordHash],
    );
  }

  const orgIds: Record<string, string> = {};
  for (const [key, org] of Object.entries(ORGS)) {
    orgIds[key] = id();
    await db.query(`INSERT INTO organizations (id, name, slug, "updatedAt") VALUES ($1, $2, $3, now())`, [
      orgIds[key],
      org.name,
      org.slug,
    ]);
  }

  const memberships: [string, string, string][] = [
    ["maya", "acme", "OWNER"],
    ["sam", "acme", "VIEWER"],
    ["alex", "bravo", "OWNER"],
    ["alex", "acme", "ADMIN"],
  ];
  for (const [user, org, role] of memberships) {
    await db.query(`INSERT INTO memberships (id, "userId", "orgId", role) VALUES ($1, $2, $3, $4)`, [
      id(),
      userIds[user],
      orgIds[org],
      role,
    ]);
  }

  for (const [index, device] of DEVICES.entries()) {
    const deviceId = id();
    const orgId = orgIds[device.org];
    // Random token hashes: no real agent can connect as these demo devices.
    await db.query(
      `INSERT INTO devices (id, "orgId", name, "tokenHash", "isOnline", "lastSeenAt") VALUES ($1, $2, $3, $4, $5, $6)`,
      [deviceId, orgId, device.name, crypto.randomBytes(32).toString("hex"), false, hoursAgo(1 + index * 20)],
    );

    for (let i = 0; i < 8; i++) {
      await db.query(`INSERT INTO events (id, "orgId", "deviceId", type, "occurredAt") VALUES ($1, $2, $3, $4, $5)`, [
        id(),
        orgId,
        deviceId,
        EVENT_TYPES[(i + index) % EVENT_TYPES.length],
        hoursAgo(i * 5 + index),
      ]);
    }

    const requester = device.org === "acme" ? userIds.maya : userIds.alex;
    await db.query(
      `INSERT INTO commands (id, "orgId", "deviceId", "requestedById", type, status, "requestedAt", "acknowledgedAt")
       VALUES ($1, $2, $3, $4, 'LOCK', 'ACKNOWLEDGED', $5, $5)`,
      [id(), orgId, deviceId, requester, hoursAgo(6 + index)],
    );
  }
}

async function main(): Promise<void> {
  const db = new PGlite();
  await db.waitReady;
  await applyMigrations(db);
  await seed(db);

  // PGlite runs one query at a time, but the server can hold several client
  // connections and queue their queries - so a stray client (a dev tool, a
  // browser probing the port) can't lock the backend out.
  const server = new PGLiteSocketServer({ db, port: PORT, host: "127.0.0.1", maxConnections: 8 });
  await server.start();

  console.log(`Sandbox database ready on 127.0.0.1:${PORT} (in memory - nothing persists).`);
  console.log(
    `DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres?connection_limit=1&sslmode=disable&pgbouncer=true"`,
  );
  console.log(`Accounts (password "${SANDBOX_PASSWORD}"): ${Object.values(USERS).map((u) => u.email).join(", ")}`);

  const shutdown = () => {
    void server.stop().then(() => db.close()).then(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err: unknown) => {
  console.error("Sandbox database failed to start:", err);
  process.exit(1);
});
