-- AlterTable
ALTER TABLE "demo_requests" ADD COLUMN     "inviteSentAt" TIMESTAMP(3),
ADD COLUMN     "inviteSentCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "inviteSentMessage" TEXT,
ADD COLUMN     "inviteSentToEmail" TEXT,
ADD COLUMN     "inviteToken" TEXT,
ADD COLUMN     "inviteTokenExpAt" TIMESTAMP(3),
ADD COLUMN     "inviteUsedAt" TIMESTAMP(3),
ADD COLUMN     "linkedApplicationId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "demo_requests_inviteToken_key" ON "demo_requests"("inviteToken");

-- CreateIndex
CREATE UNIQUE INDEX "demo_requests_linkedApplicationId_key" ON "demo_requests"("linkedApplicationId");

-- AddForeignKey
ALTER TABLE "demo_requests" ADD CONSTRAINT "demo_requests_linkedApplicationId_fkey" FOREIGN KEY ("linkedApplicationId") REFERENCES "buyer_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

