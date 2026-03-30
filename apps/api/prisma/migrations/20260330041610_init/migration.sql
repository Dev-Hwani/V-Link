-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'REQUESTER', 'VENDOR');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "SapJobType" AS ENUM ('PRE_STOCK', 'POST_COMPLETION');

-- CreateEnum
CREATE TYPE "SapJobStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "vendorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VasRequest" (
    "id" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "team" TEXT NOT NULL,
    "description" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "requesterId" TEXT NOT NULL,
    "assignedVendorId" TEXT,
    "approvedById" TEXT,
    "rejectedReason" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VasRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusHistory" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fromStatus" "RequestStatus",
    "toStatus" "RequestStatus" NOT NULL,
    "reason" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SapJobLog" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "jobType" "SapJobType" NOT NULL,
    "status" "SapJobStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "response" JSONB,
    "errorMessage" TEXT,
    "runAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SapJobLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_code_key" ON "Vendor"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_name_key" ON "Vendor"("name");

-- CreateIndex
CREATE INDEX "VasRequest_status_idx" ON "VasRequest"("status");

-- CreateIndex
CREATE INDEX "VasRequest_requesterId_idx" ON "VasRequest"("requesterId");

-- CreateIndex
CREATE INDEX "VasRequest_assignedVendorId_idx" ON "VasRequest"("assignedVendorId");

-- CreateIndex
CREATE INDEX "Attachment_requestId_idx" ON "Attachment"("requestId");

-- CreateIndex
CREATE INDEX "StatusHistory_requestId_idx" ON "StatusHistory"("requestId");

-- CreateIndex
CREATE INDEX "SapJobLog_requestId_idx" ON "SapJobLog"("requestId");

-- CreateIndex
CREATE INDEX "SapJobLog_jobType_status_idx" ON "SapJobLog"("jobType", "status");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VasRequest" ADD CONSTRAINT "VasRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VasRequest" ADD CONSTRAINT "VasRequest_assignedVendorId_fkey" FOREIGN KEY ("assignedVendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VasRequest" ADD CONSTRAINT "VasRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "VasRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusHistory" ADD CONSTRAINT "StatusHistory_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "VasRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusHistory" ADD CONSTRAINT "StatusHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SapJobLog" ADD CONSTRAINT "SapJobLog_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "VasRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
