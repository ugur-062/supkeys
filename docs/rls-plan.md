# RLS Backstop (INV-MT-5) — Uygulama Planı

> RLS = **backstop**. Birincil tenant kapısı servis katmanı (INV-MT-1..4) KALIR.
> RLS satır-seviyesi → kolon-maske YAPAMAZ → kapalı-zarf (INV-BID-1) serviste kalır.
> Detaylı zemin: `docs/invariants.md` INV-MT-5.

## 🟢 GÜNCEL DURUM (2026-07-21) — sonraki oturum buradan devam et

**27 tablo RLS-korumalı, LOKAL-KANITLI. Prod'da KAPALI** (`RLS_ENABLED` set edilmemiş →
extension passthrough; prod DATABASE_URL hâlâ owner rolü → policy'ler de bypass edilir).
Aktivasyon YAPILMADI — ayrı tur bekliyor.

**Bitti (Faz 1 plumbing + Faz 2-6f):** 9 direct + 2 transitif (approval steps) + 4
iki-taraflı (connections/blocks/complaints/referrals) + 2 mesaj + bids (kapalı-zarf) + 3
bid-child + **orders (company_orders iki-taraflı + 4 çocuk EXISTS-parent, Step 1 cron-bypass
+ Step 2 policy)**. Her biri `rls-isolation.spec`'te izolasyon-kanıtlı; full-suite
**98 suite / 901 test yeşil, 0 deadlock** (RLS lokalde AKTİF koşan tek yer bu spec).

**Orders PERF kanıtı (Step 2):** EXPLAIN ANALYZE (100 tenant/1000 order/4000 item) →
EXISTS-parent **hashed SubPlan** (görünür order-id kümesi BİR KEZ, satır-başı join DEĞİL)
+ parent BitmapOr buyer/seller index'lerinden. Exec 1.9ms. Sağlıklı — iki-taraf `IN`
mevcut index'lere biniyor.

**✅ TABLO ROLLOUT MÜHÜRLENDİ — 27 gerçek-policy'li tablo (2026-07-21).** (Sayım: 9 direct +
2 transitif + 6 iki-taraflı[connections/blocks/complaints/referrals/message_threads/
listing_invitations] + 1 message + 4 kapalı-zarf[bid+3child] + 5 orders[+4child]. Not:
oturum-içi ara sayımlar "24" dedi = order child'ları eksik saymış; migration CREATE POLICY
toplamı = 27 kesin.) Kalan tek iş = PROD AKTİVASYON.

