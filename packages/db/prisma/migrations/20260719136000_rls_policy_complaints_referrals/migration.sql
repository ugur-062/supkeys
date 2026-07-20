-- INV-MT-5 Faz 6b — İKİ-TARAFLI gerçek policy: complaints + referral invites.
--
-- company_complaints: complainant + against (iki taraf da görür) + admin bypass.
--   Domain servisi bağlam-içi okur (aktör bir taraf → policy geçer). Directory
--   cross-tenant read YOK (reviews'in aksine — reviews connection-card'da
--   cross-tenant okunduğu için HARİÇ bırakıldı).
-- company_referral_invites: inviter (davet eden) + acceptedCompanyId (kabul eden,
--   signup sonrası). Inviter bağlam-içi listeler; pre-context signup okuma ZATEN
--   bypass (Aşama A acceptReferralInvites). acceptedCompanyId NULL iken
--   `current IN (inviter, NULL)` → current=inviter için true.
-- Bağlam yoksa NULL IN → boş (fail-closed).

ALTER TABLE "company_complaints" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_complaints_rls" ON "company_complaints"
  USING (current_setting('app.current_company_id', true)
         IN ("complainantCompanyId", "againstCompanyId"))
  WITH CHECK (current_setting('app.current_company_id', true)
         IN ("complainantCompanyId", "againstCompanyId"));

ALTER TABLE "company_referral_invites" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_referral_invites_rls" ON "company_referral_invites"
  USING (current_setting('app.current_company_id', true)
         IN ("inviterCompanyId", "acceptedCompanyId"))
  WITH CHECK (current_setting('app.current_company_id', true)
         IN ("inviterCompanyId", "acceptedCompanyId"));
