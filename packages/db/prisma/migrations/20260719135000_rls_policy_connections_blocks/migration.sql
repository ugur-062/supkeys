-- INV-MT-5 Faz 6a — İKİ-TARAFLI gerçek policy: connections + blocks.
--
-- Bir bağlantı/blok İKİ firmayı ilgilendirir; her İKİ taraf da görür/yönetir →
-- `current IN (taraf_a, taraf_b)`. Tek-tenant `=` YANLIŞ olurdu (karşı taraf
-- kendi kaydını göremezdi).
--
-- Yazım yolları: invite/accept/reject/disconnect (bağlam-içi, aktör bir taraf →
-- WITH CHECK geçer) + referral signup (pre-context) ZATEN bypass client'ta
-- (Aşama A: acceptReferralInvites this.bypass). admin bypass. Bağlam yoksa
-- current NULL → IN false → boş (fail-closed).

ALTER TABLE "company_connections" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_connections_rls" ON "company_connections"
  USING (current_setting('app.current_company_id', true)
         IN ("inviterCompanyId", "inviteeCompanyId"))
  WITH CHECK (current_setting('app.current_company_id', true)
         IN ("inviterCompanyId", "inviteeCompanyId"));

ALTER TABLE "company_blocks" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_blocks_rls" ON "company_blocks"
  USING (current_setting('app.current_company_id', true)
         IN ("blockerCompanyId", "blockedCompanyId"))
  WITH CHECK (current_setting('app.current_company_id', true)
         IN ("blockerCompanyId", "blockedCompanyId"));
