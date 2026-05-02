-- AlterTable
ALTER TABLE "supplier_invitations" ADD COLUMN     "isExistingSupplier" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "openedAt" TIMESTAMP(3),
ADD COLUMN     "shortCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "supplier_invitations_shortCode_key" ON "supplier_invitations"("shortCode");
