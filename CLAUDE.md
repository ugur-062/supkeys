# Rothern — Bağlam Dosyası

## Proje
**Rothern**, AI destekli e-procurement & e-ihale SaaS platformu. PratisPro/SAP Ariba tarzı B2B; alıcılar için RFQ/teklif toplama/açık eksiltme/kazandırma/sipariş, tedarikçiler için davet kabul/teklif verme. V1 hedefi: 3 ay içinde RFQ flow'u tamamlanmış, üretime hazır iskelet.

## Marka
Mavi & beyaz · Inter (UI) + Plus Jakarta Sans (display) · "S" mavi kutu + lacivert/mavi dual-tone · AI agent katmanı ileride aktif olacak.

## Tech Stack
- Monorepo: pnpm 10 + Turborepo
- Backend: NestJS 10 + Prisma 6 + Supabase (Postgres + Auth) + kendi JWT'miz
- Frontend: Next.js 15 (App Router) + React 19 + Tailwind v4 (`@theme` CSS) + Zustand persist + TanStack Query + react-hook-form + zod + sonner + lucide
- E-posta: React Email + Resend (synchronous, BullMQ kaldırıldı 2026-05-20)
- Cron: NestJS Schedule (in-process, Redis yok)
- Storage: Cloudflare R2 (S3-compatible AWS SDK v3)
- **Docker yok**: Tüm yan servisler managed (Supabase/Resend/R2). Lokal dev `pnpm dev` yeterli.
- Node 22, pnpm 10.33

## Repo Yapısı
```
apps/api      NestJS         port 4000  api.rothern.com
apps/web      Next.js        port 3000  app.rothern.com  (tenant + supplier rotaları)
apps/admin    Next.js        port 3001  admin.rothern.com
packages/db       @rothern/db        Prisma schema + migrations + seed + scripts
packages/shared   @rothern/shared    Zod + types + helpers (slug, short-code, tender-number)
packages/email    @rothern/email     React Email templates + Resend provider
```

## Test Hesapları (Dev)

