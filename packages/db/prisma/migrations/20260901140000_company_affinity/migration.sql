-- Firma ilgi profili (ilgi motoru Faz 2).
--
-- GÜVENLİK (docs/migration-safety.md): tamamen eklemeli — YENİ tablo, mevcut
-- hiçbir tabloya/kolona dokunmuyor. Boş tabloya index → kilit yok.
-- Geri alma: tablo düşürülür, başka hiçbir şey etkilenmez.
--
-- categoryId'de FK YOK — BİLİNÇLİ. seed-categories kategorileri sil+kur
-- yapıyor; FK olsaydı ya seed'i bloklardı ya bu satırları cascade silerdi.
-- Ölü categoryId'ler gece yeniden hesabında kendiliğinden düşer.

CREATE TABLE "company_affinity" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "sellScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "buyScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reasons" JSONB,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_affinity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "company_affinity_companyId_categoryId_key"
  ON "company_affinity"("companyId", "categoryId");
CREATE INDEX "company_affinity_categoryId_sellScore_idx"
  ON "company_affinity"("categoryId", "sellScore");
CREATE INDEX "company_affinity_categoryId_buyScore_idx"
  ON "company_affinity"("categoryId", "buyScore");
CREATE INDEX "company_affinity_companyId_idx"
  ON "company_affinity"("companyId");

ALTER TABLE "company_affinity" ADD CONSTRAINT "company_affinity_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
