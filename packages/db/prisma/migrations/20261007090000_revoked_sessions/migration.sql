-- OTURUM BAZLI IPTAL (2026-10-07, canli oncesi saglamlastirma H2). EKLEMELI.
-- Cikis (logout) yalniz cerezi siliyordu; ayni JWT omru boyunca (kalici
-- oturumda 7 gun) gecerli kaliyordu. Artik JWT bir oturum kimligi (jti) tasir
-- ve cikista o jti buraya yazilir; stratejiler + /rt gecidi reddeder.
--
-- Yalniz YENI tablo: mevcut tabloya dokunulmaz, kilit/yeniden yazma yok,
-- backfill yok (jti'siz eski jetonlar omurleri dolana dek gecerli kalir).
-- Tablo kucuk kalir: gece temizligi expiresAt'i gecen satirlari siler.

-- CreateTable
CREATE TABLE "revoked_sessions" (
    "jti" TEXT NOT NULL,
    "realm" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revoked_sessions_pkey" PRIMARY KEY ("jti")
);

-- CreateIndex
CREATE INDEX "revoked_sessions_expiresAt_idx" ON "revoked_sessions"("expiresAt");

-- Kisitli uygulama rolu (RLS kurulumu) varsa yazma izni — tablo firma
-- kapsamli DEGIL, RLS politikasi yok.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rothern_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "revoked_sessions" TO rothern_app;
  END IF;
END $$;
