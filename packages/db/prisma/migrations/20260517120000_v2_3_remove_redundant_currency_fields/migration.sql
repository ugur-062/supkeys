-- V2-3 düzeltme — tek currency modeli (cross-currency bid V2.5'e ertelendi).
-- Tender.allowedCurrencies + Tender.decimalPlaces kullanılmıyordu;
-- primaryCurrency tek belirleyici.

ALTER TABLE "tenders" DROP COLUMN IF EXISTS "allowedCurrencies";
ALTER TABLE "tenders" DROP COLUMN IF EXISTS "decimalPlaces";
