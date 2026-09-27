-- TEK TIK ABONELİKTEN ÇIKIŞ (2026-09-27, e-posta teslim edilebilirliği Faz 0).
-- Tamamen EKLEMELİ:
--   · email_opt_outs — adres × kapsam (bildirim tercih anahtarı | lifecycle | all)
--   · email_logs (toEmail, queuedAt) dizini — alıcı başına sıklık sorguları

-- CreateTable
CREATE TABLE "email_opt_outs" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_opt_outs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_opt_outs_email_scope_key" ON "email_opt_outs"("email", "scope");

-- CreateIndex
CREATE INDEX "email_logs_toEmail_queuedAt_idx" ON "email_logs"("toEmail", "queuedAt");

-- Kısıtlı uygulama rolü (RLS kurulumu) varsa yazma izni — tablo firma
-- kapsamlı DEĞİL, RLS politikası yok.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rothern_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "email_opt_outs" TO rothern_app;
  END IF;
END $$;
