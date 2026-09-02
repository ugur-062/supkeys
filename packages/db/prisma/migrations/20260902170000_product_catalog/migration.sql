-- ÜRÜN KATALOĞU (Faz 2) — `CompanyItem`i firmanın herkese açık vitrini yapar.
--
-- Güvenlik (docs/migration-safety.md):
--   · Tüm eklemeler ADD COLUMN; NOT NULL olanların hepsinde SABİT DEFAULT var
--     → PG 11+ tabloyu yeniden yazmaz, kilit anlık. Tablo bugün BOŞ (0 satır),
--     yani en kötü durumda bile veri riski yok.
--   · Yeni tablo + iki indeks; mevcut sorgulara dokunmaz.
--   · Geri alma: DROP COLUMN'lar + DROP TABLE + DROP TYPE.
--
-- `isPublic` varsayılan FALSE: mevcut satırlar ve ilan açarken hızlıca yazılan
-- kalemler kazara yayımlanmasın. Yayımlama ayrı ve bilinçli bir jest.
--
-- `priceMode` varsayılan ON_REQUEST: fiyatı olmayan bir kaydı "0 TL" ya da
-- "1 TL" gibi bir yalanla doldurmak yerine dürüst duruma çeker.

CREATE TYPE "CompanyItemPriceMode" AS ENUM ('FIXED', 'TIERED', 'ON_REQUEST');
CREATE TYPE "CategoryAttributeType" AS ENUM ('SINGLE_SELECT', 'MULTI_SELECT', 'NUMBER', 'TEXT');

ALTER TABLE "company_items"
  ADD COLUMN "isPublic"        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "publishedAt"     TIMESTAMP(3),
  ADD COLUMN "slug"            TEXT,
  ADD COLUMN "images"          TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "videoUrl"        TEXT,
  ADD COLUMN "documents"       JSONB,
  ADD COLUMN "keywords"        TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "attributes"      JSONB,
  ADD COLUMN "externalUrl"     TEXT,
  ADD COLUMN "priceMode"       "CompanyItemPriceMode" NOT NULL DEFAULT 'ON_REQUEST',
  ADD COLUMN "priceAmount"     DECIMAL(18,2),
  ADD COLUMN "priceTiers"      JSONB,
  ADD COLUMN "priceCurrency"   "Currency" NOT NULL DEFAULT 'TRY',
  ADD COLUMN "moq"             DECIMAL(18,3),
  ADD COLUMN "completionScore" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "searchText"      TEXT NOT NULL DEFAULT '';

-- Slug firma İÇİNDE tekil (NULL'lar çakışmaz — Postgres davranışı, `code`
-- kısıtıyla aynı desen).
CREATE UNIQUE INDEX "company_items_companyId_slug_key"
  ON "company_items"("companyId", "slug");

-- Vitrin sorgusu: yayımlanmış ürünler, yeni önce.
CREATE INDEX "company_items_isPublic_publishedAt_idx"
  ON "company_items"("isPublic", "publishedAt");

-- KATEGORİ → NİTELİK MATRİSİ.
-- Nitelikler kategori ağacında YUKARIDAN MİRAS alınır: bir ürünün nitelikleri
-- kodunun ata zincirindeki (L1→L4) tüm satırların birleşimidir. Bu sayede
-- 158.018 kategoriye tek tek satır yazmak gerekmiyor.
CREATE TABLE "category_attributes" (
  "id"         TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "groupKey"   TEXT NOT NULL,
  "nameTr"     TEXT NOT NULL,
  "type"       "CategoryAttributeType" NOT NULL,
  "options"    TEXT[] DEFAULT ARRAY[]::TEXT[],
  "unit"       TEXT,
  "isRequired" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder"  INTEGER NOT NULL DEFAULT 0,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "category_attributes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "category_attributes_categoryId_groupKey_key"
  ON "category_attributes"("categoryId", "groupKey");
CREATE INDEX "category_attributes_categoryId_idx"
  ON "category_attributes"("categoryId");
