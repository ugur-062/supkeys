-- 2026-09-27 uluslararası tur. EKLEMELİ (yalnız NULL'lanabilir kolon + index);
-- mevcut satırlar NULL kalır ve kod NULL'u eski davranışla okur.

-- Davet / bilgi talebi dili: alıcı kayıtlı değil, dili kayıtta tutulur
-- (yeniden gönderim ve satıcı yanıtı aynı dilde gitsin).
ALTER TABLE "company_user_invitations" ADD COLUMN "locale" TEXT;
ALTER TABLE "company_referral_invites" ADD COLUMN "locale" TEXT;
ALTER TABLE "public_inquiries" ADD COLUMN "locale" TEXT;

-- Ürün fiyatının TRY karşılığı: ürün dizininin fiyat süzgeci/sıralaması
-- farklı para birimlerini ortak tabanda karşılaştırsın. Doldurma
-- `backfill-price-base` betiği + günlük kur işi (tablo küçük; index
-- CONCURRENTLY gerekmez).
ALTER TABLE "company_items" ADD COLUMN "priceAmountBase" DECIMAL(20,2);
CREATE INDEX "company_items_priceAmountBase_idx" ON "company_items"("priceAmountBase");
