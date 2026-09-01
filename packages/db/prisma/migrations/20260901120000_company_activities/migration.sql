-- Faaliyet tipi (Faz 4) — firmanın NE YAPTIĞI ekseni.
--
-- GÜVENLİK (docs/migration-safety.md kontrol listesi):
--   · CREATE TYPE — yeni tip, mevcut veriye dokunmaz.
--   · ADD COLUMN + SABİT DEFAULT (PG11+) — metadata-only, tablo rewrite YOK,
--     kilit yok. Listede "güvenli sayılan desen" olarak geçiyor.
--   · GIN index — `companies` 20 satır (ölçüldü), CONCURRENTLY gerekmiyor.
--   · DROP / rename / NOT NULL-backfill / tip daraltma YOK. Tamamen eklemeli.
--   · Geri alma: kolon ve tip düşürülür, başka hiçbir şey etkilenmez.

-- CreateEnum
CREATE TYPE "CompanyActivity" AS ENUM (
  'MANUFACTURER',
  'DISTRIBUTOR',
  'SERVICE_PROVIDER',
  'IMPORTER_EXPORTER',
  'CONTRACT_MANUFACTURER'
);

-- AlterTable
ALTER TABLE "companies"
  ADD COLUMN "activities" "CompanyActivity"[] DEFAULT ARRAY[]::"CompanyActivity"[];

-- Dizinde faaliyet tipine göre süzme (`activities && ARRAY[...]`) için.
CREATE INDEX "companies_activities_idx" ON "companies" USING GIN ("activities");
