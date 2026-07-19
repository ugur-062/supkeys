-- INV-MT-5 Faz 2b — ENABLE RLS + PERMISSIVE no-op policy (13 doğrudan tablo + kök).
--
-- Davranış-NÖTR: USING (true) → RLS aktif ama HER satırı görünür kılar. Amaç:
--  (a) RLS mekanizmasını aç (rol/grant eksiğini KISITLI rolle koşan test yakalar);
--  (b) gerçek policy'yi (Faz 2d) izole bir adımda değiştir.
--
-- FORCE YOK bilinçli: owner (postgres) RLS'i bypass eder → migration/seed/bypass-
-- client + owner-yollu mevcut testler ETKİLENMEZ. Yalnız non-owner `rothern_app`
-- (runtime + izolasyon testleri) RLS'e tabidir. Bu, full-suite'i yapısal yeşil tutar.
--
-- USING (true) tek başına FOR ALL + WITH CHECK=USING → okuma VE yazma no-op.

-- 13 doğrudan companyId tablosu + companies kökü.
ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "companies_rls" ON "companies" USING (true);

ALTER TABLE "company_users" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_users_rls" ON "company_users" USING (true);

ALTER TABLE "company_user_invitations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_user_invitations_rls" ON "company_user_invitations" USING (true);

ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_rls" ON "notifications" USING (true);

ALTER TABLE "company_admin_notes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_admin_notes_rls" ON "company_admin_notes" USING (true);

ALTER TABLE "company_membership_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_membership_events_rls" ON "company_membership_events" USING (true);

ALTER TABLE "company_bank_accounts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_bank_accounts_rls" ON "company_bank_accounts" USING (true);

ALTER TABLE "company_addresses" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_addresses_rls" ON "company_addresses" USING (true);

ALTER TABLE "listings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "listings_rls" ON "listings" USING (true);

ALTER TABLE "listing_templates" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "listing_templates_rls" ON "listing_templates" USING (true);

ALTER TABLE "supplier_templates" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "supplier_templates_rls" ON "supplier_templates" USING (true);

ALTER TABLE "listing_question_templates" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "listing_question_templates_rls" ON "listing_question_templates" USING (true);

ALTER TABLE "approval_flows" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "approval_flows_rls" ON "approval_flows" USING (true);

ALTER TABLE "approval_requests" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "approval_requests_rls" ON "approval_requests" USING (true);
