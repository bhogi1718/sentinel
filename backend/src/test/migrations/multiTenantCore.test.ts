import { PGlite } from "@electric-sql/pglite";
import { execFileSync } from "child_process";
import { afterEach, describe, expect, it } from "vitest";
import {
  allMigrations,
  applyMigration as apply,
  applyMigrations as applyAll,
  BACKEND_ROOT,
} from "../database/migrations";

// Runs the real migration SQL against a real (in-process) Postgres engine,
// so no external database is needed locally or in CI.

const TARGET = "20261017120000_multi_tenant_core";
const before = allMigrations.slice(0, allMigrations.indexOf(TARGET));

async function rows<T>(db: PGlite, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}

const openDatabases: PGlite[] = [];

async function freshDatabase(): Promise<PGlite> {
  const db = new PGlite();
  openDatabases.push(db);
  await db.waitReady;
  return db;
}

afterEach(async () => {
  await Promise.all(openDatabases.splice(0).map((db) => db.close()));
});

/// The pre-migration shape of the data a real deployment has: one admin
/// (plus a second user, to prove every user becomes an owner), one laptop
/// with history, and a configured Telegram integration.
async function seedSingleTenantData(db: PGlite): Promise<void> {
  await db.exec(`
    INSERT INTO "users" ("id", "email", "passwordHash", "updatedAt") VALUES
      ('user-1', 'owner@example.com', 'hash', CURRENT_TIMESTAMP),
      ('user-2', 'second@example.com', 'hash', CURRENT_TIMESTAMP);

    INSERT INTO "devices" ("id", "name", "tokenHash", "isOnline") VALUES
      ('device-1', 'My Laptop', 'token-hash', true);

    INSERT INTO "events" ("id", "deviceId", "type") VALUES
      ('event-1', 'device-1', 'BOOT'),
      ('event-2', 'device-1', 'LOCK');

    INSERT INTO "commands" ("id", "deviceId", "type", "status") VALUES
      ('command-1', 'device-1', 'LOCK', 'ACKNOWLEDGED');

    INSERT INTO "settings" ("id", "telegramBotToken", "telegramChatId", "updatedAt") VALUES
      ('settings-1', 'bot-token', 'chat-id', CURRENT_TIMESTAMP);
  `);
}

