-- Siparis kalemine muadil / marka snapshot'i (arayuz testi O-003). EKLEMELI.
-- Award aninda kalemin istenen marka/MPN'i ve kazanan teklif kaleminin muadil
-- beyani (isAlternative/offeredBrand/offeredMpn) dondurulur; siparis detayi ve
-- yazdirma ciktisi bunlari gosterir.
--
-- Dort nullable TEXT + NOT NULL DEFAULT false -> PG 11+ sabit default'ta tablo
-- yeniden yazilmaz (metadata-only). Backfill YOK: kalem<->kazanan teklif iliskisi
-- saklanmadigi icin eski siparislere uydurma deger yazilmaz; bos kalir.

-- AlterTable
ALTER TABLE "company_order_items"
  ADD COLUMN "requestedBrand" TEXT,
  ADD COLUMN "requestedMpn" TEXT,
  ADD COLUMN "isAlternative" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "offeredBrand" TEXT,
  ADD COLUMN "offeredMpn" TEXT;
