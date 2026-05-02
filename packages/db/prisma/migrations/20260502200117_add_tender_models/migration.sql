-- CreateEnum
CREATE TYPE "TenderType" AS ENUM ('RFQ', 'ENGLISH_AUCTION');

-- CreateEnum
CREATE TYPE "TenderStatus" AS ENUM ('DRAFT', 'OPEN_FOR_BIDS', 'IN_AWARD', 'AWARDED', 'CANCELLED', 'CLOSED_NO_AWARD');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('TRY', 'USD', 'EUR');

-- CreateEnum
CREATE TYPE "DeliveryTerm" AS ENUM ('EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'FAS', 'FOB', 'CFR', 'CIF');

-- CreateEnum
CREATE TYPE "PaymentTerm" AS ENUM ('CASH', 'DEFERRED');

-- CreateEnum
CREATE TYPE "TenderInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BidStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'WITHDRAWN', 'REJECTED', 'AWARDED_PARTIAL', 'AWARDED_FULL', 'LOST');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'ACCEPTED', 'IN_PROGRESS', 'DELIVERED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "tenders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "tenderNumber" TEXT NOT NULL,
    "type" "TenderType" NOT NULL DEFAULT 'RFQ',
    "status" "TenderStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "termsAndConditions" TEXT,
    "internalNotes" TEXT,
    "isSealedBid" BOOLEAN NOT NULL DEFAULT true,
    "requireAllItems" BOOLEAN NOT NULL DEFAULT false,
    "requireBidDocument" BOOLEAN NOT NULL DEFAULT false,
    "primaryCurrency" "Currency" NOT NULL DEFAULT 'TRY',
    "allowedCurrencies" "Currency"[] DEFAULT ARRAY['TRY']::"Currency"[],
    "decimalPlaces" INTEGER NOT NULL DEFAULT 2,
    "deliveryTerm" "DeliveryTerm",
    "deliveryAddress" TEXT,
    "paymentTerm" "PaymentTerm" NOT NULL DEFAULT 'CASH',
    "paymentDays" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "bidsOpenAt" TIMESTAMP(3),
    "bidsCloseAt" TIMESTAMP(3) NOT NULL,
    "awardedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_items" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(15,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "materialCode" TEXT,
    "requiredByDate" TIMESTAMP(3),
    "targetUnitPrice" DECIMAL(15,4),
    "customQuestion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tender_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_invitations" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" "TenderInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "emailSentAt" TIMESTAMP(3),
    "emailOpenedAt" TIMESTAMP(3),

    CONSTRAINT "tender_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bids" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "status" "BidStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" "Currency" NOT NULL,
    "totalAmount" DECIMAL(20,4) NOT NULL,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "submittedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bid_items" (
    "id" TEXT NOT NULL,
    "bidId" TEXT NOT NULL,
    "tenderItemId" TEXT NOT NULL,
    "unitPrice" DECIMAL(15,4),
    "totalPrice" DECIMAL(20,4),
    "currency" "Currency" NOT NULL,
    "customAnswer" TEXT,
    "isWinner" BOOLEAN NOT NULL DEFAULT false,
    "awardedQuantity" DECIMAL(15,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bid_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bid_attachments" (
    "id" TEXT NOT NULL,
    "bidId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bid_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_attachments" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tender_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "bidId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "currency" "Currency" NOT NULL,
    "totalAmount" DECIMAL(20,4) NOT NULL,
    "expectedDeliveryAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenders_tenderNumber_key" ON "tenders"("tenderNumber");

-- CreateIndex
CREATE INDEX "tenders_tenantId_status_idx" ON "tenders"("tenantId", "status");

-- CreateIndex
CREATE INDEX "tenders_status_bidsCloseAt_idx" ON "tenders"("status", "bidsCloseAt");

-- CreateIndex
CREATE INDEX "tender_items_tenderId_orderIndex_idx" ON "tender_items"("tenderId", "orderIndex");

-- CreateIndex
CREATE INDEX "tender_invitations_supplierId_status_idx" ON "tender_invitations"("supplierId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tender_invitations_tenderId_supplierId_key" ON "tender_invitations"("tenderId", "supplierId");

-- CreateIndex
CREATE INDEX "bids_tenderId_status_idx" ON "bids"("tenderId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "bids_tenderId_supplierId_key" ON "bids"("tenderId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "bid_items_bidId_tenderItemId_key" ON "bid_items"("bidId", "tenderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_orderNumber_key" ON "orders"("orderNumber");

-- CreateIndex
CREATE INDEX "orders_tenantId_status_idx" ON "orders"("tenantId", "status");

-- CreateIndex
CREATE INDEX "orders_supplierId_status_idx" ON "orders"("supplierId", "status");

-- AddForeignKey
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_items" ADD CONSTRAINT "tender_items_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_invitations" ADD CONSTRAINT "tender_invitations_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_invitations" ADD CONSTRAINT "tender_invitations_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "supplier_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bid_items" ADD CONSTRAINT "bid_items_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "bids"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bid_items" ADD CONSTRAINT "bid_items_tenderItemId_fkey" FOREIGN KEY ("tenderItemId") REFERENCES "tender_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bid_attachments" ADD CONSTRAINT "bid_attachments_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "bids"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_attachments" ADD CONSTRAINT "tender_attachments_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "tenders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "bids"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

