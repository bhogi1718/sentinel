-- AlterEnum
ALTER TYPE "CommandType" ADD VALUE 'KILL_PROCESS';

-- AlterTable
ALTER TABLE "commands" ADD COLUMN     "targetName" TEXT,
ADD COLUMN     "targetPid" INTEGER;
