-- Teklif teslim SÜRESİ (2026-08-02): tarih yerine merdiven (stoktan/1-2 hafta/…).
-- Additive-only: yeni enum + 3 nullable kolon — kilit/rewrite yok, veri kaybı yok.
-- deliveryDate kolonları LEGACY olarak kalır (gösterim fallback'i).

-- CreateEnum
CREATE TYPE "BidDeliveryTime" AS ENUM ('STOKTAN', 'W1_2', 'W3_4', 'W5_8', 'M2_3', 'M3_PLUS');

-- AlterTable
ALTER TABLE "listing_bids" ADD COLUMN "deliveryTime" "BidDeliveryTime";

-- AlterTable
ALTER TABLE "listing_bid_items" ADD COLUMN "deliveryTime" "BidDeliveryTime";

-- AlterTable
ALTER TABLE "company_order_items" ADD COLUMN "deliveryTime" "BidDeliveryTime";
