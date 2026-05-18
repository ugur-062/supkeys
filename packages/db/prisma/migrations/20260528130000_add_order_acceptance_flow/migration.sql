-- 4-aşamalı sipariş akışı: PENDING → ACCEPTED → IN_DELIVERY → COMPLETED
-- Tedarikçi REJECTED + alıcı CANCELLED yan dalları.

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'REJECTED';

-- AlterTable: tedarikçi onay/red + banka/fatura alanları
ALTER TABLE "orders"
  ADD COLUMN "acceptedAt"        TIMESTAMP(3),
  ADD COLUMN "acceptedNote"      TEXT,
  ADD COLUMN "bankAccountHolder" TEXT,
  ADD COLUMN "bankIban"          TEXT,
  ADD COLUMN "invoiceDate"       TIMESTAMP(3),
  ADD COLUMN "rejectedAt"        TIMESTAMP(3),
  ADD COLUMN "rejectReason"      TEXT;
