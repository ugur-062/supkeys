-- INV-MT-5 Faz 6f Step 2 — İKİ-TARAFLI gerçek policy: company_orders + 4 çocuk.
--
-- Bir sipariş İKİ firmayı ilgilendirir (alıcı + satıcı); her İKİ taraf da görür/
-- yönetir → `current IN (buyerCompanyId, sellerCompanyId)`. Çocuklar (kalem/ödeme/
-- belge/revizyon) ebeveyn siparişin görünürlüğünü MİRAS alır → EXISTS-parent;
-- koşul AÇIKÇA tekrarlanır (defense-in-depth: kill-switch parent'ı düşürse bile
-- çocuk kendi başına doğru — bid-child Faz 6e ile aynı desen).
--
-- Writer/reader audit (2026-07-20, Step 2 öncesi):
--   * Yazım: award (company-listings runTenantTx, owner=taraf → WITH CHECK geçer) +
--     order transitions (accept/ship/complete, bağlam-içi taraf) + admin-inspection
--     (PrismaBypassService, cross-tenant admin) + KÜRESEL vade-cron (Step 1 b2ebc131:
--     sendDuePaymentReminders bypass'a ayrıldı — bu policy'nin çalışması için ŞARTTI).
--   * Okuma: reviews (taraf-kapılı → NotFound), listings (OR buyer/seller scope),
--     dashboard/inbox (kendi), admin (bypass), realtime (sinyal). Non-party
--     bağlam-içi erişim YOK.
-- Bağlam yoksa current NULL → IN false / EXISTS boş → fail-closed.

ALTER TABLE "company_orders" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_orders_rls" ON "company_orders"
  USING (current_setting('app.current_company_id', true)
         IN ("buyerCompanyId", "sellerCompanyId"))
  WITH CHECK (current_setting('app.current_company_id', true)
         IN ("buyerCompanyId", "sellerCompanyId"));

-- Ortak çocuk kalıbı: ebeveyn sipariş current'a görünür mü?
--   EXISTS (order o WHERE o.id = child.orderId
--           AND current IN (o.buyerCompanyId, o.sellerCompanyId))

ALTER TABLE "company_order_items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_order_items_rls" ON "company_order_items"
  USING (EXISTS (
    SELECT 1 FROM "company_orders" o
    WHERE o."id" = "company_order_items"."orderId"
      AND current_setting('app.current_company_id', true)
          IN (o."buyerCompanyId", o."sellerCompanyId")
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "company_orders" o
    WHERE o."id" = "company_order_items"."orderId"
      AND current_setting('app.current_company_id', true)
          IN (o."buyerCompanyId", o."sellerCompanyId")
  ));

ALTER TABLE "company_order_payments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_order_payments_rls" ON "company_order_payments"
  USING (EXISTS (
    SELECT 1 FROM "company_orders" o
    WHERE o."id" = "company_order_payments"."orderId"
      AND current_setting('app.current_company_id', true)
          IN (o."buyerCompanyId", o."sellerCompanyId")
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "company_orders" o
    WHERE o."id" = "company_order_payments"."orderId"
      AND current_setting('app.current_company_id', true)
          IN (o."buyerCompanyId", o."sellerCompanyId")
  ));

ALTER TABLE "company_order_documents" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_order_documents_rls" ON "company_order_documents"
  USING (EXISTS (
    SELECT 1 FROM "company_orders" o
    WHERE o."id" = "company_order_documents"."orderId"
      AND current_setting('app.current_company_id', true)
          IN (o."buyerCompanyId", o."sellerCompanyId")
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "company_orders" o
    WHERE o."id" = "company_order_documents"."orderId"
      AND current_setting('app.current_company_id', true)
          IN (o."buyerCompanyId", o."sellerCompanyId")
  ));

ALTER TABLE "order_revisions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_revisions_rls" ON "order_revisions"
  USING (EXISTS (
    SELECT 1 FROM "company_orders" o
    WHERE o."id" = "order_revisions"."orderId"
      AND current_setting('app.current_company_id', true)
          IN (o."buyerCompanyId", o."sellerCompanyId")
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "company_orders" o
    WHERE o."id" = "order_revisions"."orderId"
      AND current_setting('app.current_company_id', true)
          IN (o."buyerCompanyId", o."sellerCompanyId")
  ));