// Each test boots its own Postgres engine, which is slow when the whole
// suite runs in parallel - hence a budget well above the 5s default.
describe(`migration ${TARGET}`, { timeout: 60_000 }, () => {
  it("moves existing data into a Personal organization owned by every existing user", async () => {
    const db = await freshDatabase();
    await applyAll(db, before);
    await seedSingleTenantData(db);

    await apply(db, TARGET);

    const orgs = await rows<{ id: string; name: string; slug: string }>(
      db,
      `SELECT "id", "name", "slug" FROM "organizations"`,
    );
    expect(orgs).toHaveLength(1);
    expect(orgs[0]).toMatchObject({ name: "Personal", slug: "personal" });
    const orgId = orgs[0].id;

    const memberships = await rows<{ userId: string; orgId: string; role: string }>(
      db,
      `SELECT "userId", "orgId", "role" FROM "memberships" ORDER BY "userId"`,
    );
    expect(memberships).toEqual([
      { userId: "user-1", orgId, role: "OWNER" },
      { userId: "user-2", orgId, role: "OWNER" },
    ]);

    const devices = await rows<{ orgId: string; tokenHash: string; isOnline: boolean }>(
      db,
      `SELECT "orgId", "tokenHash", "isOnline" FROM "devices"`,
    );
    // The token hash is untouched, so the installed agent keeps authenticating.
    expect(devices).toEqual([{ orgId, tokenHash: "token-hash", isOnline: true }]);

    const events = await rows<{ id: string; orgId: string }>(db, `SELECT "id", "orgId" FROM "events" ORDER BY "id"`);
    expect(events).toEqual([
      { id: "event-1", orgId },
      { id: "event-2", orgId },
    ]);

    const commands = await rows<{ orgId: string; requestedById: string | null; status: string }>(
      db,
      `SELECT "orgId", "requestedById", "status" FROM "commands"`,
    );
    expect(commands).toEqual([{ orgId, requestedById: null, status: "ACKNOWLEDGED" }]);

    const settings = await rows<{ orgId: string; telegramBotToken: string; telegramChatId: string }>(
      db,
      `SELECT "orgId", "telegramBotToken", "telegramChatId" FROM "organization_settings"`,
    );
    expect(settings).toEqual([{ orgId, telegramBotToken: "bot-token", telegramChatId: "chat-id" }]);

    const oldSettingsTable = await rows(db, `SELECT 1 FROM information_schema.tables WHERE table_name = 'settings'`);
    expect(oldSettingsTable).toHaveLength(0);
  });

  it("creates no organization on an empty database", async () => {
    const db = await freshDatabase();
    await applyAll(db, allMigrations);

    expect(await rows(db, `SELECT 1 FROM "organizations"`)).toHaveLength(0);
    expect(await rows(db, `SELECT 1 FROM "memberships"`)).toHaveLength(0);
    expect(await rows(db, `SELECT 1 FROM "organization_settings"`)).toHaveLength(0);
  });

  it("rejects an event or command filed under a different organization than its device", async () => {
    const db = await freshDatabase();
    await applyAll(db, before);
    await seedSingleTenantData(db);
    await apply(db, TARGET);

    await db.exec(`
      INSERT INTO "organizations" ("id", "name", "slug", "updatedAt")
      VALUES ('other-org', 'Other', 'other', CURRENT_TIMESTAMP);
    `);

    await expect(
      db.exec(`INSERT INTO "events" ("id", "orgId", "deviceId", "type") VALUES ('bad', 'other-org', 'device-1', 'BOOT')`),
    ).rejects.toThrow(/events_deviceId_orgId_fkey/);

    await expect(
      db.exec(`INSERT INTO "commands" ("id", "orgId", "deviceId", "type") VALUES ('bad', 'other-org', 'device-1', 'LOCK')`),
    ).rejects.toThrow(/commands_deviceId_orgId_fkey/);
  });

  it("produces exactly the schema described by schema.prisma", async () => {
    const migrated = await freshDatabase();
    await applyAll(migrated, allMigrations);

    // What Prisma would create from schema.prisma alone. If this ever
    // differs from the migrations, a migration is missing or hand edits
    // went further than the data move.
    const prismaCli = require.resolve("prisma/build/index.js", { paths: [BACKEND_ROOT] });
    const expectedSql = execFileSync(
      process.execPath,
      [prismaCli, "migrate", "diff", "--from-empty", "--to-schema-datamodel", "prisma/schema.prisma", "--script"],
      { cwd: BACKEND_ROOT, encoding: "utf8" },
    );
    const expected = await freshDatabase();
    await expected.exec(expectedSql);

    expect(await describeSchema(migrated)).toEqual(await describeSchema(expected));
  });
});

/// An order-independent description of the public schema: columns (by
/// name, not position, since ALTER TABLE ADD COLUMN appends), constraints,
/// indexes and enum values.
async function describeSchema(db: PGlite) {
  const columns = await rows(
    db,
    `SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public'
     ORDER BY table_name, column_name`,
  );
  const constraints = await rows(
    db,
    `SELECT c.conrelid::regclass::text AS table_name, c.conname, pg_get_constraintdef(c.oid) AS definition
     FROM pg_constraint c
     JOIN pg_namespace n ON n.oid = c.connamespace
     WHERE n.nspname = 'public'
     ORDER BY table_name, c.conname`,
  );
  const indexes = await rows(
    db,
    `SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname`,
  );
  const enums = await rows(
    db,
    `SELECT t.typname, e.enumlabel, e.enumsortorder
     FROM pg_type t
     JOIN pg_enum e ON e.enumtypid = t.oid
     ORDER BY t.typname, e.enumsortorder`,
  );
  return { columns, constraints, indexes, enums };
}
