-- Removing a device is recorded in the audit log.
-- See docs/architecture/audit-log.md.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'DEVICE_REMOVED';
