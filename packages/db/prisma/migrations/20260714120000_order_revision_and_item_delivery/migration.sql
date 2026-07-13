-- Faz 5 — sipariş revizyon müzakeresi + kalem-bazlı teslim tarihi.

-- Bölüm A: sipariş kalemine teslim tarihi + not (award'da bid item'dan snapshot).
ALTER TABLE "company_order_items"
  ADD COLUMN "deliveryDate" TIMESTAMP(3),
  ADD COLUMN "note" TEXT;

-- Bölüm B: revizyon kayıtları (ayrı tablo — sipariş state machine'i tek yönlü kalır).
CREATE TYPE "OrderRevisionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "order_revisions" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "proposedByCompanyId" TEXT NOT NULL,
  "proposedByUserId" TEXT,
  "status" "OrderRevisionStatus" NOT NULL DEFAULT 'PENDING',
  "amount" DECIMAL(18,2) NOT NULL,
  "currency" "Currency" NOT NULL DEFAULT 'TRY',
  "expectedDeliveryDate" TIMESTAMP(3),
  "note" TEXT,
  "rejectReason" TEXT,
  "decidedByUserId" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_revisions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "order_revisions_orderId_idx" ON "order_revisions"("orderId");
ALTER TABLE "order_revisions"
  ADD CONSTRAINT "order_revisions_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "company_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "order_revision_items" (
  "id" TEXT NOT NULL,
  "revisionId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "quantity" DECIMAL(18,3) NOT NULL,
  "unit" TEXT NOT NULL,
  "unitPrice" DECIMAL(18,2) NOT NULL,
  "deliveryDate" TIMESTAMP(3),
  "note" TEXT,
  CONSTRAINT "order_revision_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "order_revision_items_revisionId_idx" ON "order_revision_items"("revisionId");
ALTER TABLE "order_revision_items"
  ADD CONSTRAINT "order_revision_items_revisionId_fkey"
  FOREIGN KEY ("revisionId") REFERENCES "order_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
