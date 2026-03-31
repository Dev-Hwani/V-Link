-- AlterTable
ALTER TABLE "SapJobLog" ADD COLUMN     "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastTriedAt" TIMESTAMP(3),
ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "maxAttempts" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "nextRetryAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "assignedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Assignment_requestId_idx" ON "Assignment"("requestId");

-- CreateIndex
CREATE INDEX "Assignment_vendorId_idx" ON "Assignment"("vendorId");

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "VasRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
