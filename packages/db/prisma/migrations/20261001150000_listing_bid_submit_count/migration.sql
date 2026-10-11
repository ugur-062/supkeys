-- Teklif gonderim sayaci (arayuz testi O-036). EKLEMELI.
-- `version` eszamanlilik sayaci: taslak kaydi dahil HER yazimda artar; arayuz
-- onu "Revizyon N" gibi gosteriyordu (iki taslak + gonderim = "Revizyon 3").
-- `submitCount` yalniz SUBMITTED'a yazimda artar; revizyon bundan gosterilir.
--
-- NOT NULL DEFAULT 0 -> PG 11+ sabit default'ta tablo yeniden yazilmaz.
-- Backfill: gecmis gonderim sayisi bilinmiyor (ayri log yok); bir kez
-- gonderilmis (submittedAt dolu ya da DRAFT disi) satirlara 1 yazilir —
-- eski yeniden gonderimler "Revizyon" etiketini kaybeder, uydurmuyoruz.
-- Idempotent: yalniz 0 olan satirlara dokunur.

-- AlterTable
ALTER TABLE "listing_bids" ADD COLUMN "submitCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "listing_bids"
SET "submitCount" = 1
WHERE "submitCount" = 0
  AND ("submittedAt" IS NOT NULL OR "status" <> 'DRAFT');
