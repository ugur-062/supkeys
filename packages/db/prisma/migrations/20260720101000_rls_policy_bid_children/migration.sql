-- INV-MT-5 Faz 6e — KAPALI-ZARF çocuk tabloları: bid item/answer/document.
--
-- Teklif kalemleri/cevapları/belgeleri, ebeveyn teklifin görünürlüğünü MİRAS ALIR
-- (Faz 6d kapalı-zarf). Görünürlük = teklif SAHİBİ (b.bidderCompanyId) VEYA ilan
-- SAHİBİ (listings.companyId). Koşul, kısıtlı rol parent-RLS'ine güvenmek yerine
-- AÇIKÇA tekrarlanır (defense-in-depth: parent policy düşse/kill-switch'lense bile
-- çocuk kendi başına doğru kalır). Rakip teklif verenler birbirinin kalem/cevap/
-- belgesini ASLA göremez.
--
-- Yazım: placeBid çocukları bidder bağlamında yazar → parent bidder kolu geçer.
-- Bağlamsız cron YOK. admin bypass. Bağlam yoksa current NULL → EXISTS boş → gizli.

-- Ortak koşul kalıbı: ebeveyn teklif current'a görünür mü?
--   b.bidderCompanyId = current  (teklif sahibi)
--   OR listings.companyId = current  (ilan sahibi — tüm teklifleri)

ALTER TABLE "listing_bid_items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "listing_bid_items_rls" ON "listing_bid_items"
  USING (EXISTS (
    SELECT 1 FROM "listing_bids" b
    WHERE b."id" = "listing_bid_items"."bidId"
      AND (
        current_setting('app.current_company_id', true) = b."bidderCompanyId"
        OR EXISTS (
          SELECT 1 FROM "listings" l
          WHERE l."id" = b."listingId"
            AND l."companyId" = current_setting('app.current_company_id', true)
        )
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "listing_bids" b
    WHERE b."id" = "listing_bid_items"."bidId"
      AND (
        current_setting('app.current_company_id', true) = b."bidderCompanyId"
        OR EXISTS (
          SELECT 1 FROM "listings" l
          WHERE l."id" = b."listingId"
            AND l."companyId" = current_setting('app.current_company_id', true)
        )
      )
  ));

ALTER TABLE "listing_bid_answers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "listing_bid_answers_rls" ON "listing_bid_answers"
  USING (EXISTS (
    SELECT 1 FROM "listing_bids" b
    WHERE b."id" = "listing_bid_answers"."bidId"
      AND (
        current_setting('app.current_company_id', true) = b."bidderCompanyId"
        OR EXISTS (
          SELECT 1 FROM "listings" l
          WHERE l."id" = b."listingId"
            AND l."companyId" = current_setting('app.current_company_id', true)
        )
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "listing_bids" b
    WHERE b."id" = "listing_bid_answers"."bidId"
      AND (
        current_setting('app.current_company_id', true) = b."bidderCompanyId"
        OR EXISTS (
          SELECT 1 FROM "listings" l
          WHERE l."id" = b."listingId"
            AND l."companyId" = current_setting('app.current_company_id', true)
        )
      )
  ));

ALTER TABLE "listing_bid_documents" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "listing_bid_documents_rls" ON "listing_bid_documents"
  USING (EXISTS (
    SELECT 1 FROM "listing_bids" b
    WHERE b."id" = "listing_bid_documents"."bidId"
      AND (
        current_setting('app.current_company_id', true) = b."bidderCompanyId"
        OR EXISTS (
          SELECT 1 FROM "listings" l
          WHERE l."id" = b."listingId"
            AND l."companyId" = current_setting('app.current_company_id', true)
        )
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "listing_bids" b
    WHERE b."id" = "listing_bid_documents"."bidId"
      AND (
        current_setting('app.current_company_id', true) = b."bidderCompanyId"
        OR EXISTS (
          SELECT 1 FROM "listings" l
          WHERE l."id" = b."listingId"
            AND l."companyId" = current_setting('app.current_company_id', true)
        )
      )
  ));
