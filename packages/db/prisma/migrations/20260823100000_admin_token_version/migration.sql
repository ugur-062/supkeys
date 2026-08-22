-- Admin oturum iptali (denetim 2026-08-23 Parça 1 #3): PlatformAdmin.tokenVersion.
-- Ekleme-only, default 0 — mevcut admin token'ları (tv claim'siz = 0) geçerli kalır;
-- parola değişimi/reset/2FA değişimi artırır → eski cookie'ler 401.
ALTER TABLE "platform_admins" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
