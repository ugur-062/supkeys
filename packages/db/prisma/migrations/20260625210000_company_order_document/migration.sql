-- Sipariş belgesi (teslim/dekont) — R2 metası.
CREATE TYPE "CompanyDocType" AS ENUM ('DELIVERY', 'PAYMENT');
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
CREATE INDEX "company_order_documents_orderId_idx" ON "company_order_documents"("orderId");
ALTER TABLE "company_order_documents" ADD CONSTRAINT "company_order_documents_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "company_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
