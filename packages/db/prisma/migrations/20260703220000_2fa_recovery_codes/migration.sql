-- 2FA kurtarma kodları (SHA-256 hash, tek kullanımlık) — authenticator
-- kaybında hesaba erişim yolu; enable'da üretilir, bir kez gösterilir.
ALTER TABLE "company_users" ADD COLUMN "twoFactorRecoveryCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