> ⚠️ **Güvenlik notu:** Aşağıdaki parolalar **sadece lokal dev** içindir. Repo public olursa bu blok kaldırılmalı veya `CLAUDE.md.local` (gitignore'lı) varyantına taşınmalı.

| Tip | URL | E-posta | Şifre |
|-----|-----|---------|-------|
| Tenant | localhost:3000/login | ugur@demo.com | demo12345 |
| Admin | localhost:3001/admin/login | admin@rothern.com | admin12345 |
| Supplier | localhost:3000/supplier/login | demo-supplier@firma.com | Test1234 |

E-postalar Resend `onboarding@resend.dev` test domain'inden gerçekten gönderilir — kullanıcı kayıtlı gerçek bir adres olmalı (test için kendi adresini kullan).

## Servis Başlatma
```bash
pnpm dev   # turbo, hepsi paralel
# veya tek tek:
pnpm --filter @rothern/api dev
pnpm --filter @rothern/web dev
pnpm --filter @rothern/admin dev
```
Yan servis yok — Supabase Postgres, Supabase Auth, Cloudflare R2, Resend hepsi managed.

## Önemli Mimari Kararlar

1. **3 ayrı auth alanı:** Tenant (`apps/web /dashboard`), Admin (`apps/admin`), Supplier (`apps/web /supplier`). JWT payload'ında `type: "tenant" | "admin" | "supplier"`. Her tarafın kendi store'u + axios instance + 401 redirect interceptor.
2. **Multi-tenant veri izolasyonu:** Tüm sorgular tenantId scope'unda, servis seviyesinde filtrelenir.
3. **Buyer self-register YOK:** Alıcı sadece demo görüşmesi → admin'in gönderdiği davet linkiyle kayıt olabilir; e-posta verify sonrası admin manuel onay verir, otomatik onay yoktur.
4. **Tedarikçi self-register VAR** (admin onayıyla); zaten kayıtlı tedarikçinin yeni alıcı daveti kabulü → direkt `ACTIVE`.
5. **Kapalı zarf:** Tedarikçiler birbirinin tekliflerini ASLA göremez. Alıcı her zaman görür. `/supplier/tenders/:id` response'ı `invitations`/`bids`/`bidStats` field'ları içermez; sadece `myInvitation` + `myBid`.
6. **SUBMITTED bid editlenmez VE geri çekilemez** (Geri Çek kaldırıldı). Tek değişiklik yolu: alıcıyla iletişim → alıcı eleme yapar LOST → tedarikçi yeniden teklif verebilir (version++). WITHDRAWN yalnız legacy kayıtlarda.
7. **Kazandırma kalıcı:** Toplu (tek tedarikçi, tüm kalemler) veya Kalem Bazlı (her kalem ayrı tedarikçi). Finalize edilince Tender → AWARDED + Order'lar (`ORD-YYYY-NNNN`). Şu an geri alma YOK (bekleyen).
8. **Ana akış RFQ:** İngiliz Usulü açık eksiltme tipi kurulu ama ikincil/ayrı akış.
9. **Body parser 25MB:** Vergi levhası + tender/bid attachment base64; R2 presigned URL altyapısı mevcut, tamamen taşınabilir.
10. **Audit log append-only**, AI agent event-bus altyapısı ileride (Kafka/RabbitMQ).

## Konvansiyonlar
- Form validation: react-hook-form + zod (frontend), class-validator (backend DTO)
- Hata mesajları Türkçe (kullanıcı yüzü)
- `<Field error={...} hint={...}>` ile sarmalama
- Button variants: primary | secondary | ghost · sizes: sm | md | lg
- Toast: sonner top-right, richColors
- `<RequireAuth>` / `<RequireAdminAuth>` / `<RequireSupplierAuth>` boundary
- Component yolu: `@/components/{ui,brand,providers,dashboard,tenders,orders}/*`
- API çağrıları: `useMutation` / `useQuery` (TanStack Query) + axios instance
- **Auth = httpOnly cookie oturum** (token JS'ten OKUNMAZ; XSS'e kapalı). Zustand persist YALNIZ UI snapshot'ı tutar (`user`/`company`), token DEĞİL — persist key'leri `rothern-company-auth` (web) + `rothern-admin-auth` (admin); remember→localStorage, aksi→sessionStorage. Kimlik `/me` ile doğrulanır. Mutating isteklerde CSRF double-submit (`rk_csrf`/`rk_admin_csrf` → `X-CSRF-Token`).

## Geliştirme Notları
- **NestJS CLI watch modu WSL'de bozuk.** `apps/api/package.json` `dev` script'i `concurrently` + `tsc -w` + `nodemon` kullanır. `nest start --watch` KULLANMAYIN.
- **Prisma `.env` symlink:** `packages/db/.env` → `../../.env`. Migration komutları için gerekli.
- **Tailwind v4:** `tailwind.config.ts` YOK, tema `globals.css`'te `@theme { ... }` ile.
- **`.env`'de `INITIAL_ADMIN_*`** seed için kullanılır (production'da kaldırılır).
- **Schema değişikliği:** `pnpm --filter @rothern/db migrate` (dev) → `migrate:deploy` (prod). Manuel SQL gerektiğinde migration klasörüne yaz, `_journal.json` güncelle. **Her yeni migration'dan ÖNCE `docs/migration-safety.md` kontrol listesini oku** (veri kaybı / kilit / rollback = PITR+snapshot kuralları).
- **DB cleanup:** `pnpm --filter @rothern/db cleanup-pending-relations` legacy `PENDING_TENANT_APPROVAL` kayıtlarını ACTIVE'e çevirir.
- **gitleaks pre-commit hook:** Repo `.githooks/pre-commit` ile staged sır taraması yapar (versiyonlanmış, husky yok). Klonladıktan sonra bir kez aktive et: `git config core.hooksPath .githooks`. gitleaks binary gerekir (kur: `~/.local/bin`); yoksa hook fail-closed engeller. Acil atlama: `SKIP_GITLEAKS=1 git commit ...`.

## Token İzolasyonu
JWT payload `type` field'ıyla doğrulanır. Tenant token → admin/supplier endpoint = 401 "Geçersiz token tipi". Aynı şekilde diğer kombinasyonlar. Cross-token testleri yapıldı.

---

## Test & Kalite Durumu

