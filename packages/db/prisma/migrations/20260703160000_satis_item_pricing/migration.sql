-- SATIS kalem-bazlı fiyatlandırma: kapsam + kalem taban/hemen-al birim fiyatları.
CREATE TYPE "ListingPriceScope" AS ENUM ('TOPLU', 'KALEM');
ALTER TABLE "listings" ADD COLUMN "priceScope" "ListingPriceScope";
ALTER TABLE "listing_items" ADD COLUMN "minUnitPrice" DECIMAL(18,2);
ALTER TABLE "listing_items" ADD COLUMN "buyNowUnitPrice" DECIMAL(18,2);

-- Legacy SATIS ilanları TOPLU kabul edilir (taban fiyatı olanlar).
UPDATE "listings" SET "priceScope" = 'TOPLU' WHERE "type" = 'SATIS';
