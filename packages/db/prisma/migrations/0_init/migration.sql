-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'SALES', 'SUPPORT');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'COMPLAINED', 'FAILED');

-- CreateEnum
CREATE TYPE "EmailEventType" AS ENUM ('SENT', 'DELIVERED', 'DELIVERY_DELAYED', 'BOUNCED', 'COMPLAINED', 'OPENED', 'CLICKED', 'FAILED');

-- CreateEnum
CREATE TYPE "CompanyType" AS ENUM ('JOINT_STOCK', 'LIMITED', 'SOLE_PROPRIETOR');

-- CreateEnum
CREATE TYPE "CompanyVerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('TRY', 'USD', 'EUR', 'GBP', 'CHF', 'JPY', 'AED', 'CNY');

-- CreateEnum
CREATE TYPE "CompanyRole" AS ENUM ('YONETICI', 'SATIN_ALMACI', 'SATISCI', 'ONAYLAYICI');

-- CreateEnum
CREATE TYPE "CompanyTier" AS ENUM ('STANDARD', 'PAKET');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('PENDING', 'ACTIVE');

-- CreateEnum
CREATE TYPE "ConnectionOrigin" AS ENUM ('INVITE', 'PREMIUM', 'ADMIN');

-- CreateEnum
CREATE TYPE "ListingType" AS ENUM ('ALIM', 'SATIS');

