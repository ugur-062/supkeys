-- INV-MT-5 Faz 2d (1) — GERÇEK izolasyon policy'si: ilk 2 yaprak tablo.
--
-- company_addresses + company_bank_accounts: YALNIZ kimliği doğrulanmış firma
-- kullanıcısı tarafından bağlam-içinde yönetilir (cron/pre-context yazmaz) →
-- gerçek policy'ye en güvenli, en düşük blast-radius adaylar (Faz 3 planı).
--
-- Kural: satır ANCAK aktif tenant'a aitse görünür/yazılabilir. Bağlam yoksa
-- current_setting NULL → "companyId" = NULL → hiçbir satır (fail-closed BOŞ,
-- tüm-satır DEĞİL). Kolon adı Prisma default camelCase → "companyId" (tırnaklı).
-- WITH CHECK = USING → yazma da aynı tenant'a kısıtlı.

DROP POLICY "company_addresses_rls" ON "company_addresses";
CREATE POLICY "company_addresses_rls" ON "company_addresses"
  USING ("companyId" = current_setting('app.current_company_id', true))
  WITH CHECK ("companyId" = current_setting('app.current_company_id', true));

DROP POLICY "company_bank_accounts_rls" ON "company_bank_accounts";
CREATE POLICY "company_bank_accounts_rls" ON "company_bank_accounts"
  USING ("companyId" = current_setting('app.current_company_id', true))
  WITH CHECK ("companyId" = current_setting('app.current_company_id', true));
