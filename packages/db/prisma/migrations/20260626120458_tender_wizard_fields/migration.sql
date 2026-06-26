-- CreateEnum
CREATE TYPE "ListingDeliveryTerm" AS ENUM ('DOMESTIC_DELIVERED', 'DOMESTIC_PICKUP', 'EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'FAS', 'FOB', 'CFR', 'CIF');

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

-- AlterTable
ALTER TABLE "listing_items" ADD COLUMN     "materialCode" TEXT,
ADD COLUMN     "requiredByDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "autoExtendByMinutes" INTEGER,
ADD COLUMN     "autoExtendOnLateBid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoExtendThresholdMin" INTEGER,
ADD COLUMN     "bidVisibility" "ListingBidVisibility" NOT NULL DEFAULT 'OWN_ONLY',
ADD COLUMN     "bidsOpenAt" TIMESTAMP(3),
ADD COLUMN     "decimalPlaces" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "deliveryTerm" "ListingDeliveryTerm",
ADD COLUMN     "isLogistics" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isSealedBid" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "logistics" JSONB,
ADD COLUMN     "paymentDays" INTEGER,
ADD COLUMN     "paymentTerm" "ListingPaymentTerm" NOT NULL DEFAULT 'CASH',
ADD COLUMN     "paymentTiming" "ListingPaymentTiming" NOT NULL DEFAULT 'AFTER_DELIVERY',
ADD COLUMN     "priceDecrementBasis" "ListingDecrementBasis",
ADD COLUMN     "priceDecrementType" "ListingDecrementType",
ADD COLUMN     "priceDecrementValue" DECIMAL(18,4),
ADD COLUMN     "reminderMinutesBefore" INTEGER,
ADD COLUMN     "sendClosingReminder" BOOLEAN NOT NULL DEFAULT false;

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

-- CreateIndex
CREATE INDEX "listing_item_questions_itemId_idx" ON "listing_item_questions"("itemId");

-- AddForeignKey
ALTER TABLE "listing_item_questions" ADD CONSTRAINT "listing_item_questions_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "listing_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

