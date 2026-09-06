-- Üç paket (2026-09-06, kullanıcı kararı): BRONZ kaldırıldı.
-- 1) Mevcut Bronz firmalar SILVER'a taşınır (yukarı taşıma — kimse kilitlenmez;
--    üyelik süresi korunur).
UPDATE "companies" SET "tier" = 'SILVER' WHERE "tier" = 'BRONZ';
-- 2) Enum değeri düşürülür: Postgres enum değeri silemez → tip yeniden kurulur.
--    companies küçük tablo (yüzler) → kısa kilit; PITR ile geri dönüş.
CREATE TYPE "CompanyTier_new" AS ENUM ('STANDART', 'SILVER', 'GOLD');
ALTER TABLE "companies" ALTER COLUMN "tier" DROP DEFAULT;
ALTER TABLE "companies"
  ALTER COLUMN "tier" TYPE "CompanyTier_new" USING ("tier"::text::"CompanyTier_new");
ALTER TABLE "companies" ALTER COLUMN "tier" SET DEFAULT 'STANDART';
DROP TYPE "CompanyTier";
ALTER TYPE "CompanyTier_new" RENAME TO "CompanyTier";
