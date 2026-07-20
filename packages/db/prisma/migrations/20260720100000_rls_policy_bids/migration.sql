-- INV-MT-5 Faz 6d — KAPALI-ZARF gerçek policy: listing_bids.
--
-- Bir teklifi İKİ taraf görür ama SİMETRİK DEĞİL:
--   * teklif SAHİBİ (bidderCompanyId) → yalnız KENDİ teklifini
--   * ilan SAHİBİ (listing.companyId) → o ilana gelen TÜM teklifleri
-- Üçüncü taraf (başka bir teklif veren) → GÖREMEZ. Bu, satır-düzeyinde kapalı-zarf:
-- teklif verenler birbirinin teklifini ASLA göremez (INV-BID-1). NOT: kolon-maskeleme
-- (kapalı-zarf yanıt alanları) HÂLÂ servis katmanında; RLS yalnız SATIR görünürlüğü.
--
-- Yazım yolları (hepsi bağlam-içi):
--   * placeBid → aktör=bidder, current=bidderCompanyId → WITH CHECK 1. koldan geçer.
--   * award/eleme/sonraki-tur → aktör=ilan sahibi, current=listing.companyId →
--     WITH CHECK EXISTS kolundan geçer.
-- Bid'e dokunan bağlamsız cron YOK (listing.scheduler yalnız listing+notification).
-- admin bypass. Bağlam yoksa current NULL → iki kol da false → boş (fail-closed).
--
-- listings tablosu permissive (henüz RLS yok) → EXISTS alt-sorgusu serbest okur.

ALTER TABLE "listing_bids" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "listing_bids_rls" ON "listing_bids"
  USING (
    current_setting('app.current_company_id', true) = "bidderCompanyId"
    OR EXISTS (
      SELECT 1 FROM "listings" l
      WHERE l."id" = "listing_bids"."listingId"
        AND l."companyId" = current_setting('app.current_company_id', true)
    )
  )
  WITH CHECK (
    current_setting('app.current_company_id', true) = "bidderCompanyId"
    OR EXISTS (
      SELECT 1 FROM "listings" l
      WHERE l."id" = "listing_bids"."listingId"
        AND l."companyId" = current_setting('app.current_company_id', true)
    )
  );
