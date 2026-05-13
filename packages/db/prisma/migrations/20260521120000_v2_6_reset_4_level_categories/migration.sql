-- V2-6 RESET — 4 seviye UNSPSC (Segment / Family / Class / Commodity).
-- Eski 2-seviye veri temizlenir, nameEn kolonu kaldırılır, code üzerine extra index eklenir.
-- Tender.categoryId FK ON DELETE SetNull olduğu için legacy ihalelerin categoryId'si null'a düşer.

-- 1) Eski seed verisini sil. Tender FK SetNull olduğundan tender.categoryId NULL olur;
--    supplier_categories CASCADE ile temizlenir.
DELETE FROM "supplier_categories";
DELETE FROM "categories";

-- 2) nameEn kolonunu drop et (artık sadece Türkçe).
ALTER TABLE "categories" DROP COLUMN IF EXISTS "nameEn";

-- 3) Code üzerine ek bir lookup index (zaten UNIQUE var, ama @@index([code]) için).
CREATE INDEX IF NOT EXISTS "categories_code_idx" ON "categories"("code");
