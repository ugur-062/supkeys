-- V2-3 — Çoklu para birimi + TCMB kur cache.
-- Manuel uygulanır. Currency enum zaten mevcut (TRY/USD/EUR).

-- 1) exchange_rates tablosu
CREATE TABLE IF NOT EXISTS "exchange_rates" (
  "id"        TEXT NOT NULL,
  "currency"  "Currency" NOT NULL,
  "rate"      DECIMAL(15, 6) NOT NULL,
  "rateDate"  DATE NOT NULL,
  "source"    TEXT NOT NULL DEFAULT 'TCMB',
  "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "exchange_rates_currency_rateDate_key"
  ON "exchange_rates"("currency", "rateDate");
CREATE INDEX IF NOT EXISTS "exchange_rates_rateDate_idx"
  ON "exchange_rates"("rateDate");

-- 2) Bid.exchangeRateSnapshot Json (nullable)
ALTER TABLE "bids"
  ADD COLUMN IF NOT EXISTS "exchangeRateSnapshot" JSONB;
