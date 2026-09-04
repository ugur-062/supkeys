-- Satış ilanı (ListingType.SATIS, forward açık artırma) sistemden TAMAMEN
-- kaldırıldı — 2026-09-04, kullanıcı kararı ("böyle bir özellik olmayacak,
-- şu ankileri de silebilirsin"; sistem demoda, canlı iş verisi yok).
--
-- 1) VERİ: mevcut SATIS ilanları silinir. Bağlı tablolar (teklifler, davetler,
--    kalemler, belgeler, tur anlık görüntüleri) FK ile CASCADE gider. Sipariş
--    bağı SetNull olduğundan o ilanlardan doğan siparişler ÖNCE silinir
--    (ölçüldü: 1 test siparişi, "adfasf").
DELETE FROM "company_orders"
WHERE "listingId" IN (SELECT "id" FROM "listings" WHERE "type" = 'SATIS');
DELETE FROM "listings" WHERE "type" = 'SATIS';
UPDATE "approval_flows" SET "listingType" = NULL WHERE "listingType" = 'SATIS';

-- 2) ENUM: Postgres enum değeri düşürülemez → tip yeniden kurulur.
ALTER TYPE "ListingType" RENAME TO "ListingType_old";
CREATE TYPE "ListingType" AS ENUM ('ALIM');
ALTER TABLE "listings"
  ALTER COLUMN "type" TYPE "ListingType" USING ("type"::text::"ListingType");
ALTER TABLE "approval_flows"
  ALTER COLUMN "listingType" TYPE "ListingType" USING ("listingType"::text::"ListingType");
DROP TYPE "ListingType_old";

-- 3) KOLONLAR: yalnız satış ilanında anlamlı taban/hemen-al alanları.
ALTER TABLE "listings" DROP COLUMN "priceScope";
ALTER TABLE "listings" DROP COLUMN "minPrice";
ALTER TABLE "listings" DROP COLUMN "buyNowPrice";
ALTER TABLE "listing_items" DROP COLUMN "minUnitPrice";
ALTER TABLE "listing_items" DROP COLUMN "buyNowUnitPrice";
ALTER TABLE "listing_bids" DROP COLUMN "isBuyNow";
DROP TYPE "ListingPriceScope";
