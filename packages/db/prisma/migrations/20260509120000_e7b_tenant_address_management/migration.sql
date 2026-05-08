-- E.7.B — Tenant Address Management
-- TenantAddress + AddressType enum, Tender'a snapshot Json alanları.
-- Manuel uygulanır (proje pattern'ı).

-- 1) AddressType enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AddressType') THEN
    CREATE TYPE "AddressType" AS ENUM ('FATURA', 'ILETISIM', 'TESLIMAT');
  END IF;
END $$;

-- 2) TenantAddress tablosu
CREATE TABLE IF NOT EXISTS "tenant_addresses" (
  "id"          TEXT PRIMARY KEY,
  "tenantId"    TEXT NOT NULL,
  "type"        "AddressType" NOT NULL,
  "title"       TEXT NOT NULL,
  "country"     TEXT NOT NULL DEFAULT 'Türkiye',
  "state"       TEXT,
  "city"        TEXT NOT NULL,
  "district"    TEXT NOT NULL,
  "fullAddress" TEXT NOT NULL,
  "postalCode"  TEXT,
  "taxOffice"   TEXT,
  "taxNumber"   TEXT,
  "contactName"  TEXT,
  "contactPhone" TEXT,
  "contactEmail" TEXT,
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "isDefault"   BOOLEAN NOT NULL DEFAULT false,
  "notes"       TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tenant_addresses_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "tenant_addresses_tenantId_type_isActive_idx"
  ON "tenant_addresses"("tenantId", "type", "isActive");
CREATE INDEX IF NOT EXISTS "tenant_addresses_tenantId_type_isDefault_idx"
  ON "tenant_addresses"("tenantId", "type", "isDefault");

-- 3) Tender — snapshot Json alanları
ALTER TABLE "tenders"
  ADD COLUMN IF NOT EXISTS "billingAddressSnapshot"  JSONB,
  ADD COLUMN IF NOT EXISTS "deliveryAddressSnapshot" JSONB;
