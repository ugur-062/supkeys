-- Firma→firma şikayet (moderasyon §14)
CREATE TYPE "ComplaintStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');
CREATE TABLE "company_complaints" (
    "id" TEXT NOT NULL,
    "complainantCompanyId" TEXT NOT NULL,
    "againstCompanyId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "detail" TEXT,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'OPEN',
    "adminNote" TEXT,
    "createdById" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "company_complaints_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "company_complaints_againstCompanyId_idx" ON "company_complaints"("againstCompanyId");
CREATE INDEX "company_complaints_status_idx" ON "company_complaints"("status");
ALTER TABLE "company_complaints" ADD CONSTRAINT "company_complaints_complainantCompanyId_fkey" FOREIGN KEY ("complainantCompanyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_complaints" ADD CONSTRAINT "company_complaints_againstCompanyId_fkey" FOREIGN KEY ("againstCompanyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
