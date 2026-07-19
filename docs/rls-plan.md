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
  - **1b** ✅ Prisma `$extends` çekirdeği (`common/prisma/rls-extension.ts`, `RLS_ENABLED` flag OFF=passthrough; company+companyId→set_config'li tx, yoksa FIRLAT, admin/no-ctx/inTx→passthrough). GLOBAL CLIENT'A HENÜZ BAĞLI DEĞİL (wiring 1c). GERÇEK-PG mekanizma kanıtı: set_config+read aynı tx bind / tx-dışı is_local sızmaz. **KEŞİF: PrismaPromise LAZY** → op AWAIT anında çalışır → bağlam als.run callback'i İÇİNDE await edilmeli (1c wiring'de kritik: servisler handler request-ALS'inde await eder → doğru).
  - **1c-1** ✅ Global client wiring (`createInjectablePrisma` factory, prisma.module useFactory). RLS_ENABLED OFF→çıplak `new PrismaService()` (birebir); ON→`base.$extends(RLS)`+iliştirilmiş lifecycle, çağrı-yeri değişmez (Proxy yok). Full-suite 92/873 yeşil.
  - **1c-2** ✅ `runTenantTx` (common/prisma/tenant-tx.ts) + tx migrasyonu. 1c-2a: 28 interactive site (8 servis, mekanik). 1c-2b: 3 company-realm array-form → interactive. BIRAKILDI (passthrough-safe): admin-companies ×3 (admin realm), membership.scheduler (cron no-ALS), company-auth verifyEmail (pre-context). Raw SQL: tenant-tablo dokunanlar zaten migrate edilen tx İÇİNDE (GUC alır); standalone raw (health SELECT 1) tenant-tablo değil. Flag OFF→düz tx (birebir). Full-suite 93/877 yeşil.
  - **1d** ✅ (kısmi) Bypass client ALTYAPI: `PrismaBypassService` (RLS extension'sız, `DATABASE_URL_BYPASS` owner-rol; env yoksa ana URL → birebir). PrismaModule provide+export. Per-modül wiring (admin/auth/cron enjeksiyon) + kısıtlı rol `rothern_app` SQL → **Faz 2'ye taşındı** (bypass yalnız policy+kısıtlı-rolle test edilebilir). Full-suite 93/878 yeşil. **→ FAZ 1 PLUMBING TAMAM.**
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
