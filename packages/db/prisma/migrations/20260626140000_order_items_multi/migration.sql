-- Kalem-bazlı kazandırma: bir ilandan çoklu sipariş + sipariş kalemleri
DROP INDEX IF EXISTS "company_orders_listingId_key";
CREATE INDEX "company_orders_listingId_idx" ON "company_orders"("listingId");

CREATE TABLE "company_order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    CONSTRAINT "company_order_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "company_order_items_orderId_idx" ON "company_order_items"("orderId");
ALTER TABLE "company_order_items" ADD CONSTRAINT "company_order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "company_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
