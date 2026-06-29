-- AlterTable
ALTER TABLE "companies" ADD COLUMN "referralCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "companies_referralCode_key" ON "companies"("referralCode");
