-- V2-6 — UNSPSC kategori sistemi (2 seviye: Segment + Family).
-- Manuel uygulanır.

-- 1) categories tablosu
CREATE TABLE IF NOT EXISTS "categories" (
  "id"            TEXT NOT NULL,
  "code"          TEXT NOT NULL,
  "nameTr"        TEXT NOT NULL,
  "nameEn"        TEXT NOT NULL,
  "level"         INTEGER NOT NULL,
  "parentId"      TEXT,
  "segmentLetter" TEXT,
  "sortOrder"     INTEGER NOT NULL DEFAULT 0,
  "isActive"      BOOLEAN NOT NULL DEFAULT true,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "categories_code_key" ON "categories"("code");
CREATE INDEX IF NOT EXISTS "categories_parentId_sortOrder_idx" ON "categories"("parentId", "sortOrder");
CREATE INDEX IF NOT EXISTS "categories_level_sortOrder_idx" ON "categories"("level", "sortOrder");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'categories_parentId_fkey'
  ) THEN
    ALTER TABLE "categories"
      ADD CONSTRAINT "categories_parentId_fkey"
      FOREIGN KEY ("parentId") REFERENCES "categories"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 2) supplier_categories junction tablosu
CREATE TABLE IF NOT EXISTS "supplier_categories" (
  "id"          TEXT NOT NULL,
  "supplierId"  TEXT NOT NULL,
  "categoryId"  TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "supplier_categories_supplierId_categoryId_key"
  ON "supplier_categories"("supplierId", "categoryId");
CREATE INDEX IF NOT EXISTS "supplier_categories_categoryId_idx"
  ON "supplier_categories"("categoryId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'supplier_categories_supplierId_fkey'
  ) THEN
    ALTER TABLE "supplier_categories"
      ADD CONSTRAINT "supplier_categories_supplierId_fkey"
      FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'supplier_categories_categoryId_fkey'
  ) THEN
    ALTER TABLE "supplier_categories"
      ADD CONSTRAINT "supplier_categories_categoryId_fkey"
      FOREIGN KEY ("categoryId") REFERENCES "categories"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 3) Tender.categoryId nullable kolon + FK + index
ALTER TABLE "tenders" ADD COLUMN IF NOT EXISTS "categoryId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenders_categoryId_fkey'
  ) THEN
    ALTER TABLE "tenders"
      ADD CONSTRAINT "tenders_categoryId_fkey"
      FOREIGN KEY ("categoryId") REFERENCES "categories"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "tenders_categoryId_idx" ON "tenders"("categoryId");

-- V2-6: SupplierApplication.categoryIds — register'da seçilen kategori
-- ID'leri (string[]). Admin onayında SupplierCategory junction'a kopyalanır.
ALTER TABLE supplier_applications ADD COLUMN IF NOT EXISTS "categoryIds" jsonb;
