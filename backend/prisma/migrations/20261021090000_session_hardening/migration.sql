-- Session hardening: refresh-token families and rotation tracking.
-- See docs/architecture/accounts.md.

-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN     "familyId" TEXT,
ADD COLUMN     "rotatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "refresh_tokens_familyId_idx" ON "refresh_tokens"("familyId");


-- Existing tokens each start their own family.
UPDATE "refresh_tokens" SET "familyId" = "id" WHERE "familyId" IS NULL;