- **Test sayısı:** 534 test, 25 suite — Supabase Auth geçişi (2026-05-19/20) sonrası bcrypt mock'ları kırık. Login/register/password servisleri `SupabaseAuthService` bridge'i bekliyor, mock güncellenmedi. **Smoke test manuel doğrulandı** (admin/tenant/supplier login → JWT alındı, generic 401 davranışı korundu). Test paketi refactor edilmeli (bekleyen iş).
- **Coverage (geçiş öncesi):** Kritik dosyalarda %85-100 (auth, permissions, controllers)
- **Test DB:** İzole `rothern_test`
- ⚠️ **Integration spec'leri TEK TEK / küçük gruplarla koş — TOPLU KOŞMA.** Paylaşımlı
  remote Supabase `rothern_test` şemasında `beforeEach` TRUNCATE'i `40P01` deadlock'a
  girer; birçok ağır suite'i tek `jest` çağrısında birleştirmek (ör. 6 suite) kurulumda
  **süresiz asılı kalır** (CPU donar, worker açılmaz). Kanıtlanmış pratik: her spec'i
  AYRI `npx jest <spec>` çağrısıyla, izole çalıştır (izole geçer, memory'de belgeli).
- **Komutlar:**
  ```bash
  npx jest <spec>        # DOĞRU: tek spec izole (ör. npx jest approvals.spec)
  pnpm test              # tüm testler (şu an kırık — refactor bekliyor; ayrıca deadlock riski)
  pnpm test:cov          # +coverage rapor
  npx jest e2e.spec      # sadece E2E (13 suite, ~3 dk)
  ```
- **Kapsam:** RBAC matrisi, IDOR senaryoları, multi-tenant scope, auth attack (timing-safe, malformed JWT, expired token), DTO validation, state machine geçişleri.

## Güvenlik Durumu

Yapılan audit'ler:
- ✅ Auth/IDOR/RBAC E2E coverage
- ✅ Plain text parola sızıntısı (seed.ts) kapatıldı
- ✅ Yutulan catch'ler temizlendi
- ✅ Health endpoint DB ping (Redis kaldırıldıktan sonra)
- ✅ Console.log → NestJS Logger (production)
- ✅ Structured logger (Pino + redact) + Sentry entegre; kritik-audit kaybı + webhook imza hataları `reportToSentry()` ile Sentry'e bağlı (fırlatılmayan logler SentryGlobalFilter'a takılmıyordu)
- ✅ httpOnly cookie auth + CSRF double-submit (tamamlandı — token localStorage'dan kaldırıldı)
- ⏳ Bekleyen: alert webhook, audit_logs populate, CSP (helmet); fast-follow: log drain, frontend Sentry
- 🚀 **Launch checklist:** Prod deploy öncesi ödeme/plan + env + doğrulama adımları → **`docs/launch-checklist.md`**. Kritik: `SENTRY_DSN` boşsa error tracking + kritik-audit/webhook alarmları tümüyle pasif (sessiz no-op — tek fail-open servis); Supabase/R2/Resend env'leri eksikse app boot etmez (fail-closed).

---

## Tamamlanan Aşamalar (Özet)

Detaylı geçmiş için: `docs/history/CHANGELOG.md`

- **V1 Foundation (A → E.7.D):** Backend registration, admin application yönetimi, tenant tedarikçi yönetimi, supplier paneli, multi-tenant davet kabul, tender wizard, bid/eleme/kazandırma, sipariş, settings (5 alt sayfa), kullanıcı yönetimi, firma tercihleri, onay akışı runtime.
- **V1.5:** Sipariş workflow + approver fallback, sipariş PDF export, onay reminder cron, data cleanup.
- **V2-1 → V2-6:**
  - V2-1: Resend webhook (e-posta delivery tracking)
  - V2-2: Cloudflare R2 + dosya upload (presigned URL)
  - V2-3: Multi-currency + TCMB cron integration
  - V2-4: 1-on-1 messaging (Messenger-style)
  - V2-5: Tedarikçi paneli redesign
  - V2-6: UNSPSC kategori sistemi (2-seviye foundation, 8 segment + 392 family)
- **Polish:** Liste sayfaları UX, admin paneli + KPI, form hata TR, mobile, e-posta QA.

---

## Bekleyen / Yapılacaklar

> **Sürüm/faz ayrımı YOK.** V1.5/V2/V2.7/V3 gibi kademeler kaldırıldı — her şey tek backlog, sıraya göre yapılır. Aşağıdaki gruplar yalnızca konuya göredir, öncelik/erteleme değil.

**Ürün özellikleri**
- **Yurtdışı şirket kaydı — ÇEKİRDEK BİTTİ (Faz 1-3):** ülke seçimi (COUNTRIES, 98 ülke) + ülke-farkında vergi/adres doğrulama (TR strict VKN/TCKN, yabancı gevşek) + onboarding UI (alıcı+tedarikçi). Şema: Tenant/Supplier.country+stateRegion. KALAN: (a) i18n — UI hâlâ Türkçe (next-intl greenfield, ayrı büyük iş); (b) VIES — AB VAT ücretsiz oto-doğrulama; (c) yabancı belge/KYB kontrolü = mevcut admin onayı + belge (ödeme sağlayıcısı KYB yapmaz çünkü sanal POS düşünülüyor).
- STANDARD → PREMIUM upgrade akışı + ödeme (Iyzico/Stripe) + escrow
- Açık ihale (PUBLIC) + tedarikçi başvuru sistemi
- Kazandırma geri alma (un-award) — SONRAYA bırakıldı (canlı siparişlere dokunan riskli iş). NOT: eleme geri almaya gerek yok — elenen tedarikçi zaten baştan yeniden teklif verebiliyor (mevcut davranış kabul edildi).
- WebSocket real-time bildirim
- Admin ek kontroller: impersonate (güvenlik değerlendirilecek), iade/refund, doğrudan kullanıcı ekleme, CSV export, dahili not, global arama

**Altyapı / production**
- Hosting / production setup (Coolify + Hetzner, Chromium pre-installed Docker image — PDF)
- Resend domain doğrulaması + webhook tracking
- Structured logger (Pino + redact), Sentry, alert webhook, audit_logs populate, CSP (helmet)

**Teknik borç / temizlik**
- **Test paketi refactor:** 534 testin bcrypt mock'ları `SupabaseAuthService` bridge'i ile uyumsuz; login/register/password test'leri Supabase auth.users mock'larıyla yeniden yazılmalı + smoke E2E paketi güncellenmeli.
- `Supplier.sectors` (kürasyonlu) deprecated kolon kaldırılmalı (migration).
- `@rothern/email` değişince `pnpm --filter @rothern/email build` şart — CI'da otomatikleşmeli.

**AI katmanı**
- AI agent layer (event-bus, MCP entegrasyonu, action endpoint'leri `/api/agents/v1/...`)
- "Tercihlerimi Getir" preset, "Önceki İhalelerden Ekle" template
- Akıllı şartname motoru, manipülasyon tespiti

---

## Claude Code Çalışma Kuralları

**Görev kapsamı:**
- "Kritik dosyalar" = auth, ödeme, multi-tenant scope, state machine olan dosyalar
- Coverage hedefi: kritik dosyalarda %80, diğerlerinde zorunlu değil
- Scope dışı testler: Puppeteer (PDF), R2 integration, webhook'lar

**Çalışma şekli:**
- `/loop` KULLANMA, her görev tek seferde bitsin
- "Doygunluğa ulaştı" / "scope dışı" dediğinde **DUR**, yeni tur açma
- Üretim kodunu değiştirmeden önce **onay bekle**
- Her büyük görev başında **plan çıkar, onay bekle**, sonra uygula
- Büyük dosyaları (>1000 satır) okurken modül modül ilerle, hepsini tek seferde context'e yükleme

**Yapma:**
- Yeni dependency eklerken sormadan ekleme
- Production secret'ı (.env) plain text yazma/loglama
- "Refactor edeyim mi" deyip kapsamı genişletme — sadece istenen iş
- `--dangerously-skip-permissions` ile riskli komut çalıştırma (rm -rf, force push, db drop)

---

## Git
- Repo: `git@github.com:ugur-062/rothern.git`
- Branch: `main`
- Her özellikten sonra commit + push.
- WIP commit'leri OK (oturum sonlarında), ama main'e push etmeden önce squash veya rebase düşün.
