-- Açılış embargosu: bidsOpenAt gelecekteyse ilan sahibi dışında görünmez,
-- yayın bildirimleri açılış anına ertelenir. openNotifiedAt duyuru damgası.
ALTER TABLE "listings" ADD COLUMN "openNotifiedAt" TIMESTAMP(3);

-- Backfill: yayınlanmış mevcut ilanların duyurusu zaten gitti — cron
-- yeniden bildirim atmasın.
UPDATE "listings"
SET "openNotifiedAt" = COALESCE("publishedAt", "createdAt")
WHERE "status" <> 'DRAFT';
