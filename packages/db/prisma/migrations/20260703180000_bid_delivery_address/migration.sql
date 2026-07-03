-- SATIS mantık düzeltmesi: alıcının teslimat adresi teklifte tutulur,
-- award anında siparişe snapshot'lanır (ALIM'da ilan adresi snapshot'lanır).
ALTER TABLE "listing_bids" ADD COLUMN "deliveryAddressId" TEXT;
ALTER TABLE "listing_bids" ADD CONSTRAINT "listing_bids_deliveryAddressId_fkey"
  FOREIGN KEY ("deliveryAddressId") REFERENCES "company_addresses"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "company_orders" ADD COLUMN "deliveryAddress" JSONB;
