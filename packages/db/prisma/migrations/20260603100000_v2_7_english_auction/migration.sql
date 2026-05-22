-- V2-7 — İngiliz Usulü açık eksiltme.
-- Tedarikçi görünürlük modu (5 seçenek), fiyat azaltma kuralı, kapanış
-- hatırlatma, son dakika otomatik uzatma ve ondalık basamak ayarları.

-- ============================================================================
-- 1) Yeni enum'lar
-- ============================================================================
CREATE TYPE "BidVisibility" AS ENUM (
  'OWN_ONLY',
  'BEST_PRICE',
  'OWN_RANK',
  'BEST_AND_OWN_RANK',
  'ALL'
);

CREATE TYPE "DecrementType" AS ENUM ('AMOUNT', 'PERCENT');

CREATE TYPE "DecrementBasis" AS ENUM ('OWN_LAST_BID', 'BEST_BID');

-- ============================================================================
-- 2) tenders tablosuna yeni kolonlar
-- ============================================================================
ALTER TABLE "tenders"
  ADD COLUMN "bidVisibility"          "BidVisibility" NOT NULL DEFAULT 'OWN_ONLY',
  ADD COLUMN "priceDecrementType"     "DecrementType",
  ADD COLUMN "priceDecrementValue"    DECIMAL(15,4),
  ADD COLUMN "priceDecrementBasis"    "DecrementBasis",
  ADD COLUMN "decimalPlaces"          INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "sendClosingReminder"    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "reminderMinutesBefore"  INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "autoExtendOnLateBid"    BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "autoExtendThresholdMin" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "autoExtendByMinutes"    INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "closingReminderSentAt"  TIMESTAMP(3);

-- ============================================================================
-- 3) Backfill — RFQ kayıtlarında auto-extend default olarak da TRUE,
-- ancak supplier service akışı sadece ENGLISH_AUCTION'da çalıştırır,
-- yani RFQ tarafı etkilenmez. Manuel müdahale gerekmez.
-- ============================================================================

-- ============================================================================
-- 4) Index — kapanış hatırlatma cron'unun verimli taraması için.
-- ============================================================================
CREATE INDEX "tenders_sendClosingReminder_bidsCloseAt_idx"
  ON "tenders" ("sendClosingReminder", "bidsCloseAt")
  WHERE "sendClosingReminder" = TRUE AND "closingReminderSentAt" IS NULL;
