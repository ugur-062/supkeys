-- Sipariş tutarının para birimi = kazanan teklifin birimi (çoklu-birim RFQ'da
-- ilanın ana biriminden farklı olabilir). Award anında yazılır; legacy → TRY.
ALTER TABLE "company_orders" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'TRY';

-- Backfill: mevcut siparişlerde birim, siparişin bağlı olduğu ilandaki
-- teklifçinin (ALIM'da satıcı, SATIS'ta alıcı) teklif birimidir.
UPDATE "company_orders" o
SET "currency" = b."currency"
FROM "listings" l, "listing_bids" b
WHERE o."listingId" IS NOT NULL
  AND l."id" = o."listingId"
  AND b."listingId" = o."listingId"
  AND b."bidderCompanyId" = CASE
    WHEN l."type" = 'ALIM' THEN o."sellerCompanyId"
    ELSE o."buyerCompanyId"
  END;
