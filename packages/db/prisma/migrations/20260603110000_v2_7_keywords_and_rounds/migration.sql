-- V2-7 — İhale anahtar kelimeleri + Yeni Tur (round) zinciri.

-- ============================================================================
-- 1) tenders.keywords — boş string[] default
-- ============================================================================
ALTER TABLE "tenders"
  ADD COLUMN "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- ============================================================================
-- 2) tenders.previousTenderId + roundNumber — round zinciri
-- ============================================================================
ALTER TABLE "tenders"
  ADD COLUMN "previousTenderId" TEXT,
  ADD COLUMN "roundNumber" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "tenders"
  ADD CONSTRAINT "tenders_previousTenderId_fkey"
  FOREIGN KEY ("previousTenderId") REFERENCES "tenders"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "tenders_previousTenderId_idx" ON "tenders"("previousTenderId");
