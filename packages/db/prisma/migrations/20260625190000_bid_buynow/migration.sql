-- Hemen-Al teklif bayrağı (yine sahip onaylar).
ALTER TABLE "listing_bids" ADD COLUMN "isBuyNow" BOOLEAN NOT NULL DEFAULT false;
