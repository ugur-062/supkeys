-- Faz 3 — kalem detayları, kalem-bazlı belge ve MUADİL teklif simetrisi.
--
-- GÜVENLİK NOTU (docs/migration-safety.md): TAMAMEN EKLEMELİ. Nullable ve
-- sabit-varsayılanlı ADD COLUMN'lar → PG11+ tablo yeniden yazımı YOK.
-- Bir yeni FK + iki indeks. Veri kaybı yok; geri alma = DROP COLUMN/INDEX.
--
-- `listing_documents.itemId`: kalem-bazlı belge AYRI bir tabloya değil, bu
-- kolona bağlanır. Böylece yetki kapısı, R2 doğrulaması, indirme imzası,
-- denetim izi ve belge tavanı TEK yerde kalır (yeni bir güvenlik yüzeyi
-- açılmaz). NULL = ilan seviyesi belge — bugünkü tüm satırlar öyle kalır.
--
-- `listing_bid_items.isAlternative/offeredBrand/offeredMpn`: alıcı muadile
-- izin veriyorsa tedarikçi NE teklif ettiğini söyleyebilmeli; yoksa alıcı
-- gelen tekliflerin aynı ürüne mi ait olduğunu göremez.

ALTER TABLE "listing_items"
  ADD COLUMN "brand"              TEXT,
  ADD COLUMN "mpn"                TEXT,
  ADD COLUMN "alternativeAllowed" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "specification"      TEXT,
  ADD COLUMN "warrantyMonths"     INTEGER,
  ADD COLUMN "hsCode"             TEXT;

ALTER TABLE "listing_documents" ADD COLUMN "itemId" TEXT;

CREATE INDEX "listing_documents_itemId_idx" ON "listing_documents"("itemId");

ALTER TABLE "listing_documents"
  ADD CONSTRAINT "listing_documents_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "listing_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "listing_bid_items"
  ADD COLUMN "isAlternative" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "offeredBrand"  TEXT,
  ADD COLUMN "offeredMpn"    TEXT;
