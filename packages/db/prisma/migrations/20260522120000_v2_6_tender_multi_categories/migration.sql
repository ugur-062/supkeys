-- V2-6 — Tender artık birden fazla kategori seçebilir.
-- 1) tender_categories junction tablosu (Class veya Commodity ID'leri, server-level validate).
-- 2) Mevcut tenders.categoryId (single) verisini junction'a kopyala.
-- 3) tenders.categoryId kolonu + indeksi DROP.

CREATE TABLE IF NOT EXISTS "tender_categories" (
  "id"          TEXT NOT NULL,
  "tenderId"    TEXT NOT NULL,
  "categoryId"  TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tender_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tender_categories_tenderId_categoryId_key"
  ON "tender_categories"("tenderId", "categoryId");
CREATE INDEX IF NOT EXISTS "tender_categories_categoryId_idx"
  ON "tender_categories"("categoryId");
CREATE INDEX IF NOT EXISTS "tender_categories_tenderId_idx"
  ON "tender_categories"("tenderId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tender_categories_tenderId_fkey'
  ) THEN
    ALTER TABLE "tender_categories"
      ADD CONSTRAINT "tender_categories_tenderId_fkey"
      FOREIGN KEY ("tenderId") REFERENCES "tenders"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tender_categories_categoryId_fkey'
  ) THEN
    ALTER TABLE "tender_categories"
      ADD CONSTRAINT "tender_categories_categoryId_fkey"
      FOREIGN KEY ("categoryId") REFERENCES "categories"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Migrate existing single-category data
INSERT INTO "tender_categories" ("id", "tenderId", "categoryId", "createdAt")
SELECT
  gen_random_uuid()::text,
  "id",
  "categoryId",
  CURRENT_TIMESTAMP
FROM "tenders"
WHERE "categoryId" IS NOT NULL
ON CONFLICT ("tenderId", "categoryId") DO NOTHING;

-- Drop old single-category column + index
DROP INDEX IF EXISTS "tenders_categoryId_idx";
ALTER TABLE "tenders" DROP COLUMN IF EXISTS "categoryId";
