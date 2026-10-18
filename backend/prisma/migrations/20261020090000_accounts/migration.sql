-- Accounts: invitation links, member audit actions, refresh-token families.
-- See docs/architecture/accounts.md.

-- AlterEnum (PostgreSQL 12+ allows several ADD VALUEs in one migration;
-- none of the new values is used until a later transaction.)
ALTER TYPE "AuditAction" ADD VALUE 'MEMBER_INVITED';
ALTER TYPE "AuditAction" ADD VALUE 'INVITE_REVOKED';
ALTER TYPE "AuditAction" ADD VALUE 'MEMBER_JOINED';
ALTER TYPE "AuditAction" ADD VALUE 'MEMBER_ROLE_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'MEMBER_REMOVED';
ALTER TYPE "AuditAction" ADD VALUE 'MEMBER_LEFT';

-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedById" TEXT,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invitations_tokenHash_key" ON "invitations"("tokenHash");

-- CreateIndex
CREATE INDEX "invitations_orgId_idx" ON "invitations"("orgId");

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

