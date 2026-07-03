-- Oturum geçersiz kılma: parola değişiminde tokenVersion artar; JWT'deki
-- sürümle eşleşmeyen istekler reddedilir (çalınan/eski token ölür).
ALTER TABLE "company_users" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
