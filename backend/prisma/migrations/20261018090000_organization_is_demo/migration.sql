-- Marks the public demo organization (simulated devices, demo sessions only).
-- See docs/architecture/demo-mode.md.

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;
