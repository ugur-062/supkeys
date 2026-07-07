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
CREATE TYPE "TwoFactorMethod" AS ENUM ('AUTHENTICATOR', 'EMAIL');

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
CREATE TYPE "ReferralInviteStatus" AS ENUM ('PENDING', 'ACCEPTED');

-- CreateEnum
CREATE TYPE "ListingType" AS ENUM ('ALIM', 'SATIS');

-- CreateEnum
CREATE TYPE "ListingBidStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'WITHDRAWN', 'WON', 'AWARDED_PARTIAL', 'LOST');

-- CreateEnum
CREATE TYPE "CompanyOrderStatus" AS ENUM ('PENDING', 'ACCEPTED', 'CREATED', 'IN_DELIVERY', 'DELIVERED', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CompanyOrderPaymentTiming" AS ENUM ('BEFORE_DELIVERY', 'AFTER_DELIVERY');

-- CreateEnum
CREATE TYPE "CompanyOrderPaymentStatus" AS ENUM ('AWAITING_CONFIRMATION', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CompanyDocType" AS ENUM ('DELIVERY', 'PAYMENT', 'TEMINAT');

-- CreateEnum
CREATE TYPE "ListingBidDocKind" AS ENUM ('TEKLIF_MEKTUBU', 'TEKNIK_DOKUMAN', 'REFERANS', 'KATALOG', 'TEMINAT', 'DIGER');

-- CreateEnum
CREATE TYPE "ListingDocKind" AS ENUM ('IDARI_SARTNAME', 'TEKNIK_SARTNAME', 'SOZLESME', 'EK', 'NUMUNE', 'DIGER');

-- CreateEnum
CREATE TYPE "ListingPriceScope" AS ENUM ('TOPLU', 'KALEM');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'IN_APPROVAL', 'OPEN', 'CLOSED', 'IN_AWARD', 'IN_AWARD_APPROVAL', 'AWARDED', 'CLOSED_NO_AWARD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ListingVisibility" AS ENUM ('PUBLIC', 'CONNECTIONS', 'PRIVATE');

-- CreateEnum
CREATE TYPE "ListingFormat" AS ENUM ('RFQ', 'ENGLISH_AUCTION');

-- CreateEnum
CREATE TYPE "ListingDeliveryTerm" AS ENUM ('DOMESTIC_DELIVERED', 'DOMESTIC_PICKUP', 'DOMESTIC_CARRIER_COLLECT', 'DOMESTIC_ON_VEHICLE', 'EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'FAS', 'FOB', 'CFR', 'CIF');

-- CreateEnum
CREATE TYPE "ListingPaymentTerm" AS ENUM ('CASH', 'DEFERRED');

-- CreateEnum
CREATE TYPE "ListingPaymentTiming" AS ENUM ('BEFORE_DELIVERY', 'AFTER_DELIVERY');

-- CreateEnum
CREATE TYPE "ListingBidVisibility" AS ENUM ('OWN_ONLY', 'BEST_PRICE', 'OWN_RANK', 'BEST_AND_OWN_RANK', 'ALL');

-- CreateEnum
CREATE TYPE "ListingDecrementType" AS ENUM ('AMOUNT', 'PERCENT');

-- CreateEnum
CREATE TYPE "ListingDecrementBasis" AS ENUM ('OWN_LAST_BID', 'BEST_BID');

-- CreateEnum
CREATE TYPE "ListingQuestionAnswerType" AS ENUM ('TEXT', 'NUMBER', 'YES_NO', 'DATE');

-- CreateEnum
CREATE TYPE "CompanyInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ApprovalType" AS ENUM ('LISTING_PUBLISH', 'LISTING_AWARD');

-- CreateEnum
CREATE TYPE "ApprovalFlowStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PASSIVE');

-- CreateEnum
CREATE TYPE "ApprovalRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApprovalStepStatus" AS ENUM ('WAITING', 'PENDING', 'APPROVED', 'REJECTED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "CompanyAddressType" AS ENUM ('FATURA', 'ILETISIM', 'TESLIMAT');

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
CREATE TABLE "email_verification_codes" (
    "id" TEXT NOT NULL,
    "companyUserId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_codes_pkey" PRIMARY KEY ("id")
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
    "rothernId" TEXT,
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
    "companyRejectionReason" TEXT,
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
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "certificateImages" TEXT[] DEFAULT ARRAY[]::TEXT[],
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
CREATE TABLE "message_threads" (
    "id" TEXT NOT NULL,
    "buyerCompanyId" TEXT NOT NULL,
    "sellerCompanyId" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderCompanyId" TEXT NOT NULL,
    "senderUserId" TEXT,
    "senderName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" TEXT NOT NULL,
    "currency" "Currency" NOT NULL,
    "rate" DECIMAL(15,6) NOT NULL,
    "rateDate" DATE NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'TCMB',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
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
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "status" "CompanyOrderStatus" NOT NULL DEFAULT 'PENDING',
    "paymentTiming" "CompanyOrderPaymentTiming" NOT NULL DEFAULT 'AFTER_DELIVERY',
    "rejectedReason" TEXT,
    "cancelReason" TEXT,
    "deliveryAddress" JSONB,
    "acceptedAt" TIMESTAMP(3),
    "acceptedNote" TEXT,
    "bankAccountHolder" TEXT,
    "bankIban" TEXT,
    "expectedDeliveryDate" TIMESTAMP(3),
    "invoiceNumber" TEXT,
    "deliveryStartedAt" TIMESTAMP(3),
    "deliveryNote" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completedNote" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_reviews" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "reviewerCompanyId" TEXT NOT NULL,
    "targetCompanyId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_order_payments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "method" TEXT,
    "note" TEXT,
    "status" "CompanyOrderPaymentStatus" NOT NULL DEFAULT 'AWAITING_CONFIRMATION',
    "rejectReason" TEXT,
    "recordedByCompanyId" TEXT NOT NULL,
    "recordedByUserId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chequeNo" TEXT,
    "chequeBank" TEXT,
    "chequeDueDate" TIMESTAMP(3),

    CONSTRAINT "company_order_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "company_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_bids" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "bidderCompanyId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'TRY',
    "note" TEXT,
    "isBuyNow" BOOLEAN NOT NULL DEFAULT false,
    "status" "ListingBidStatus" NOT NULL DEFAULT 'SUBMITTED',
    "round" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "submittedAt" TIMESTAMP(3),
    "deliveryDate" TIMESTAMP(3),
    "validityDays" INTEGER,
    "exchangeRateSnapshot" DECIMAL(18,6),
    "eliminationReason" TEXT,
    "eliminatedAt" TIMESTAMP(3),
    "deliveryAddressId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listing_bids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_bid_documents" (
    "id" TEXT NOT NULL,
    "bidId" TEXT NOT NULL,
    "kind" "ListingBidDocKind" NOT NULL DEFAULT 'DIGER',
    "key" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "uploadedByCompanyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_bid_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_round_snapshots" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "bidderName" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_round_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_documents" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "kind" "ListingDocKind" NOT NULL DEFAULT 'DIGER',
    "key" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "uploadedByCompanyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" TEXT NOT NULL,
    "number" TEXT,
    "companyId" TEXT NOT NULL,
    "type" "ListingType" NOT NULL,
    "isInternational" BOOLEAN NOT NULL DEFAULT false,
    "targetCountries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "format" "ListingFormat",
    "visibility" "ListingVisibility" NOT NULL DEFAULT 'CONNECTIONS',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priceScope" "ListingPriceScope",
    "minPrice" DECIMAL(18,2),
    "buyNowPrice" DECIMAL(18,2),
    "status" "ListingStatus" NOT NULL DEFAULT 'OPEN',
    "closesAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "deliveryAddressId" TEXT,
    "billingAddressId" TEXT,
    "createdById" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "awardedAt" TIMESTAMP(3),
    "closingReminderSentAt" TIMESTAMP(3),
    "currentRound" INTEGER NOT NULL DEFAULT 1,
    "categoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "terms" TEXT,
    "internalNotes" TEXT,
    "requireAllItems" BOOLEAN NOT NULL DEFAULT false,
    "requireBidDocument" BOOLEAN NOT NULL DEFAULT false,
    "primaryCurrency" "Currency" NOT NULL DEFAULT 'TRY',
    "allowedCurrencies" "Currency"[] DEFAULT ARRAY[]::"Currency"[],
    "isSealedBid" BOOLEAN NOT NULL DEFAULT true,
    "isLogistics" BOOLEAN NOT NULL DEFAULT false,
    "logistics" JSONB,
    "deliveryTerm" "ListingDeliveryTerm",
    "paymentTerm" "ListingPaymentTerm" NOT NULL DEFAULT 'CASH',
    "paymentDays" INTEGER,
    "paymentTiming" "ListingPaymentTiming" NOT NULL DEFAULT 'AFTER_DELIVERY',
    "bidsOpenAt" TIMESTAMP(3),
    "bidVisibility" "ListingBidVisibility" NOT NULL DEFAULT 'OWN_ONLY',
    "priceDecrementType" "ListingDecrementType",
    "priceDecrementValue" DECIMAL(18,4),
    "priceDecrementBasis" "ListingDecrementBasis",
    "decimalPlaces" INTEGER NOT NULL DEFAULT 2,
    "sendClosingReminder" BOOLEAN NOT NULL DEFAULT false,
    "reminderMinutesBefore" INTEGER,
    "autoExtendOnLateBid" BOOLEAN NOT NULL DEFAULT false,
    "autoExtendThresholdMin" INTEGER,
    "autoExtendByMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_templates" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_templates" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "memberCompanyIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_items" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "targetPrice" DECIMAL(18,2),
    "minUnitPrice" DECIMAL(18,2),
    "buyNowUnitPrice" DECIMAL(18,2),
    "materialCode" TEXT,
    "requiredByDate" TIMESTAMP(3),
    "awardedQuantity" DECIMAL(18,3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_item_questions" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "answerType" "ListingQuestionAnswerType" NOT NULL DEFAULT 'TEXT',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_item_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_bid_answers" (
    "id" TEXT NOT NULL,
    "bidId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_bid_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_question_templates" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_question_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_invitations" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "invitedCompanyId" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_bid_items" (
    "id" TEXT NOT NULL,
    "bidId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "note" TEXT,
    "deliveryDate" TIMESTAMP(3),

    CONSTRAINT "listing_bid_items_pkey" PRIMARY KEY ("id")
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
    "twoFactorMethod" "TwoFactorMethod" NOT NULL DEFAULT 'AUTHENTICATOR',
    "twoFactorSecret" TEXT,
    "twoFactorRecoveryCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "permissionsOverride" JSONB,
    "notificationPrefs" JSONB,
    "invitedById" TEXT,
    "invitedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "termsAcceptedAt" TIMESTAMP(3),
    "mediationAcceptedAt" TIMESTAMP(3),
    "kvkkAcceptedAt" TIMESTAMP(3),
    "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "profileImprovementConsent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_user_invitations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "roles" "CompanyRole"[] DEFAULT ARRAY[]::"CompanyRole"[],
    "token" TEXT NOT NULL,
    "status" "CompanyInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "invitedById" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_user_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "companyUserId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "portal" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "ctaUrl" TEXT,
    "ctaLabel" TEXT,
    "listingId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_flows" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ApprovalType" NOT NULL,
    "status" "ApprovalFlowStatus" NOT NULL DEFAULT 'DRAFT',
    "listingType" "ListingType",
    "initiatorRoles" "CompanyRole"[] DEFAULT ARRAY[]::"CompanyRole"[],
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_flows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_flow_steps" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "approverUserId" TEXT NOT NULL,
    "displayLabel" TEXT,
    "conditionMinAmount" DECIMAL(18,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_flow_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "type" "ApprovalType" NOT NULL,
    "status" "ApprovalRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestNo" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'TRY',
    "payload" JSONB,
    "initiatorNote" TEXT,
    "createdById" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "lastReminderAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_request_steps" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "approverUserId" TEXT NOT NULL,
    "displayLabel" TEXT,
    "status" "ApprovalStepStatus" NOT NULL DEFAULT 'WAITING',
    "note" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_request_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_bank_accounts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "accountHolder" TEXT NOT NULL,
    "iban" TEXT NOT NULL,
    "bankName" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_addresses" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "CompanyAddressType" NOT NULL,
    "title" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "country" TEXT NOT NULL DEFAULT 'TR',
    "city" TEXT,
    "district" TEXT,
    "addressLine" TEXT NOT NULL,
    "postalCode" TEXT,
    "taxOffice" TEXT,
    "taxNumber" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_companyUserId_idx" ON "password_reset_tokens"("companyUserId");

-- CreateIndex
CREATE INDEX "email_verification_codes_companyUserId_idx" ON "email_verification_codes"("companyUserId");

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
CREATE UNIQUE INDEX "companies_rothernId_key" ON "companies"("rothernId");

-- CreateIndex
CREATE UNIQUE INDEX "companies_slug_key" ON "companies"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "companies_taxNumber_key" ON "companies"("taxNumber");

-- CreateIndex
CREATE INDEX "companies_tier_isActive_country_idx" ON "companies"("tier", "isActive", "country");

-- CreateIndex
CREATE INDEX "message_threads_buyerCompanyId_idx" ON "message_threads"("buyerCompanyId");

-- CreateIndex
CREATE INDEX "message_threads_sellerCompanyId_idx" ON "message_threads"("sellerCompanyId");

-- CreateIndex
CREATE UNIQUE INDEX "message_threads_buyerCompanyId_sellerCompanyId_key" ON "message_threads"("buyerCompanyId", "sellerCompanyId");

-- CreateIndex
CREATE INDEX "messages_threadId_idx" ON "messages"("threadId");

-- CreateIndex
CREATE INDEX "exchange_rates_rateDate_idx" ON "exchange_rates"("rateDate");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_currency_rateDate_key" ON "exchange_rates"("currency", "rateDate");

-- CreateIndex
CREATE INDEX "company_complaints_againstCompanyId_idx" ON "company_complaints"("againstCompanyId");

-- CreateIndex
CREATE INDEX "company_complaints_status_idx" ON "company_complaints"("status");

-- CreateIndex
CREATE INDEX "company_connections_inviteeCompanyId_idx" ON "company_connections"("inviteeCompanyId");

-- CreateIndex
CREATE UNIQUE INDEX "company_connections_inviterCompanyId_inviteeCompanyId_key" ON "company_connections"("inviterCompanyId", "inviteeCompanyId");

-- CreateIndex
CREATE UNIQUE INDEX "company_referral_invites_token_key" ON "company_referral_invites"("token");

-- CreateIndex
CREATE INDEX "company_referral_invites_email_idx" ON "company_referral_invites"("email");

-- CreateIndex
CREATE UNIQUE INDEX "company_referral_invites_inviterCompanyId_email_key" ON "company_referral_invites"("inviterCompanyId", "email");

-- CreateIndex
CREATE INDEX "company_blocks_blockedCompanyId_idx" ON "company_blocks"("blockedCompanyId");

-- CreateIndex
CREATE UNIQUE INDEX "company_blocks_blockerCompanyId_blockedCompanyId_key" ON "company_blocks"("blockerCompanyId", "blockedCompanyId");

-- CreateIndex
CREATE INDEX "company_order_documents_orderId_idx" ON "company_order_documents"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "company_orders_number_key" ON "company_orders"("number");

-- CreateIndex
CREATE INDEX "company_orders_sellerCompanyId_idx" ON "company_orders"("sellerCompanyId");

-- CreateIndex
CREATE INDEX "company_orders_buyerCompanyId_idx" ON "company_orders"("buyerCompanyId");

-- CreateIndex
CREATE INDEX "company_orders_listingId_idx" ON "company_orders"("listingId");

-- CreateIndex
CREATE UNIQUE INDEX "company_reviews_orderId_key" ON "company_reviews"("orderId");

-- CreateIndex
CREATE INDEX "company_reviews_targetCompanyId_idx" ON "company_reviews"("targetCompanyId");

-- CreateIndex
CREATE INDEX "company_order_payments_orderId_idx" ON "company_order_payments"("orderId");

-- CreateIndex
CREATE INDEX "company_order_items_orderId_idx" ON "company_order_items"("orderId");

-- CreateIndex
CREATE INDEX "listing_bids_listingId_idx" ON "listing_bids"("listingId");

-- CreateIndex
CREATE INDEX "listing_bids_bidderCompanyId_idx" ON "listing_bids"("bidderCompanyId");

-- CreateIndex
CREATE INDEX "listing_bids_listingId_status_idx" ON "listing_bids"("listingId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "listing_bids_listingId_bidderCompanyId_key" ON "listing_bids"("listingId", "bidderCompanyId");

-- CreateIndex
CREATE INDEX "listing_bid_documents_bidId_idx" ON "listing_bid_documents"("bidId");

-- CreateIndex
CREATE INDEX "listing_round_snapshots_listingId_idx" ON "listing_round_snapshots"("listingId");

-- CreateIndex
CREATE INDEX "listing_documents_listingId_idx" ON "listing_documents"("listingId");

-- CreateIndex
CREATE UNIQUE INDEX "listings_number_key" ON "listings"("number");

-- CreateIndex
CREATE INDEX "listings_companyId_idx" ON "listings"("companyId");

-- CreateIndex
CREATE INDEX "listings_status_idx" ON "listings"("status");

-- CreateIndex
CREATE INDEX "listings_companyId_type_idx" ON "listings"("companyId", "type");

-- CreateIndex
CREATE INDEX "listing_templates_companyId_idx" ON "listing_templates"("companyId");

-- CreateIndex
CREATE INDEX "supplier_templates_companyId_idx" ON "supplier_templates"("companyId");

-- CreateIndex
CREATE INDEX "listing_items_listingId_idx" ON "listing_items"("listingId");

-- CreateIndex
CREATE INDEX "listing_item_questions_itemId_idx" ON "listing_item_questions"("itemId");

-- CreateIndex
CREATE INDEX "listing_bid_answers_bidId_idx" ON "listing_bid_answers"("bidId");

-- CreateIndex
CREATE UNIQUE INDEX "listing_bid_answers_bidId_questionId_key" ON "listing_bid_answers"("bidId", "questionId");

-- CreateIndex
CREATE INDEX "listing_question_templates_companyId_idx" ON "listing_question_templates"("companyId");

-- CreateIndex
CREATE INDEX "listing_invitations_invitedCompanyId_idx" ON "listing_invitations"("invitedCompanyId");

-- CreateIndex
CREATE UNIQUE INDEX "listing_invitations_listingId_invitedCompanyId_key" ON "listing_invitations"("listingId", "invitedCompanyId");

-- CreateIndex
CREATE INDEX "listing_bid_items_bidId_idx" ON "listing_bid_items"("bidId");

-- CreateIndex
CREATE UNIQUE INDEX "listing_bid_items_bidId_itemId_key" ON "listing_bid_items"("bidId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "company_users_email_key" ON "company_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "company_users_authId_key" ON "company_users"("authId");

-- CreateIndex
CREATE INDEX "company_users_companyId_idx" ON "company_users"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "company_user_invitations_token_key" ON "company_user_invitations"("token");

-- CreateIndex
CREATE INDEX "company_user_invitations_companyId_status_idx" ON "company_user_invitations"("companyId", "status");

-- CreateIndex
CREATE INDEX "company_user_invitations_email_status_idx" ON "company_user_invitations"("email", "status");

-- CreateIndex
CREATE INDEX "notifications_companyUserId_portal_readAt_idx" ON "notifications"("companyUserId", "portal", "readAt");

-- CreateIndex
CREATE INDEX "notifications_companyUserId_createdAt_idx" ON "notifications"("companyUserId", "createdAt");

-- CreateIndex
CREATE INDEX "approval_flows_companyId_type_status_idx" ON "approval_flows"("companyId", "type", "status");

-- CreateIndex
CREATE INDEX "approval_flow_steps_flowId_idx" ON "approval_flow_steps"("flowId");

-- CreateIndex
CREATE UNIQUE INDEX "approval_flow_steps_flowId_order_key" ON "approval_flow_steps"("flowId", "order");

-- CreateIndex
CREATE INDEX "approval_requests_companyId_status_type_idx" ON "approval_requests"("companyId", "status", "type");

-- CreateIndex
CREATE INDEX "approval_requests_listingId_idx" ON "approval_requests"("listingId");

-- CreateIndex
CREATE UNIQUE INDEX "approval_requests_companyId_requestNo_key" ON "approval_requests"("companyId", "requestNo");

-- CreateIndex
CREATE INDEX "approval_request_steps_approverUserId_status_idx" ON "approval_request_steps"("approverUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "approval_request_steps_requestId_order_key" ON "approval_request_steps"("requestId", "order");

-- CreateIndex
CREATE INDEX "company_bank_accounts_companyId_idx" ON "company_bank_accounts"("companyId");

-- CreateIndex
CREATE INDEX "company_addresses_companyId_type_idx" ON "company_addresses"("companyId", "type");

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_companyUserId_fkey" FOREIGN KEY ("companyUserId") REFERENCES "company_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification_codes" ADD CONSTRAINT "email_verification_codes_companyUserId_fkey" FOREIGN KEY ("companyUserId") REFERENCES "company_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_emailLogId_fkey" FOREIGN KEY ("emailLogId") REFERENCES "email_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_buyerCompanyId_fkey" FOREIGN KEY ("buyerCompanyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_sellerCompanyId_fkey" FOREIGN KEY ("sellerCompanyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "message_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderCompanyId_fkey" FOREIGN KEY ("senderCompanyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_complaints" ADD CONSTRAINT "company_complaints_complainantCompanyId_fkey" FOREIGN KEY ("complainantCompanyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_complaints" ADD CONSTRAINT "company_complaints_againstCompanyId_fkey" FOREIGN KEY ("againstCompanyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_connections" ADD CONSTRAINT "company_connections_inviterCompanyId_fkey" FOREIGN KEY ("inviterCompanyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_connections" ADD CONSTRAINT "company_connections_inviteeCompanyId_fkey" FOREIGN KEY ("inviteeCompanyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_referral_invites" ADD CONSTRAINT "company_referral_invites_inviterCompanyId_fkey" FOREIGN KEY ("inviterCompanyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "company_reviews" ADD CONSTRAINT "company_reviews_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "company_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_reviews" ADD CONSTRAINT "company_reviews_reviewerCompanyId_fkey" FOREIGN KEY ("reviewerCompanyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_reviews" ADD CONSTRAINT "company_reviews_targetCompanyId_fkey" FOREIGN KEY ("targetCompanyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_order_payments" ADD CONSTRAINT "company_order_payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "company_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_order_items" ADD CONSTRAINT "company_order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "company_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_bids" ADD CONSTRAINT "listing_bids_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_bids" ADD CONSTRAINT "listing_bids_bidderCompanyId_fkey" FOREIGN KEY ("bidderCompanyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_bids" ADD CONSTRAINT "listing_bids_deliveryAddressId_fkey" FOREIGN KEY ("deliveryAddressId") REFERENCES "company_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_bid_documents" ADD CONSTRAINT "listing_bid_documents_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "listing_bids"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_round_snapshots" ADD CONSTRAINT "listing_round_snapshots_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_documents" ADD CONSTRAINT "listing_documents_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_templates" ADD CONSTRAINT "listing_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_templates" ADD CONSTRAINT "supplier_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_items" ADD CONSTRAINT "listing_items_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_item_questions" ADD CONSTRAINT "listing_item_questions_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "listing_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_bid_answers" ADD CONSTRAINT "listing_bid_answers_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "listing_bids"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_bid_answers" ADD CONSTRAINT "listing_bid_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "listing_item_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_question_templates" ADD CONSTRAINT "listing_question_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_invitations" ADD CONSTRAINT "listing_invitations_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_invitations" ADD CONSTRAINT "listing_invitations_invitedCompanyId_fkey" FOREIGN KEY ("invitedCompanyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_bid_items" ADD CONSTRAINT "listing_bid_items_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "listing_bids"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_bid_items" ADD CONSTRAINT "listing_bid_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "listing_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_users" ADD CONSTRAINT "company_users_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_user_invitations" ADD CONSTRAINT "company_user_invitations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_companyUserId_fkey" FOREIGN KEY ("companyUserId") REFERENCES "company_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_flows" ADD CONSTRAINT "approval_flows_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_flow_steps" ADD CONSTRAINT "approval_flow_steps_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "approval_flows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_request_steps" ADD CONSTRAINT "approval_request_steps_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "approval_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_bank_accounts" ADD CONSTRAINT "company_bank_accounts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_addresses" ADD CONSTRAINT "company_addresses_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Global sequenceler (elle korunur).
CREATE SEQUENCE IF NOT EXISTS "listing_number_seq" START 1;
CREATE SEQUENCE IF NOT EXISTS "order_number_seq" START 1;
