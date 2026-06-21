-- G6 madde 20 — tedarikçi yönetici rolü + kayıtlı banka hesapları.

ALTER TABLE "supplier_users" ADD COLUMN "isManager" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "supplier_banks" (
  "id" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "accountHolder" TEXT NOT NULL,
  "iban" TEXT NOT NULL,
  "bankName" TEXT,
  "label" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "supplier_banks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "supplier_banks_supplierId_idx" ON "supplier_banks"("supplierId");
ALTER TABLE "supplier_banks" ADD CONSTRAINT "supplier_banks_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill — her tedarikçide en erken kaydolan kullanıcı yönetici olur.
UPDATE "supplier_users" su SET "isManager" = true
WHERE su."id" = (
  SELECT s2."id" FROM "supplier_users" s2
  WHERE s2."supplierId" = su."supplierId"
  ORDER BY s2."createdAt" ASC, s2."id" ASC
  LIMIT 1
);
