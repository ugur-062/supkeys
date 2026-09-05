-- Yetki tablosu Faz 4 (2026-09-06): kişi-bazlı override kolonu kaldırıldı.
-- Değerler 20260905230000 sonrası backfill ile `permissions` listesine katıldı;
-- kod Faz 1'den beri okumuyor. Geri dönüş: PITR (docs/migration-safety.md).
ALTER TABLE "company_users" DROP COLUMN IF EXISTS "permissionsOverride";
