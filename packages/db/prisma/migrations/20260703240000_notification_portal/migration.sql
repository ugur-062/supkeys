-- Notification portal ayrımı: satinalma / satis / null (ortak)
ALTER TABLE "notifications" ADD COLUMN "portal" TEXT;

-- Yeni kompozit index (portal-scoped okunmamış sorgusu)
CREATE INDEX "notifications_companyUserId_portal_readAt_idx"
  ON "notifications" ("companyUserId", "portal", "readAt");

-- Eski (portal'sız) index'i kaldır — yeni kompozit kapsar.
DROP INDEX IF EXISTS "notifications_companyUserId_readAt_idx";

-- Mevcut kayıtları tipe göre geriye doldur (temiz ayrım).
-- SATIŞ tarafı: bir satıcının/teklifçinin gördükleri.
UPDATE "notifications" SET "portal" = 'satis'
 WHERE "portal" IS NULL AND "type" IN (
   'listing_category_match', 'listing_invitation', 'listing_reminder',
   'listing_closed', 'bid_eliminated', 'bid_awarded', 'bid_lost'
 );

-- SATINALMA tarafı: ilan sahibinin gördükleri.
UPDATE "notifications" SET "portal" = 'satinalma'
 WHERE "portal" IS NULL AND "type" IN (
   'listing_closed_owner', 'bid_received', 'award_finalized'
 );

-- Kalanlar (connection_*, order_status_changed, approval_pending) NULL/ortak kalır.
