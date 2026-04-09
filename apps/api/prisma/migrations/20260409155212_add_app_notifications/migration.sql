-- CreateTable
CREATE TABLE "AppNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "payload" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppNotification_userId_isRead_idx" ON "AppNotification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "AppNotification_userId_createdAt_idx" ON "AppNotification"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "AppNotification" ADD CONSTRAINT "AppNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
