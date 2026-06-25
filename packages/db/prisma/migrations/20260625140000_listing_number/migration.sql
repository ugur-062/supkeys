-- Sistem-genelinde benzersiz ilan numarası (global sequence → A≠B garantili).
CREATE SEQUENCE IF NOT EXISTS "listing_number_seq" START 1;
ALTER TABLE "listings" ADD COLUMN "number" TEXT;
-- Mevcut satırları backfill et (test verisi).
UPDATE "listings"
   SET "number" = 'ROT-' || LPAD(nextval('listing_number_seq')::text, 6, '0')
 WHERE "number" IS NULL;
CREATE UNIQUE INDEX "listings_number_key" ON "listings"("number");
