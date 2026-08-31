-- Denetim 2026-08-28 Parça 12 #6 — RLS backstop'ta eksik kalan iki tablo.
--
-- GÜVENLİK NOTU (docs/migration-safety.md): TAMAMEN EKLEMELİ. Yalnız RLS
-- etkinleştirme + policy tanımı; kolon/tablo/veri dokunulmuyor. Prod'da
-- `RLS_ENABLED` KAPALI ve ana client hâlâ owner rolde bağlanıyor, dolayısıyla
-- BUGÜN DAVRANIŞ DEĞİŞMEZ (owner rol RLS'i baypas eder). Geri alma =
-- iki DROP POLICY + iki DISABLE.
--
-- Neden eksiktiler:
--   · `order_revision_items` — kardeşi `order_revisions` ve analogu
--     `company_order_items` 2 kat EXISTS ile korunuyor, bu tablo hiç
--     alınmamıştı. İçeriği sipariş revizyonu KALEM BİRİM FİYATLARI, yani
--     doğrudan pazarlık pozisyonu.
--   · `company_kyc_revisions` — plan mühürlendikten SONRA eklenmiş
--     (20260722090000), gerekçesiz kapsam dışı kalmıştı. İçeriği KYC
--     belgelerinin R2 nesne ANAHTARLARI: vergi levhası, imza sirküleri ve
--     kimlik ön/arka taraması.
--
-- Desen kardeş policy'lerle birebir: `order_revision_items` iki kat EXISTS
-- (item → revision → order → taraflar), `company_kyc_revisions` doğrudan
-- companyId eşleşmesi.

ALTER TABLE "order_revision_items" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_revision_items_rls" ON "order_revision_items"
  USING (EXISTS (
    SELECT 1
    FROM "order_revisions" r
    JOIN "company_orders" o ON o."id" = r."orderId"
    WHERE r."id" = "order_revision_items"."revisionId"
      AND current_setting('app.current_company_id', true)
          IN (o."buyerCompanyId", o."sellerCompanyId")
  ));

ALTER TABLE "company_kyc_revisions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_kyc_revisions_rls" ON "company_kyc_revisions"
  USING (current_setting('app.current_company_id', true) = "companyId");
