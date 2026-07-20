-- INV-MT-5 Faz 6g — İKİ-TARAFLI (asimetrik) gerçek policy: listing_invitations.
--
-- Bir davet İKİ tarafı ilgilendirir ama SİMETRİK DEĞİL:
--   * DAVET EDİLEN firma (invitedCompanyId) → yalnız KENDİ davetini (kendi row'u).
--   * İlan SAHİBİ (listings.companyId) → o ilana ait TÜM davetleri (davetli listesi).
-- Üçüncü taraf (başka bir davetli/teklifçi) → GÖREMEZ. Kapalı-zarf (INV-BID-1) ile
-- tutarlı: teklifçiler birbirinin davet edildiğini göremez. bid-policy (Faz 6d) ile
-- aynı asimetrik desen (invited = self VEYA owner-via-listing).
--
-- Writer/reader audit (2026-07-21):
--   * Yazım: yalnız company-listings servisi, İLAN SAHİBİ bağlamında (davet ekle/
--     sil/yeniden-kur; owner=listings.companyId → WITH CHECK owner kolu geçer).
--     Bağlamsız cron/admin/public/auth YOK.
--   * Okuma: owner `where:{listingId}` (owner kolu → tüm davetliler, owner-gated
--     yönetim yolları) + davetli `where:{invitedCompanyId:me}` / `{listingId,
--     invitedCompanyId:me}` (invited kolu) + dashboard `{invitedCompanyId:me}`.
--     Non-party bağlam-içi erişim YOK (kapalı-zarf zaten teklifçi-görünürlüğünü keser).
-- Bağlam yoksa current NULL → iki kol da false → boş (fail-closed).
--
-- listings tablosu permissive (henüz RLS yok) → EXISTS alt-sorgusu serbest okur.

ALTER TABLE "listing_invitations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "listing_invitations_rls" ON "listing_invitations"
  USING (
    current_setting('app.current_company_id', true) = "invitedCompanyId"
    OR EXISTS (
      SELECT 1 FROM "listings" l
      WHERE l."id" = "listing_invitations"."listingId"
        AND l."companyId" = current_setting('app.current_company_id', true)
    )
  )
  WITH CHECK (
    current_setting('app.current_company_id', true) = "invitedCompanyId"
    OR EXISTS (
      SELECT 1 FROM "listings" l
      WHERE l."id" = "listing_invitations"."listingId"
        AND l."companyId" = current_setting('app.current_company_id', true)
    )
  );
