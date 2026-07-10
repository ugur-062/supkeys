-- Dahili admin notları (Faz 6) — müşteri görmez.

-- CreateTable
CREATE TABLE "company_admin_notes" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_admin_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "company_admin_notes_companyId_createdAt_idx" ON "company_admin_notes"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "company_admin_notes" ADD CONSTRAINT "company_admin_notes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
