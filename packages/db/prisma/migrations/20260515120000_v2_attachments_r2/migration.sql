-- V2-2 — Cloudflare R2 dosya yükleme.
-- Polymorphic Attachment modeli + 2 enum. Manuel uygulanır.

-- 1) AttachmentScope enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AttachmentScope') THEN
    CREATE TYPE "AttachmentScope" AS ENUM ('TENDER_DOC', 'BID_RESPONSE', 'ORDER_INVOICE');
  END IF;
END $$;

-- 2) AttachmentStatus enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AttachmentStatus') THEN
    CREATE TYPE "AttachmentStatus" AS ENUM ('PENDING', 'UPLOADED');
  END IF;
END $$;

-- 3) attachments tablosu
CREATE TABLE IF NOT EXISTS "attachments" (
  "id"                       TEXT NOT NULL,
  "tenantId"                 TEXT NOT NULL,
  "uploadedByUserId"         TEXT,
  "uploadedBySupplierUserId" TEXT,
  "scope"                    "AttachmentScope" NOT NULL,
  "scopeRefId"               TEXT NOT NULL,
  "key"                      TEXT NOT NULL,
  "originalFilename"         TEXT NOT NULL,
  "mimeType"                 TEXT NOT NULL,
  "fileSize"                 INTEGER NOT NULL,
  "status"                   "AttachmentStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finalizedAt"              TIMESTAMP(3),
  CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- 4) Unique key + indeksler
CREATE UNIQUE INDEX IF NOT EXISTS "attachments_key_key" ON "attachments"("key");
CREATE INDEX IF NOT EXISTS "attachments_tenantId_scope_scopeRefId_idx"
  ON "attachments"("tenantId", "scope", "scopeRefId");
CREATE INDEX IF NOT EXISTS "attachments_tenantId_status_idx"
  ON "attachments"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "attachments_uploadedByUserId_idx"
  ON "attachments"("uploadedByUserId");
CREATE INDEX IF NOT EXISTS "attachments_uploadedBySupplierUserId_idx"
  ON "attachments"("uploadedBySupplierUserId");

-- 5) Foreign keys
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attachments_tenantId_fkey'
  ) THEN
    ALTER TABLE "attachments"
      ADD CONSTRAINT "attachments_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attachments_uploadedByUserId_fkey'
  ) THEN
    ALTER TABLE "attachments"
      ADD CONSTRAINT "attachments_uploadedByUserId_fkey"
      FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attachments_uploadedBySupplierUserId_fkey'
  ) THEN
    ALTER TABLE "attachments"
      ADD CONSTRAINT "attachments_uploadedBySupplierUserId_fkey"
      FOREIGN KEY ("uploadedBySupplierUserId") REFERENCES "supplier_users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
  END IF;
END $$;
