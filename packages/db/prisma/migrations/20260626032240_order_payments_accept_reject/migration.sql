-- CreateEnum
CREATE TYPE "CompanyOrderPaymentTiming" AS ENUM ('BEFORE_DELIVERY', 'AFTER_DELIVERY');

-- CreateEnum
CREATE TYPE "CompanyOrderPaymentStatus" AS ENUM ('AWAITING_CONFIRMATION', 'CONFIRMED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CompanyOrderStatus" ADD VALUE 'PENDING';
ALTER TYPE "CompanyOrderStatus" ADD VALUE 'ACCEPTED';
ALTER TYPE "CompanyOrderStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "company_orders" ADD COLUMN     "paymentTiming" "CompanyOrderPaymentTiming" NOT NULL DEFAULT 'AFTER_DELIVERY',
ADD COLUMN     "rejectedReason" TEXT,
ALTER COLUMN "status" SET DEFAULT 'PENDING';

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

    CONSTRAINT "company_order_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "company_order_payments_orderId_idx" ON "company_order_payments"("orderId");

-- AddForeignKey
ALTER TABLE "company_order_payments" ADD CONSTRAINT "company_order_payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "company_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

