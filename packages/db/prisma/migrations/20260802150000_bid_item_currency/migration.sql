-- Kalem bazlı para birimi (madde 9, 2026-08-02): teklif kalemi kendi para
-- birimini taşıyabilir; ana birime çevrim damgası submit anında yazılır.
-- Additive-only: 2 nullable kolon — kilit/rewrite yok.

-- AlterTable
ALTER TABLE "listing_bid_items" ADD COLUMN "currency" "Currency";
ALTER TABLE "listing_bid_items" ADD COLUMN "fxToBase" DECIMAL(18,6);
