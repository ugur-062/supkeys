-- Banka hesabı defteri: sipariş kabulünde IBAN elle yazılmaz, buradan seçilir.
CREATE TABLE "company_bank_accounts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "accountHolder" TEXT NOT NULL,
    "iban" TEXT NOT NULL,
    "bankName" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "company_bank_accounts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "company_bank_accounts_companyId_idx" ON "company_bank_accounts"("companyId");

ALTER TABLE "company_bank_accounts" ADD CONSTRAINT "company_bank_accounts_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: Firma ayarındaki mevcut IBAN dolu firmalara ilk (varsayılan) kayıt.
INSERT INTO "company_bank_accounts" ("id", "companyId", "title", "accountHolder", "iban", "isDefault", "createdAt", "updatedAt")
SELECT
  'cba_' || md5(random()::text || c."id"),
  c."id",
  'Varsayılan Hesap',
  COALESCE(NULLIF(c."ibanHolder", ''), c."name"),
  c."iban",
  true,
  now(),
  now()
FROM "companies" c
WHERE c."iban" IS NOT NULL AND c."iban" <> '';
