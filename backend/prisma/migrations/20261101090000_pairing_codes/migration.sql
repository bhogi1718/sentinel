-- Device pairing codes. See docs/architecture/device-pairing.md.

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'DEVICE_ADDED';

-- CreateTable
CREATE TABLE "pairing_codes" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "deviceId" TEXT,

    CONSTRAINT "pairing_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pairing_codes_codeHash_key" ON "pairing_codes"("codeHash");

-- CreateIndex
CREATE INDEX "pairing_codes_orgId_idx" ON "pairing_codes"("orgId");

-- AddForeignKey
ALTER TABLE "pairing_codes" ADD CONSTRAINT "pairing_codes_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pairing_codes" ADD CONSTRAINT "pairing_codes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
