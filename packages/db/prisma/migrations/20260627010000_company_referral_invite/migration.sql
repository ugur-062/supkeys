-- CreateEnum
CREATE TYPE "ReferralInviteStatus" AS ENUM ('PENDING', 'ACCEPTED');

-- CreateTable
CREATE TABLE "company_referral_invites" (
    "id" TEXT NOT NULL,
    "inviterCompanyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "ReferralInviteStatus" NOT NULL DEFAULT 'PENDING',
    "acceptedCompanyId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "company_referral_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_referral_invites_token_key" ON "company_referral_invites"("token");
CREATE INDEX "company_referral_invites_email_idx" ON "company_referral_invites"("email");
CREATE UNIQUE INDEX "company_referral_invites_inviterCompanyId_email_key" ON "company_referral_invites"("inviterCompanyId", "email");

-- AddForeignKey
ALTER TABLE "company_referral_invites" ADD CONSTRAINT "company_referral_invites_inviterCompanyId_fkey" FOREIGN KEY ("inviterCompanyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
