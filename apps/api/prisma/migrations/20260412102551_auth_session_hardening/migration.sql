-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "lastUsedAt" TIMESTAMP(3),
ADD COLUMN     "reuseDetectedAt" TIMESTAMP(3),
ADD COLUMN     "revokedReason" TEXT,
ADD COLUMN     "sessionId" TEXT,
ADD COLUMN     "userAgent" TEXT;

-- Backfill sessionId for existing rows
UPDATE "RefreshToken"
SET "sessionId" = "id"
WHERE "sessionId" IS NULL;

-- Make sessionId required after backfill
ALTER TABLE "RefreshToken"
ALTER COLUMN "sessionId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "RefreshToken_userId_sessionId_idx" ON "RefreshToken"("userId", "sessionId");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_revokedAt_idx" ON "RefreshToken"("userId", "revokedAt");
