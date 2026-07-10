-- Admin 2FA (TOTP) kolonları (Faz 7).
ALTER TABLE "platform_admins" ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "platform_admins" ADD COLUMN "twoFactorSecret" TEXT;
