-- Faz 3 madde 16 — Direkt ödeme: ihalede ödeme zamanı + sipariş ödeme kayıtları.

-- Enum tipleri
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CHEQUE');
CREATE TYPE "PaymentTiming" AS ENUM ('BEFORE_DELIVERY', 'AFTER_DELIVERY');
CREATE TYPE "OrderPaymentStatus" AS ENUM ('AWAITING_CONFIRMATION', 'CONFIRMED', 'REJECTED');

-- Tender: ödeme teslim öncesi mi sonrası mı (mevcut kayıtlar teslim sonrası varsayılır)
ALTER TABLE "tenders" ADD COLUMN "paymentTiming" "PaymentTiming" NOT NULL DEFAULT 'AFTER_DELIVERY';

-- Sipariş ödeme kayıtları (çoklu/kısmi: nakit/çek)
CREATE TABLE "order_payments" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "amount" DECIMAL(20,4) NOT NULL,
  "currency" "Currency" NOT NULL,
  "chequeNo" TEXT,
  "chequeBank" TEXT,
  "chequeDueDate" TIMESTAMP(3),
  "note" TEXT,
  "status" "OrderPaymentStatus" NOT NULL DEFAULT 'AWAITING_CONFIRMATION',
  "markedPaidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "markedPaidByUserId" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "confirmedBySupplierUserId" TEXT,
  "rejectedAt" TIMESTAMP(3),
  "rejectReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "order_payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "order_payments_orderId_idx" ON "order_payments"("orderId");
CREATE INDEX "order_payments_tenantId_idx" ON "order_payments"("tenantId");
CREATE INDEX "order_payments_supplierId_idx" ON "order_payments"("supplierId");

ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
