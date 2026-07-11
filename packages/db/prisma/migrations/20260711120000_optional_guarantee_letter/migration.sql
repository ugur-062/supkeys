-- Teminat mektubu şartı opsiyonel oldu: ihale sahibi seçer (teslim-öncesi
-- ödemede sistem önerir). İlan → sipariş award anında snapshot'lanır.
ALTER TABLE "listings" ADD COLUMN "requireGuaranteeLetter" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "company_orders" ADD COLUMN "requireGuaranteeLetter" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: eski kuralda BEFORE_DELIVERY = koşulsuz zorunluydu; mevcut
-- kayıtların verdiği söz korunur (alıcı teminat bekleyerek ilan açtı).
UPDATE "listings" SET "requireGuaranteeLetter" = true WHERE "paymentTiming" = 'BEFORE_DELIVERY';
UPDATE "company_orders" SET "requireGuaranteeLetter" = true WHERE "paymentTiming" = 'BEFORE_DELIVERY';
