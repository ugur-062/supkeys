-- Üyelik geçmişi (append-only): GRANT/EXTEND/REVOKE/EXPIRE olayları.
-- Faz 3 — admin panel üyelik yönetimi + gelir/yenileme raporu kaynağı.

-- CreateEnum
CREATE TYPE "MembershipEventAction" AS ENUM ('GRANT', 'EXTEND', 'REVOKE', 'EXPIRE');

-- CreateTable
CREATE TABLE "company_membership_events" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "action" "MembershipEventAction" NOT NULL,
    "months" INTEGER,
    "endBefore" TIMESTAMP(3),
    "endAfter" TIMESTAMP(3),
    "reason" TEXT,
    "adminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_membership_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "company_membership_events_companyId_createdAt_idx" ON "company_membership_events"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "company_membership_events_createdAt_idx" ON "company_membership_events"("createdAt");

-- AddForeignKey
ALTER TABLE "company_membership_events" ADD CONSTRAINT "company_membership_events_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
