import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "fs";
import path from "path";

export const BACKEND_ROOT = path.resolve(__dirname, "../../..");
const MIGRATIONS_DIR = path.join(BACKEND_ROOT, "prisma", "migrations");

/// Every migration directory, in the order Prisma applies them.
export const allMigrations: string[] = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

/// Runs one migration's SQL exactly as written in the repository.
export async function applyMigration(db: PGlite, migration: string): Promise<void> {
  await db.exec(readFileSync(path.join(MIGRATIONS_DIR, migration, "migration.sql"), "utf8"));
}

export async function applyMigrations(db: PGlite, migrations: string[] = allMigrations): Promise<void> {
  for (const migration of migrations) {
    await applyMigration(db, migration);
  }
}
