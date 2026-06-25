-- Faz 1 (birleşik sistem) — additive Company + CompanyUser. Eski Tenant/Supplier durur.
-- CreateEnum
CREATE TYPE "CompanyRole" AS ENUM ('YONETICI', 'SATIN_ALMACI', 'SATISCI', 'ONAYLAYICI');
CREATE TYPE "CompanyTier" AS ENUM ('STANDARD', 'PAKET');

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "supkeysId" TEXT,
    "slug" TEXT,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "companyType" "CompanyType",
    "taxNumber" TEXT,
    "taxOffice" TEXT,
    "country" TEXT NOT NULL DEFAULT 'TR',
    "stateRegion" TEXT,
    "city" TEXT,
    "district" TEXT,
    "neighborhood" TEXT,
    "addressLine" TEXT,
    "postalCode" TEXT,
    "industry" TEXT,
    "website" TEXT,
    "billingTitle" TEXT,
    "billingEmail" TEXT,
    "billingPhone" TEXT,
    "billingPhoneVerifiedAt" TIMESTAMP(3),
    "authorizedTckn" TEXT,
    "authorizedTitle" TEXT,
    "mersisNo" TEXT,
    "tradeRegistryNo" TEXT,
    "kepAddress" TEXT,
    "iban" TEXT,
    "ibanHolder" TEXT,
    "buyerCategoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "buyerSubCategoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sellerCategoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sellerSubCategoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tier" "CompanyTier" NOT NULL DEFAULT 'STANDARD',
    "membershipEndAt" TIMESTAMP(3),
    "companyVerificationStatus" "CompanyVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "companyVerifiedAt" TIMESTAMP(3),
    "docTaxPlateUrl" TEXT,
    "docTradeRegistryUrl" TEXT,
    "docSignatureCircularUrl" TEXT,
    "docActivityCertUrl" TEXT,
    "docIdFrontUrl" TEXT,
    "docIdBackUrl" TEXT,
    "onboardingCompletedAt" TIMESTAMP(3),
    "publicEnabled" BOOLEAN NOT NULL DEFAULT false,
    "aboutText" TEXT,
    "logoUrl" TEXT,
    "coverImageUrl" TEXT,
    "linkedinUrl" TEXT,
    "instagramUrl" TEXT,
    "services" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "foundedYear" INTEGER,
    "employeeCount" TEXT,
    "certifications" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "blockedReason" TEXT,
    "blockedAt" TIMESTAMP(3),
    "ownerUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "company_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "authId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "roles" "CompanyRole"[] DEFAULT ARRAY[]::"CompanyRole"[],
    "companyId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "emailVerifiedAt" TIMESTAMP(3),
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorEnabledAt" TIMESTAMP(3),
    "permissionsOverride" JSONB,
    "notificationPrefs" JSONB,
    "invitedById" TEXT,
    "invitedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "company_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_supkeysId_key" ON "companies"("supkeysId");
CREATE UNIQUE INDEX "companies_slug_key" ON "companies"("slug");
CREATE UNIQUE INDEX "companies_taxNumber_key" ON "companies"("taxNumber");
CREATE UNIQUE INDEX "company_users_email_key" ON "company_users"("email");
CREATE UNIQUE INDEX "company_users_authId_key" ON "company_users"("authId");
CREATE INDEX "company_users_companyId_idx" ON "company_users"("companyId");

-- AddForeignKey
ALTER TABLE "company_users" ADD CONSTRAINT "company_users_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
