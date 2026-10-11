-- AKŞAM ÖZETİ KUYRUĞU (2026-09-27, günlük e-posta programı Faz 2). EKLEMELİ.

-- CreateTable
CREATE TABLE "email_digest_items" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "email_digest_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_digest_items_email_kind_listingId_key" ON "email_digest_items"("email", "kind", "listingId");

-- CreateIndex
CREATE INDEX "email_digest_items_sentAt_createdAt_idx" ON "email_digest_items"("sentAt", "createdAt");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rothern_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "email_digest_items" TO rothern_app;
  END IF;
END $$;
