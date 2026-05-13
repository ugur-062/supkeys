-- V2-6 — 8 para birimi + Tender.allowedCurrencies (multi)
-- TRY + USD + EUR + 5 yeni (GBP, CHF, JPY, AED, CNY) — Türk B2B'de en yaygın 8 birim.
-- Tender artık birden fazla "kabul edilen" para birimi listeleyebilir;
-- primaryCurrency listenin baş elemanı (TRY equivalent karşılaştırma bazı).

ALTER TYPE "Currency" ADD VALUE IF NOT EXISTS 'GBP';
ALTER TYPE "Currency" ADD VALUE IF NOT EXISTS 'CHF';
ALTER TYPE "Currency" ADD VALUE IF NOT EXISTS 'JPY';
ALTER TYPE "Currency" ADD VALUE IF NOT EXISTS 'AED';
ALTER TYPE "Currency" ADD VALUE IF NOT EXISTS 'CNY';

-- Tender.allowedCurrencies — Postgres native enum array. Default boş ama
-- backfill ile mevcut tüm tender'lara [primaryCurrency] yazılır.
ALTER TABLE "tenders"
  ADD COLUMN IF NOT EXISTS "allowedCurrencies" "Currency"[] NOT NULL DEFAULT ARRAY[]::"Currency"[];

UPDATE "tenders"
SET "allowedCurrencies" = ARRAY["primaryCurrency"]::"Currency"[]
WHERE cardinality("allowedCurrencies") = 0;
