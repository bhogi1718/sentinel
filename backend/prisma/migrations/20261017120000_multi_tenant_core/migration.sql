-- Multi-tenant core: organizations, memberships and per-organization
-- settings, with every device, event and command owned by an organization.
--
-- Hand-edited from `prisma migrate diff` output so existing data moves in
-- the same transaction as the schema change: everything that exists today
-- lands in one "Personal" organization, every existing user becomes its
-- OWNER, and the Telegram config moves from the old singleton `settings`
-- table. On an empty database the data steps move zero rows.
--
-- See docs/architecture/multi-tenant-core.md, section 6.

BEGIN;

-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('VIEWER', 'ADMIN', 'OWNER');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_settings" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "telegramBotToken" TEXT,
    "telegramChatId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "memberships_orgId_idx" ON "memberships"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_userId_orgId_key" ON "memberships"("userId", "orgId");

-- CreateIndex
CREATE UNIQUE INDEX "organization_settings_orgId_key" ON "organization_settings"("orgId");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data: one "Personal" organization for everything that exists today.
-- Created only when there is something to put in it.
INSERT INTO "organizations" ("id", "name", "slug", "updatedAt")
SELECT gen_random_uuid()::text, 'Personal', 'personal', CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "users")
   OR EXISTS (SELECT 1 FROM "devices")
   OR EXISTS (SELECT 1 FROM "settings");

-- Data: every existing user owns it.
INSERT INTO "memberships" ("id", "userId", "orgId", "role")
SELECT gen_random_uuid()::text, u."id", o."id", 'OWNER'
FROM "users" u
CROSS JOIN "organizations" o
WHERE o."slug" = 'personal';

-- AlterTable
ALTER TABLE "users" ADD COLUMN "name" TEXT;

-- DropForeignKey (replaced below by composite keys that include orgId)
ALTER TABLE "events" DROP CONSTRAINT "events_deviceId_fkey";

-- DropForeignKey
ALTER TABLE "commands" DROP CONSTRAINT "commands_deviceId_fkey";

-- AlterTable: add orgId as nullable, backfill, then enforce NOT NULL.
ALTER TABLE "devices" ADD COLUMN "orgId" TEXT;
UPDATE "devices" SET "orgId" = (SELECT "id" FROM "organizations" WHERE "slug" = 'personal');
ALTER TABLE "devices" ALTER COLUMN "orgId" SET NOT NULL;

-- AlterTable
ALTER TABLE "events" ADD COLUMN "orgId" TEXT;
UPDATE "events" e SET "orgId" = d."orgId" FROM "devices" d WHERE d."id" = e."deviceId";
ALTER TABLE "events" ALTER COLUMN "orgId" SET NOT NULL;

-- AlterTable. Existing commands keep requestedById = NULL: who sent them
-- was never recorded.
ALTER TABLE "commands" ADD COLUMN "orgId" TEXT,
ADD COLUMN "requestedById" TEXT;
UPDATE "commands" c SET "orgId" = d."orgId" FROM "devices" d WHERE d."id" = c."deviceId";
ALTER TABLE "commands" ALTER COLUMN "orgId" SET NOT NULL;

-- Data: move the Telegram config from the singleton settings row (the most
-- recently updated one, should more than one ever have been written).
INSERT INTO "organization_settings" ("id", "orgId", "telegramBotToken", "telegramChatId", "updatedAt")
SELECT gen_random_uuid()::text, o."id", s."telegramBotToken", s."telegramChatId", s."updatedAt"
FROM (SELECT * FROM "settings" ORDER BY "updatedAt" DESC LIMIT 1) s
CROSS JOIN "organizations" o
WHERE o."slug" = 'personal';

-- DropTable
DROP TABLE "settings";

-- CreateIndex
CREATE INDEX "devices_orgId_idx" ON "devices"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "devices_id_orgId_key" ON "devices"("id", "orgId");

-- CreateIndex
CREATE INDEX "events_orgId_occurredAt_idx" ON "events"("orgId", "occurredAt");

-- CreateIndex
CREATE INDEX "commands_orgId_requestedAt_idx" ON "commands"("orgId", "requestedAt");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_deviceId_orgId_fkey" FOREIGN KEY ("deviceId", "orgId") REFERENCES "devices"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commands" ADD CONSTRAINT "commands_deviceId_orgId_fkey" FOREIGN KEY ("deviceId", "orgId") REFERENCES "devices"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commands" ADD CONSTRAINT "commands_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
