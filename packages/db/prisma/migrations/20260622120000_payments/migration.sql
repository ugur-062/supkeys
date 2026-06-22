-- Faz 7 — Ödeme kaydı.
CREATE TYPE "PaymentPurpose" AS ENUM ('PREMIUM_SUPPLIER', 'ORDER_ESCROW');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELLED');

CREATE TABLE "payments" (
  "id" TEXT NOT NULL,
  "purpose" "PaymentPurpose" NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "supplierId" TEXT,
  "tenantId" TEXT,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'TRY',
  "provider" TEXT NOT NULL,
  "providerRef" TEXT,
  "periodEnd" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "payments_supplierId_idx" ON "payments"("supplierId");
CREATE INDEX "payments_tenantId_idx" ON "payments"("tenantId");
