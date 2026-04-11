-- AlterTable
ALTER TABLE "VasRequest" ADD COLUMN     "targetAdminId" TEXT;

-- CreateIndex
CREATE INDEX "VasRequest_targetAdminId_idx" ON "VasRequest"("targetAdminId");

-- AddForeignKey
ALTER TABLE "VasRequest" ADD CONSTRAINT "VasRequest_targetAdminId_fkey" FOREIGN KEY ("targetAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
