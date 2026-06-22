-- Madde 29 — 3 aşamalı kayıt/onboarding/doğrulama veri modeli.

-- Şirket doğrulama durumu (Tenant + Supplier ortak).
CREATE TYPE "CompanyVerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');

-- ============================================================
-- TENANT (alıcı)
-- ============================================================
ALTER TABLE "tenants"
  ADD COLUMN "companyType" "CompanyType",
  ADD COLUMN "legalName" TEXT,
  ADD COLUMN "neighborhood" TEXT,
  ADD COLUMN "billingTitle" TEXT,
  ADD COLUMN "billingEmail" TEXT,
  ADD COLUMN "authorizedTckn" TEXT,
  ADD COLUMN "authorizedTitle" TEXT,
  ADD COLUMN "mersisNo" TEXT,
  ADD COLUMN "tradeRegistryNo" TEXT,
  ADD COLUMN "kepAddress" TEXT,
  ADD COLUMN "iban" TEXT,
  ADD COLUMN "ibanHolder" TEXT,
  ADD COLUMN "billingPhone" TEXT,
  ADD COLUMN "billingPhoneVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "docTaxPlateUrl" TEXT,
  ADD COLUMN "docTradeRegistryUrl" TEXT,
  ADD COLUMN "docSignatureCircularUrl" TEXT,
  ADD COLUMN "docActivityCertUrl" TEXT,
  ADD COLUMN "docIdFrontUrl" TEXT,
  ADD COLUMN "docIdBackUrl" TEXT,
  ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3),
  ADD COLUMN "companyVerificationStatus" "CompanyVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN "companyVerifiedAt" TIMESTAMP(3);

-- ============================================================
-- SUPPLIER (tedarikçi) — mersisNo zaten mevcut.
-- ============================================================
ALTER TABLE "suppliers"
  ADD COLUMN "legalName" TEXT,
  ADD COLUMN "neighborhood" TEXT,
  ADD COLUMN "billingTitle" TEXT,
  ADD COLUMN "billingEmail" TEXT,
  ADD COLUMN "authorizedTckn" TEXT,
  ADD COLUMN "authorizedTitle" TEXT,
  ADD COLUMN "tradeRegistryNo" TEXT,
  ADD COLUMN "kepAddress" TEXT,
  ADD COLUMN "iban" TEXT,
  ADD COLUMN "ibanHolder" TEXT,
  ADD COLUMN "billingPhone" TEXT,
  ADD COLUMN "billingPhoneVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "docTaxPlateUrl" TEXT,
  ADD COLUMN "docTradeRegistryUrl" TEXT,
  ADD COLUMN "docSignatureCircularUrl" TEXT,
  ADD COLUMN "docActivityCertUrl" TEXT,
  ADD COLUMN "docIdFrontUrl" TEXT,
  ADD COLUMN "docIdBackUrl" TEXT,
  ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3),
  ADD COLUMN "companyVerificationStatus" "CompanyVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN "companyVerifiedAt" TIMESTAMP(3);

-- ============================================================
-- 2FA — User (alıcı) + SupplierUser (tedarikçi)
-- ============================================================
ALTER TABLE "users"
  ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "twoFactorEnabledAt" TIMESTAMP(3);

ALTER TABLE "supplier_users"
  ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "twoFactorEnabledAt" TIMESTAMP(3);
