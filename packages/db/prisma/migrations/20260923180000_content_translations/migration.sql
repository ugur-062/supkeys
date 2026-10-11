-- İçerik çevirisi (i18n Faz 1e) — tümüyle ADDITIVE: yeni enum'lar + yeni tablo.
-- Mevcut kolon/tabloya dokunmaz; geri alma = tabloyu ve tipleri düşürmek.
CREATE TYPE "TranslatableEntity" AS ENUM ('PRODUCT', 'LISTING', 'COMPANY');
CREATE TYPE "ContentTranslationStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');

CREATE TABLE "content_translations" (
    "id" TEXT NOT NULL,
    "entityType" "TranslatableEntity" NOT NULL,
    "entityId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "sourceLocale" TEXT,
    "sourceHash" TEXT NOT NULL,
    "fields" JSONB,
    "status" "ContentTranslationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "model" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(12,6),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_translations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "content_translations_entityType_entityId_locale_key" ON "content_translations"("entityType", "entityId", "locale");
CREATE INDEX "content_translations_status_updatedAt_idx" ON "content_translations"("status", "updatedAt");

-- RLS kısıtlı uygulama rolü (20260719130000) yeni tabloyu da okuyup yazabilsin.
-- Varsayılan ayrıcalıklar zaten tanımlı; rol yoksa (yerel test DB) atlanır.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rothern_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "content_translations" TO rothern_app;
  END IF;
END $$;
