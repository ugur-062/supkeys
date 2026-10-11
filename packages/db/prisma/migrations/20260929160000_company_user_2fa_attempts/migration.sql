-- Hesap bazli 2FA deneme freni + TOTP tekrar kullanim engeli (derin denetim
-- 2026-09-29 MU-16). EKLEMELI: NOT NULL + sabit DEFAULT (PG11+ metadata-only,
-- tablo yeniden yazilmaz), diger iki kolon nullable/default yok. Index yok.
-- RLS politikalari kolon eklemesinden etkilenmez; tablo duzeyi GRANT kapsar.
ALTER TABLE "company_users"
  ADD COLUMN "twoFactorFailedAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "twoFactorWindowStartedAt" TIMESTAMP(3),
  ADD COLUMN "twoFactorLastTotpStep" INTEGER;
