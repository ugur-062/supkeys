-- V2-TRUST — Doğrulanmış İşletme paketinin alanları.
-- Vergi no + vergi dairesi opt-in (kurumsal firmalar için); MERSİS no + opt-in.
-- Şahıs işletmelerinde KVKK gereği backend tarafından reddedilir.

ALTER TABLE "suppliers" ADD COLUMN "mersisNo" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "publicShowTaxInfo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "suppliers" ADD COLUMN "publicShowMersis" BOOLEAN NOT NULL DEFAULT false;