- ✅ listing_invitations (Faz 6g, 3829f708) — asimetrik iki-taraflı.
- **listings + children → PERMISSIVE KALIR (KARAR, 2026-07-21, kullanıcı onayı).** Görünürlük
  BASİT row-rule DEĞİL: `listing-visibility.ts` (INV-VIS-1) 4-yollu servis fonksiyonu =
  owner OR PUBLIC OR invited OR (CONNECTIONS && owner'a-aktif-bağlı). listings hot path'te
  CROSS-TENANT okunur (discover feed status=OPEN scan, search, sellerTenders, public-profile,
  sitemap). Gerekçe: görünürlük ZATEN tek-kaynak+test-edilmiş servis kapısında; RLS=backstop,
  birincil değil. Full 4-yollu policy connection-EXISTS ile hot-feed perf riski + büyük
  cross-tenant audit yüzeyi + all-or-nothing (kısmi policy CONNECTIONS'ı gizler→discovery
  kırar). listings 2b'den beri RLS-enabled+permissive `USING(true)` → değişiklik yok.
- **4 directory tablo** (companies/company_users/notifications/company_user_invitations) —
  bilinçli permissive KALIR (servis-scope birincil gate).

**→ PROD AKTİVASYON — EN SON, ayrı adım, kullanıcı onayı:** adımlar
`docs/launch-checklist.md` § "RLS aktivasyon"da sıralı (Supabase rol provision → pooler
custom-rol auth riski doğrula → policy migrate → DATABASE_URL_BYPASS ayır → ana URL→kısıtlı
rol + RLS_ENABLED=true → duman/izolasyon → 3-yollu kill-switch).

⚠️ **MIGRATION-HISTORY TUZAĞI (2026-07-21):** `packages/db/.env` symlink→kök `.env`
(remote Supabase). Elle `prisma migrate deploy` çalıştırırken inline `DATABASE_URL`
her zaman kazanmıyor → migration yanlış hedefe/şemaya gidebilir ("No pending" yalanı).
Test DB'ye migration'ı **jest globalSetup uygular** (TEST_DB_URL, schema=rothern_test);
yeni RLS migration'ını doğrulamak için elle apply yerine `npx jest rls-isolation -t <ad>`
koş (globalSetup deploy eder, çıktıda "Applying migration…" görürsün).

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
- **Faz 2** — RLS aktivasyonu (SIRA: kısıtlı rol ÖNCE, her aşama onunla koşulur):
  - **2a** ✅ Kısıtlı rol `rothern_app` + grants (migration 20260719130000, `current_schema()` DO-blok, parola env-özel). ⚠️ prod-ops: Supabase CREATE ROLE ayrı doğrula.
  - **2b** ✅ ENABLE RLS + permissive `USING(true)` 13 tablo+kök (20260719131000). FORCE YOK → owner bypass, full-suite yeşil. Kısıtlı rolle grant-gap kanıtı.
  - **2c** ✅ Bypass client → admin/auth/cron'a wire (11 doğrudan-prisma site). ⚠️ cron-via-service (order.scheduler→notifications) boşluğu 2d-2'de.
  - **2c+ (bypass wiring tamamlama):** Aşama A ✅ (9172aad4) company-auth.service pre-context 27 sorgu → bypass (surgical; authenticated 20 site main'de RLS-korumalı); auth-precontext kanıt (bypass BULUR/RLS'li bağlamsız BULAMAZ→giriş kırılırdı). Aşama B ✅ (9bd94111) public-profile.service → bypass (public katalog cross-tenant); kanıt temp companies-policy. admin-inspection: zaten RLS-DOĞRU (cross-tenant=admin bypass, test owner=bypass eşdeğeri; wrong-lock YOK — rig yorumu netleştirildi). **Bypass kategorileri TAM:** admin/auth-precontext/public/cron-direct. KALAN: cron-via-service (notifications)=2d-2.
  - **2d-1** ✅ Gerçek policy addresses+bank (20260719132000, `"companyId"=current_setting`). **İZOLASYON KANITI** (rls-isolation.spec 7/7: A≠B, kanıt-çifti, bypass, no-ctx boş+throw, WITH CHECK). Full-suite 96/890 yeşil.
  - **2d-2a** ✅ (d6977379) 7 güvenli tablo gerçek policy (templates×3, approval_flows/requests, admin_notes, membership_events; 20260719133000). Bypass wiring TAM (auth pre-context Aşama A + public katalog Aşama B). **→ 9 direct tablo gerçek-policy.** Kalan 4 (companies/company_users/notifications/company_user_invitations) = cross-tenant/pre-context BY DESIGN → permissive KALIR (bkz. altta "13 direct fazla saymış").
- **Faz 5** ✅ (33567906) Transitif approval steps (20260719134000, EXISTS-parent). **→ 11 tablo.**
- **Faz 6** ✅ İki-taraflı + kapalı-zarf (`IN(a,b)` / EXISTS-parent), her biri izolasyon-kanıtlı:
  - 6a connections+blocks, 6b complaints+referrals (reviews HARİÇ=directory), 6c messages
    (13a50df8), 6d listing_bids kapalı-zarf asimetrik (99317d2b, INV-BID-1 satır-düzeyi),
    6e bid item/answer/document (da4db6e1, parent kapalı-zarfını miras). **→ 21 tablo.**
- **Faz 6f — ORDERS** (iki-taraflı buyer/seller + EXISTS-parent child'lar):
  - **Step 1** ✅ (b2ebc131) cron sweep bypass'a ayrıldı (DAVRANIŞ DEĞİŞMEZ; policy gelince
    küresel vade-cron boş dönmesin). 3 okuma bypass, notifyOrderParty in-context korumalı.
  - **Step 2** ✅ (c35ae74b) `company_orders` `IN(buyer,seller)` + 4 child EXISTS-parent
    (20260720110000). Writer/reader audit temiz (award runTenantTx / transitions taraf /
    admin+cron bypass; okumalar taraf-kapılı). **PERF EXPLAIN'lendi**: EXISTS-parent hashed
    SubPlan (order-id kümesi bir kez) + BitmapOr buyer/seller index → Exec 1.9ms. **→ 23 tablo.**
- **Kalan:** listing_invitations (owner-via-listing) → listings+children (tedarikçi görünürlük,
  karmaşık, sona) → 4 directory tablo (permissive kalır).
- Her tabloda **USING (okuma) önce, WITH CHECK (yazma) sonra.**
- **Prod EN SON, ayrı adım:** rol provision + `DATABASE_URL` rol-geçişi + policy enable
  → **sıralı adımlar `docs/launch-checklist.md` § "RLS aktivasyon".**

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

## 2d-2 bulgu (2026-07-20): "13 direct" fazla saymış — 9 temiz + 4 cross-tenant
Yalnız 9/13 tablo TEMİZ tek-tenant RLS: addresses, bank, listing/supplier/question
templates, approval_flows/requests, admin_notes, membership_events (hepsi gerçek
policy ✅). Kalan 4 cross-tenant/pre-context BY DESIGN → strict policy özellikleri
kırar (force-fit ETME):
- **companies** — cross-tenant OKUNUR: invite (rothernId), connection-card firma
  bilgisi, discover.
- **company_users** — cross-tenant OKUNUR: connection-card karşı-taraf contact.
- **notifications** — cross-tenant YAZILIR: karşı-tarafı bilgilendirir (counterparty).
- **company_user_invitations** — pre-context OKUNUR: accept-by-token (davetli giriş öncesi).
- **listings** — tedarikçi görünürlük (Faz 6).

Bunlar "shared/directory" → permissive kalır (servis-scope birincil gate; RLS=backstop
zaten ikincil) VEYA özellik-farkında nuanced policy + per-path bypass (Faz 6-benzeri,
deliberate iş — rush ETME). RLS backstop 9 temiz tablo + transitif (Faz 5) + iki-taraflı
(Faz 6)'da anlamlı.
