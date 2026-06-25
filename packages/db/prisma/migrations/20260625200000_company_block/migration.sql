-- Firma engelleme (karşılıklı görünmezlik).
CREATE TABLE "company_blocks" (
    "id" TEXT NOT NULL,
    "blockerCompanyId" TEXT NOT NULL,
    "blockedCompanyId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "company_blocks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "company_blocks_blockerCompanyId_blockedCompanyId_key" ON "company_blocks"("blockerCompanyId", "blockedCompanyId");
CREATE INDEX "company_blocks_blockedCompanyId_idx" ON "company_blocks"("blockedCompanyId");
ALTER TABLE "company_blocks" ADD CONSTRAINT "company_blocks_blockerCompanyId_fkey" FOREIGN KEY ("blockerCompanyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_blocks" ADD CONSTRAINT "company_blocks_blockedCompanyId_fkey" FOREIGN KEY ("blockedCompanyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
