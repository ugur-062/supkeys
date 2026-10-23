-- KAYITSIZ ADRESE TALEP DAVETİ KUYRUĞU (2026-09-27, teslim edilebilirlik Faz 0b).
-- Tamamen EKLEMELİ:
--   · external_listing_invites — talep × adres (bir alıcı aynı tedarikçiyi her
--     yeni talebine davet edebilsin; referral satırı yalnız bağlantı jetonunu taşır)
--   · company_referral_invites.lastClickedAt — ilgi sinyali (sıklık freni gevşer)
--   · mevcut talep bağlamlı referral davetleri GÖNDERİLMİŞ talep daveti olarak taşınır

-- CreateEnum
CREATE TYPE "ExternalInviteSource" AS ENUM ('MANUAL', 'AI_FORM', 'AI_AUTO');

-- CreateEnum
CREATE TYPE "ExternalInviteState" AS ENUM ('QUEUED', 'SENT', 'CANCELLED', 'FAILED');

-- AlterTable
ALTER TABLE "company_referral_invites" ADD COLUMN "lastClickedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "external_listing_invites" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "inviterCompanyId" TEXT NOT NULL,
    "referralInviteId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "country" TEXT,
    "source" "ExternalInviteSource" NOT NULL DEFAULT 'MANUAL',
    "state" "ExternalInviteState" NOT NULL DEFAULT 'QUEUED',
    "sendAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "reminderSentAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "emailLogId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_listing_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "external_listing_invites_listingId_email_key" ON "external_listing_invites"("listingId", "email");

-- CreateIndex
CREATE INDEX "external_listing_invites_state_sendAfter_idx" ON "external_listing_invites"("state", "sendAfter");

-- CreateIndex
CREATE INDEX "external_listing_invites_email_sentAt_idx" ON "external_listing_invites"("email", "sentAt");

-- CreateIndex
CREATE INDEX "external_listing_invites_inviterCompanyId_createdAt_idx" ON "external_listing_invites"("inviterCompanyId", "createdAt");

-- AddForeignKey
ALTER TABLE "external_listing_invites" ADD CONSTRAINT "external_listing_invites_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_listing_invites" ADD CONSTRAINT "external_listing_invites_referralInviteId_fkey" FOREIGN KEY ("referralInviteId") REFERENCES "company_referral_invites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Veri taşıma: talep bağlamlı eski referral davetleri gönderilmiş talep daveti.
INSERT INTO "external_listing_invites"
  ("id", "listingId", "inviterCompanyId", "referralInviteId", "email", "locale",
   "source", "state", "sendAfter", "sentAt", "createdAt", "updatedAt")
SELECT 'eli_' || r."id", r."listingId", r."inviterCompanyId", r."id", r."email",
       COALESCE(r."locale", 'tr'), 'MANUAL', 'SENT', r."createdAt", r."updatedAt",
       r."createdAt", r."updatedAt"
FROM "company_referral_invites" r
JOIN "listings" l ON l."id" = r."listingId"
WHERE r."listingId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- Kısıtlı uygulama rolü (RLS kurulumu) varsa yazma izni. Firma kapsamı servis
-- katmanında (inviterCompanyId); gönderim işi bypass istemcisiyle okur.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rothern_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "external_listing_invites" TO rothern_app;
  END IF;
END $$;
