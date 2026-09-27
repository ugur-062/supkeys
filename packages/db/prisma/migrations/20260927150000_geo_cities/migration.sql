-- DÜNYA ŞEHİR LİSTESİ (2026-09-27, kullanıcı: "şehir sayfaları türkiye özel
-- olamaz, bu uluslararası bir sistem"). Tamamen EKLEMELİ:
--   · geo_cities — GeoNames cities15000 (CC BY 4.0) + Türkiye'nin 81 ili +
--     KKTC şehirleri; `pnpm --filter @rothern/db seed-geo-cities` doldurur
--   · companies.cityId / company_addresses.cityId — FK YOK (liste yeniden
--     tohumlanabilsin); mevcut satırlar `backfill-city-ids` ile eşlenir.

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "cityId" INTEGER;

-- AlterTable
ALTER TABLE "company_addresses" ADD COLUMN     "cityId" INTEGER;

-- CreateTable
CREATE TABLE "geo_cities" (
    "id" INTEGER NOT NULL,
    "countryCode" TEXT NOT NULL,
    "admin1" TEXT,
    "name" TEXT NOT NULL,
    "nameTr" TEXT,
    "nameEn" TEXT,
    "nameRu" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "population" INTEGER NOT NULL DEFAULT 0,
    "slug" TEXT NOT NULL,
    "searchText" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "geo_cities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "geo_cities_slug_key" ON "geo_cities"("slug");

-- CreateIndex
CREATE INDEX "geo_cities_countryCode_idx" ON "geo_cities"("countryCode");

-- CreateIndex
CREATE INDEX "companies_cityId_idx" ON "companies"("cityId");

-- Şehir arama önerisi (katlanmış ad, ≥3 karakter trigram).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "geo_cities_searchText_trgm_idx"
  ON "geo_cities" USING GIN ("searchText" gin_trgm_ops);

-- Kısıtlı uygulama rolü (RLS) herkese açık başvuru verisini okuyabilsin.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rothern_app') THEN
    GRANT SELECT ON "geo_cities" TO rothern_app;
  END IF;
END $$;
