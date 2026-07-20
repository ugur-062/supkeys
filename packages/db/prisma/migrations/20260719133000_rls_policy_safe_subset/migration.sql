-- INV-MT-5 Faz 2d-2a — GERÇEK policy: GÜVENLİ alt-küme (7 tablo).
--
-- Bu 7 tablo cross-tenant OKUNMAZ ve pre-context/cron-via-main YAZILMAZ:
--   templates×3 (listing/supplier/question) + approval_flows/requests → yalnız
--     sahip firma bağlam-içinde yönetir (owner-service, IDOR-guard'lı; RLS
--     guard'dan ÖNCE zorlar — kendi kaydı görünür, başkasınınki 404).
--   company_admin_notes + company_membership_events → yalnız ADMIN (bypass
--     client, 2c) okur/yazar; company-realm hiç dokunmaz → policy güvenli.
--
-- listings HARİÇ (tedarikçi davetli/bağlı olarak cross-tenant OKUR → görünürlük
-- policy'si gerekir, Faz 6). companies/company_users/user_invitations/
-- notifications HARİÇ (pre-context/cron yazar → sistem-bypass bağlamı, 2d-2b).
--
-- Kolon "companyId" (tırnaklı). Bağlam yoksa NULL → boş (fail-closed).

DROP POLICY "listing_templates_rls" ON "listing_templates";
CREATE POLICY "listing_templates_rls" ON "listing_templates"
  USING ("companyId" = current_setting('app.current_company_id', true))
  WITH CHECK ("companyId" = current_setting('app.current_company_id', true));

DROP POLICY "supplier_templates_rls" ON "supplier_templates";
CREATE POLICY "supplier_templates_rls" ON "supplier_templates"
  USING ("companyId" = current_setting('app.current_company_id', true))
  WITH CHECK ("companyId" = current_setting('app.current_company_id', true));

DROP POLICY "listing_question_templates_rls" ON "listing_question_templates";
CREATE POLICY "listing_question_templates_rls" ON "listing_question_templates"
  USING ("companyId" = current_setting('app.current_company_id', true))
  WITH CHECK ("companyId" = current_setting('app.current_company_id', true));

DROP POLICY "approval_flows_rls" ON "approval_flows";
CREATE POLICY "approval_flows_rls" ON "approval_flows"
  USING ("companyId" = current_setting('app.current_company_id', true))
  WITH CHECK ("companyId" = current_setting('app.current_company_id', true));

DROP POLICY "approval_requests_rls" ON "approval_requests";
CREATE POLICY "approval_requests_rls" ON "approval_requests"
  USING ("companyId" = current_setting('app.current_company_id', true))
  WITH CHECK ("companyId" = current_setting('app.current_company_id', true));

DROP POLICY "company_admin_notes_rls" ON "company_admin_notes";
CREATE POLICY "company_admin_notes_rls" ON "company_admin_notes"
  USING ("companyId" = current_setting('app.current_company_id', true))
  WITH CHECK ("companyId" = current_setting('app.current_company_id', true));

DROP POLICY "company_membership_events_rls" ON "company_membership_events";
CREATE POLICY "company_membership_events_rls" ON "company_membership_events"
  USING ("companyId" = current_setting('app.current_company_id', true))
  WITH CHECK ("companyId" = current_setting('app.current_company_id', true));
