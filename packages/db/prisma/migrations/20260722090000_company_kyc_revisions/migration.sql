-- KYC A-modeli (Faz Y) — VERIFIED firmanın belge güncellemesi ayrı admin
-- onayında bekler; firma VERIFIED kalır, ret'te eski belge geçerli.

-- CreateTable
CREATE TABLE "company_kyc_revisions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status" "KycDocStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "submittedById" TEXT,
    "reviewedByAdminId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_kyc_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "company_kyc_revisions_companyId_status_idx" ON "company_kyc_revisions"("companyId", "status");
CREATE INDEX "company_kyc_revisions_status_createdAt_idx" ON "company_kyc_revisions"("status", "createdAt");

-- Kısmi unique (X-CF-3 deseni): kind başına TEK bekleyen revizyon — eşzamanlı
-- iki commit yarışı ikinci PENDING satırı yapısal olarak üretemez.
CREATE UNIQUE INDEX "company_kyc_revisions_pending_unique"
  ON "company_kyc_revisions"("companyId", "kind") WHERE "status" = 'PENDING';

-- AddForeignKey
ALTER TABLE "company_kyc_revisions" ADD CONSTRAINT "company_kyc_revisions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
