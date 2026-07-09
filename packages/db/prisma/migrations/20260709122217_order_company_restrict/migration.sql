-- H1: Company→Order FK CASCADE → RESTRICT. Firma siparişleri varken hard-delete
-- engellenir (finansal kayıt CASCADE ile silinmesin). App soft-delete kullanır.
ALTER TABLE "company_orders" DROP CONSTRAINT "company_orders_sellerCompanyId_fkey";
ALTER TABLE "company_orders" ADD CONSTRAINT "company_orders_sellerCompanyId_fkey" FOREIGN KEY ("sellerCompanyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "company_orders" DROP CONSTRAINT "company_orders_buyerCompanyId_fkey";
ALTER TABLE "company_orders" ADD CONSTRAINT "company_orders_buyerCompanyId_fkey" FOREIGN KEY ("buyerCompanyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