-- CreateEnum
CREATE TYPE "ListingBidStatus" AS ENUM ('SUBMITTED', 'WITHDRAWN', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "CompanyOrderStatus" AS ENUM ('CREATED', 'IN_DELIVERY', 'DELIVERED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CompanyDocType" AS ENUM ('DELIVERY', 'PAYMENT');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'AWARDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ListingVisibility" AS ENUM ('PUBLIC', 'CONNECTIONS', 'PRIVATE');

-- CreateEnum
CREATE TYPE "ListingFormat" AS ENUM ('RFQ', 'ENGLISH_AUCTION');

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "companyUserId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByAdminId" TEXT,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_admins" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "authId" TEXT,
    "passwordHash" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'SUPPORT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_logs" (
    "id" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "toName" TEXT,
    "subject" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "errorMessage" TEXT,
    "payload" JSONB,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "bounceType" TEXT,
    "bounceReason" TEXT,
    "complainedAt" TIMESTAMP(3),
    "contextType" TEXT,
    "contextId" TEXT,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_events" (
    "id" TEXT NOT NULL,
    "emailLogId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" "EmailEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "clickedUrl" TEXT,
    "bounceType" TEXT,
    "bounceReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameTr" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "parentId" TEXT,
    "segmentLetter" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "company_complaints" (
    "id" TEXT NOT NULL,
    "complainantCompanyId" TEXT NOT NULL,
    "againstCompanyId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "detail" TEXT,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'OPEN',
    "adminNote" TEXT,
    "createdById" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_complaints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_connections" (
    "id" TEXT NOT NULL,
    "inviterCompanyId" TEXT NOT NULL,
    "inviteeCompanyId" TEXT NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "origin" "ConnectionOrigin" NOT NULL DEFAULT 'INVITE',
    "invitedById" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_blocks" (
    "id" TEXT NOT NULL,
    "blockerCompanyId" TEXT NOT NULL,
    "blockedCompanyId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_order_documents" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "CompanyDocType" NOT NULL,
    "key" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "uploadedByCompanyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_order_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_orders" (
    "id" TEXT NOT NULL,
    "number" TEXT,
    "listingId" TEXT,
    "sellerCompanyId" TEXT NOT NULL,
    "buyerCompanyId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "status" "CompanyOrderStatus" NOT NULL DEFAULT 'CREATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_bids" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "bidderCompanyId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "note" TEXT,
    "isBuyNow" BOOLEAN NOT NULL DEFAULT false,
    "status" "ListingBidStatus" NOT NULL DEFAULT 'SUBMITTED',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listing_bids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" TEXT NOT NULL,
    "number" TEXT,
    "companyId" TEXT NOT NULL,
    "type" "ListingType" NOT NULL,
    "isInternational" BOOLEAN NOT NULL DEFAULT false,
    "format" "ListingFormat",
    "visibility" "ListingVisibility" NOT NULL DEFAULT 'CONNECTIONS',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "minPrice" DECIMAL(18,2),
    "buyNowPrice" DECIMAL(18,2),
    "status" "ListingStatus" NOT NULL DEFAULT 'OPEN',
    "closesAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_companyUserId_idx" ON "password_reset_tokens"("companyUserId");

-- CreateIndex
CREATE UNIQUE INDEX "platform_admins_email_key" ON "platform_admins"("email");

-- CreateIndex
CREATE UNIQUE INDEX "platform_admins_authId_key" ON "platform_admins"("authId");

-- CreateIndex
CREATE UNIQUE INDEX "email_logs_providerMessageId_key" ON "email_logs"("providerMessageId");

-- CreateIndex
CREATE INDEX "email_logs_status_idx" ON "email_logs"("status");

-- CreateIndex
CREATE INDEX "email_logs_toEmail_idx" ON "email_logs"("toEmail");

-- CreateIndex
CREATE INDEX "email_logs_template_idx" ON "email_logs"("template");

-- CreateIndex
CREATE INDEX "email_logs_contextType_contextId_idx" ON "email_logs"("contextType", "contextId");

-- CreateIndex
CREATE INDEX "email_logs_queuedAt_idx" ON "email_logs"("queuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "email_events_eventId_key" ON "email_events"("eventId");

-- CreateIndex
CREATE INDEX "email_events_emailLogId_occurredAt_idx" ON "email_events"("emailLogId", "occurredAt");

-- CreateIndex
CREATE INDEX "email_events_eventType_idx" ON "email_events"("eventType");

-- CreateIndex
CREATE UNIQUE INDEX "categories_code_key" ON "categories"("code");

-- CreateIndex
CREATE INDEX "categories_parentId_sortOrder_idx" ON "categories"("parentId", "sortOrder");

-- CreateIndex
CREATE INDEX "categories_level_sortOrder_idx" ON "categories"("level", "sortOrder");

-- CreateIndex
CREATE INDEX "categories_code_idx" ON "categories"("code");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_createdAt_idx" ON "audit_logs"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "companies_supkeysId_key" ON "companies"("supkeysId");

-- CreateIndex
CREATE UNIQUE INDEX "companies_slug_key" ON "companies"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "companies_taxNumber_key" ON "companies"("taxNumber");

-- CreateIndex
CREATE INDEX "company_complaints_againstCompanyId_idx" ON "company_complaints"("againstCompanyId");

-- CreateIndex
CREATE INDEX "company_complaints_status_idx" ON "company_complaints"("status");

-- CreateIndex
CREATE INDEX "company_connections_inviteeCompanyId_idx" ON "company_connections"("inviteeCompanyId");

-- CreateIndex
CREATE UNIQUE INDEX "company_connections_inviterCompanyId_inviteeCompanyId_key" ON "company_connections"("inviterCompanyId", "inviteeCompanyId");

-- CreateIndex
CREATE INDEX "company_blocks_blockedCompanyId_idx" ON "company_blocks"("blockedCompanyId");

-- CreateIndex
CREATE UNIQUE INDEX "company_blocks_blockerCompanyId_blockedCompanyId_key" ON "company_blocks"("blockerCompanyId", "blockedCompanyId");

-- CreateIndex
CREATE INDEX "company_order_documents_orderId_idx" ON "company_order_documents"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "company_orders_number_key" ON "company_orders"("number");

-- CreateIndex
CREATE UNIQUE INDEX "company_orders_listingId_key" ON "company_orders"("listingId");

-- CreateIndex
CREATE INDEX "company_orders_sellerCompanyId_idx" ON "company_orders"("sellerCompanyId");

-- CreateIndex
CREATE INDEX "company_orders_buyerCompanyId_idx" ON "company_orders"("buyerCompanyId");

-- CreateIndex
CREATE INDEX "listing_bids_listingId_idx" ON "listing_bids"("listingId");

-- CreateIndex
CREATE INDEX "listing_bids_bidderCompanyId_idx" ON "listing_bids"("bidderCompanyId");

-- CreateIndex
CREATE UNIQUE INDEX "listing_bids_listingId_bidderCompanyId_key" ON "listing_bids"("listingId", "bidderCompanyId");

-- CreateIndex
CREATE UNIQUE INDEX "listings_number_key" ON "listings"("number");

-- CreateIndex
CREATE INDEX "listings_companyId_idx" ON "listings"("companyId");

-- CreateIndex
CREATE INDEX "listings_status_idx" ON "listings"("status");

-- CreateIndex
CREATE UNIQUE INDEX "company_users_email_key" ON "company_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "company_users_authId_key" ON "company_users"("authId");

-- CreateIndex
CREATE INDEX "company_users_companyId_idx" ON "company_users"("companyId");

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_companyUserId_fkey" FOREIGN KEY ("companyUserId") REFERENCES "company_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_emailLogId_fkey" FOREIGN KEY ("emailLogId") REFERENCES "email_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_complaints" ADD CONSTRAINT "company_complaints_complainantCompanyId_fkey" FOREIGN KEY ("complainantCompanyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_complaints" ADD CONSTRAINT "company_complaints_againstCompanyId_fkey" FOREIGN KEY ("againstCompanyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_connections" ADD CONSTRAINT "company_connections_inviterCompanyId_fkey" FOREIGN KEY ("inviterCompanyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_connections" ADD CONSTRAINT "company_connections_inviteeCompanyId_fkey" FOREIGN KEY ("inviteeCompanyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_blocks" ADD CONSTRAINT "company_blocks_blockerCompanyId_fkey" FOREIGN KEY ("blockerCompanyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_blocks" ADD CONSTRAINT "company_blocks_blockedCompanyId_fkey" FOREIGN KEY ("blockedCompanyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_order_documents" ADD CONSTRAINT "company_order_documents_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "company_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_orders" ADD CONSTRAINT "company_orders_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_orders" ADD CONSTRAINT "company_orders_sellerCompanyId_fkey" FOREIGN KEY ("sellerCompanyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_orders" ADD CONSTRAINT "company_orders_buyerCompanyId_fkey" FOREIGN KEY ("buyerCompanyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_bids" ADD CONSTRAINT "listing_bids_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_bids" ADD CONSTRAINT "listing_bids_bidderCompanyId_fkey" FOREIGN KEY ("bidderCompanyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_users" ADD CONSTRAINT "company_users_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Sistem-genelinde benzersiz ilan + sipariş numarası (global sequence).
CREATE SEQUENCE IF NOT EXISTS "listing_number_seq" START 1;
CREATE SEQUENCE IF NOT EXISTS "order_number_seq" START 1;
