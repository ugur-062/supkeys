# RLS Backstop (INV-MT-5) — Uygulama Planı

> RLS = **backstop**. Birincil tenant kapısı servis katmanı (INV-MT-1..4) KALIR.
> RLS satır-seviyesi → kolon-maske YAPAMAZ → kapalı-zarf (INV-BID-1) serviste kalır.
> Detaylı zemin: `docs/invariants.md` INV-MT-5.

## Tablo sınıflandırması
- **13 DOĞRUDAN `companyId`:** CompanyUser, CompanyUserInvitation, Notification, CompanyAdminNote, CompanyMembershipEvent, CompanyBankAccount, CompanyAddress, Listing, ListingTemplate, SupplierTemplate, ListingQuestionTemplate, ApprovalFlow, ApprovalRequest. (+ Company kök: `id = current_company()`.)
- **İki-taraflı** (`current_company() IN (a,b)`): MessageThread, Message, CompanyOrder, CompanyReview, CompanyConnection, CompanyBlock, CompanyReferralInvite, CompanyComplaint, ListingBid, ListingInvitation.
- **Transitif (14, EXISTS parent):** order item/doc/payment/revision(+item), listing item/question/doc/snapshot, bid item/doc/answer, approval flow/request step.
- **Global (bypass):** PlatformAdmin, Category, ExchangeRate, EmailLog, EmailEvent, AuditLog.
- **User-scoped:** PasswordResetToken, EmailVerificationCode, Notification (companyId'yi kullan).

## Kısıt (plumbing'in kalbi)
Runtime = Supabase **transaction pooler 6543** (`pgbouncer, connection_limit=1`), rol = `postgres` (owner → RLS bypass). Bağlantı her tx sonunda havuza döner → `SET LOCAL` yalnız kendi tx'inde geçerli. Kod çoğunlukla **standalone** sorgu → GUC ile sorgu AYNI tx'te olmalı.

## Fazlama
- **Faz 0** ✅ plan (bu doküman).
- **Faz 1 — Plumbing (policy YOK, davranış değişmez):**
  - **1a** ✅ Tenant ALS + interceptor + `getCurrentCompanyId()` — sorgu davranışı SIFIR değişir.
  - **1b** Prisma `$extends` query hook — `RLS_ENABLED` flag ARKASINDA (default OFF = passthrough); bağlam varsa op'u `$transaction([set_config(...,true), op])` ile sarar, bağlam yoksa tenant-realm'de FIRLATIR.
  - **1c** `runTenantTx(companyId, fn)` helper — 29 interactive + 8 array `$transaction` + ~13 raw SQL sitesini taşı; tx ilk ifadesi `set_config`; ALS `inTx` bayrağı extension çift-sarmayı atlatır.
  - **1d** Kısıtlı rol `rothern_app` (NOSUPERUSER NOBYPASSRLS, DML-only) + admin/auth/cron için ayrı **bypass client**.
- **Faz 2** — Permissive no-op: 13 doğrudan tabloya `ENABLE RLS` + `USING(true)` (rol/grant eksiği burada yakalanır).
- **Faz 3** — İlk gerçek tablo (en düşük blast-radius: CompanyBankAccount/CompanyAddress) + izolasyon testi.
- **Faz 4** — Kalan 12 doğrudan tablo (yaprak→Listing→Approval→CompanyUser en son; CompanyUser jwt-validate pre-context → bypass client şart).
- **Faz 5** — Transitif (EXISTS parent, ebeveyn enforce sonrası).
- **Faz 6** — İki-taraflı (`IN (a,b)`, iki taraf da izolasyon testi).
- **Faz 7** — Kapalı-zarf (yalnız satır-görünürlük), EN SON.
- Her tabloda **USING (okuma) önce, WITH CHECK (yazma) sonra.**
- **Prod EN SON, ayrı adım:** rol provision + `DATABASE_URL` rol-geçişi + policy enable.

## Test stratejisi
- Lokal test rolü `rothern` şemayı OWN eder → `FORCE ROW LEVEL SECURITY` + kısıtlı non-owner rolle koşan **ikinci PrismaClient** gerekir; `connection_limit=1` tek-session pooler'ı taklit etmez.
- İzolasyon: A yazar → B bağlamında boş, A görür. "policy yokken görür/varken görmez" kanıtı (servis-filtresiz raw sorgu).
- **Full-suite yeşil kalması:** mevcut integration suite owner/bypass client'ta koşmaya devam (RLS etkisiz) + ayrı `rls-isolation.spec` kısıtlı rolle izolasyonu kanıtlar.

## Geri alma (prod)
1. **Anında (DDL'siz):** `DATABASE_URL`'i owner rolüne çevir → RLS bypass.
2. `RLS_ENABLED=false` → extension no-op.
3. Tablo bazında `ALTER TABLE x DISABLE ROW LEVEL SECURITY`.

## Risk (özet)
- 🔴 **Bağlam geçmezse sessiz BOŞ** → extension bağlamsız tenant-sorguda FIRLATIR + policy `current_setting IS NOT NULL AND ...` + canary test + prod boş-yanıt alarmı.
- 🟠 Extension nested-tx/perf → `inTx` bayrağı + latency ölç.
- 🟠 Rol grant eksik → Faz 2 (no-op) yakalar.
- 🟠 Admin/login bypass kaçağı → ayrı bypass client.
