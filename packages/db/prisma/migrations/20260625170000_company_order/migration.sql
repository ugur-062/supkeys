-- Birleşik sistem — CompanyOrder (kazandırma sonrası, satıcı→alıcı) + numara sequence.
CREATE TYPE "CompanyOrderStatus" AS ENUM ('CREATED', 'IN_DELIVERY', 'DELIVERED', 'COMPLETED', 'CANCELLED');
CREATE SEQUENCE IF NOT EXISTS "order_number_seq" START 1;

CREATE TABLE "company_orders" (
    "id" TEXT NOT NULL,
    "number" TEXT,
    "listingId" TEXT,
    "sellerCompanyId" TEXT NOT NULL,
    "buyerCompanyId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "status" "CompanyOrderStatus" NOT NULL DEFAULT 'CREATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "company_orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "company_orders_number_key" ON "company_orders"("number");
CREATE UNIQUE INDEX "company_orders_listingId_key" ON "company_orders"("listingId");
CREATE INDEX "company_orders_sellerCompanyId_idx" ON "company_orders"("sellerCompanyId");
CREATE INDEX "company_orders_buyerCompanyId_idx" ON "company_orders"("buyerCompanyId");

ALTER TABLE "company_orders" ADD CONSTRAINT "company_orders_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "company_orders" ADD CONSTRAINT "company_orders_sellerCompanyId_fkey" FOREIGN KEY ("sellerCompanyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_orders" ADD CONSTRAINT "company_orders_buyerCompanyId_fkey" FOREIGN KEY ("buyerCompanyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
