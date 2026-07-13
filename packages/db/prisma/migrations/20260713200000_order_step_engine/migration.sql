-- Faz 3 — adım motoru: LC adım damgaları + vade hatırlatma idempotency +
-- akreditif belge tipi. Veri taşıma yok (yalnız DDL).

ALTER TYPE "CompanyDocType" ADD VALUE 'LC';

ALTER TABLE "company_orders"
  ADD COLUMN "lcOpenedAt" TIMESTAMP(3),
  ADD COLUMN "lcAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "lcPaidAt" TIMESTAMP(3),
  ADD COLUMN "paymentDueReminderSentAt" TIMESTAMP(3);
