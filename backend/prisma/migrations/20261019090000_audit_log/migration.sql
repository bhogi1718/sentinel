-- The audit log: who did what to which device, kept 90 days.
-- See docs/architecture/audit-log.md.

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('SCREENSHOT_CAPTURED', 'LIVE_VIEW_STARTED', 'LIVE_VIEW_ENDED', 'FILES_LISTED', 'FILE_DOWNLOADED', 'COMMAND_SENT');

-- CreateEnum
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCESS', 'FAILURE');

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "outcome" "AuditOutcome" NOT NULL,
    "deviceId" TEXT,
    "deviceName" TEXT,
    "detail" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_events_orgId_occurredAt_idx" ON "audit_events"("orgId", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_events_occurredAt_idx" ON "audit_events"("occurredAt");

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Append-only: entries can be deleted (retention, or with their
-- organization) but never changed. The one update allowed is the one the
-- database makes itself when an actor's user account is deleted
-- (ON DELETE SET NULL on "actorId"); the copied "actorEmail" keeps the
-- entry readable.
CREATE FUNCTION "audit_events_reject_update"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."actorId" IS NULL AND (to_jsonb(NEW) - 'actorId') = (to_jsonb(OLD) - 'actorId') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$;

CREATE TRIGGER "audit_events_append_only"
  BEFORE UPDATE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION "audit_events_reject_update"();
