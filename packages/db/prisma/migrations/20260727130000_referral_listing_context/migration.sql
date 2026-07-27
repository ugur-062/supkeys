-- Dış davet (Faz C): referral'a ihale bağlamı + opt-out tablosu.
-- listingId FK'sız TEXT (ihale silinirse davet e-postası zaten gitmiş;
-- kabul anında status kontrol edilir). Ek kolon + yeni tablo — kilit yok.
ALTER TABLE "company_referral_invites" ADD COLUMN "listingId" TEXT;

CREATE TABLE "referral_opt_outs" (
  "email" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "referral_opt_outs_pkey" PRIMARY KEY ("email")
);
