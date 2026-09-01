-- Faz 2 — Kalem Kataloğu (`company_items`).
--
-- GÜVENLİK NOTU (docs/migration-safety.md): YENİ TABLO — mevcut hiçbir tabloya
-- dokunulmuyor, veri kaybı yok. Geri alma = DROP TABLE.
--
-- RLS policy'si BU MIGRATION'DA yazılıyor. Denetimde iki kez şu hata çıktı:
-- plan mühürlendikten sonra eklenen kiracı tablosu backstop dışında kaldı
-- (`order_revision_items`, `company_kyc_revisions`). Tablo ve policy'nin
-- ayrılmaması bu sınıfı kapatır.

CREATE TABLE "company_items" (
  "id"            TEXT NOT NULL,
  "companyId"     TEXT NOT NULL,
  "code"          TEXT,
  "name"          TEXT NOT NULL,
  "description"   TEXT,
  "specification" TEXT,
  "unitCode"      TEXT,
  "unit"          TEXT NOT NULL,
  "categoryId"    TEXT,
  "brand"         TEXT,
  "mpn"           TEXT,
  "targetPrice"   DECIMAL(18,2),
  "isActive"      BOOLEAN NOT NULL DEFAULT true,
  "usageCount"    INTEGER NOT NULL DEFAULT 0,
  "lastUsedAt"    TIMESTAMP(3),
  "createdById"   TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "company_items_pkey" PRIMARY KEY ("id")
);

-- Kod verilmişse firma içinde tekil; NULL kodlar çakışmaz (Postgres UNIQUE
-- semantiği) → kod tutmayan firma sınırsız kalem ekleyebilir.
CREATE UNIQUE INDEX "company_items_companyId_code_key"
  ON "company_items"("companyId", "code");

CREATE INDEX "company_items_companyId_isActive_idx"
  ON "company_items"("companyId", "isActive");

CREATE INDEX "company_items_companyId_categoryId_idx"
  ON "company_items"("companyId", "categoryId");

ALTER TABLE "company_items"
  ADD CONSTRAINT "company_items_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS backstop — kardeş kiracı tablolarıyla aynı desen (doğrudan companyId).
ALTER TABLE "company_items" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_items_rls" ON "company_items"
  USING (current_setting('app.current_company_id', true) = "companyId");
