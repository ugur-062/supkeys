-- Yetki tablosu (2026-09-05, Faz 1): kişi başına AÇIK izin listesi.
-- Eklemeli, sabit DEFAULT → kilit anlık; veri kaybı yok. Backfill ayrı script:
--   pnpm --filter @rothern/db backfill-user-permissions
-- (roller + permissionsOverride → permissions; hazır setler @rothern/shared'dan)
ALTER TABLE "company_users" ADD COLUMN "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "company_user_invitations" ADD COLUMN "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
