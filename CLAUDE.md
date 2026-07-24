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
apps/web      Next.js        port 3000  www.rothern.com  (tenant + supplier rotaları)
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
- **Test DB — LOKAL izole Postgres (varsayılan):** integration testleri artık
  `docker-compose.test.yml`'daki lokal `postgres:17`'ye koşar (Supabase 17.6 paritesi),
  remote Supabase'e DEĞİL. Bağlantı `apps/api/.env.test` (lokal DB URL) → `test/
  integration/env.ts` (kök `.env`'den önce yükler, `rothern_test` şeması ekler, remote
  host'a fail-fast). Migration'lar jest globalSetup'ta `migrate deploy` ile uygulanır.
- ✅ **"Tek tek koş" workaround'u KALKTI — ama kök neden başkaymış.** `40P01`
  TRUNCATE deadlock **lokal izole DB'de + `maxWorkers:1` ile de tekrarlandı** (ilk
  varsayım "paylaşımlı remote kaynaklı" YANLIŞTI). GERÇEK kök neden: Prisma'nın
  varsayılan çoklu-bağlantı havuzu — `truncateAll`'ın TRUNCATE'i (AccessExclusiveLock)
  bir bağlantıda koşarken önceki testten sızan fire-and-forget yazım (bildirim/FX →
  FK RowShareLock) başka bağlantıda ters kilit sırası tutunca deadlock. **FIX:
  `test-db.ts` PrismaClient'ında `connection_limit=1`** → tüm sorgular tek bağlantıda
  serileşir, TRUNCATE hiçbir yazımla yarışamaz → deadlock yapısal olarak imkânsız.
  Testler zaten seri (maxWorkers:1) → performans kaybı yok. Ağır suite'ler artık
  **BİRLİKTE** koşar (74 suite / 788 test yeşil, 0 deadlock). (Remote'a koşma;
  env.ts reddeder.) Not: lokalde deadlock ~1sn'de tespit edilip abort olur (remote'ta
  paylaşımlı-instance + yabancı idle bağlantı yüzünden 56 dk HANG'e dönüşüyordu).
- **Komutlar:**
  ```bash
  pnpm --filter @rothern/api test:db:up    # lokal test PG'yi başlat (docker, bir kez)
  pnpm --filter @rothern/api test          # TÜM spec'ler birlikte (lokal, deadlock yok)
  npx jest <spec>                          # tek spec (hızlı geri bildirim)
  pnpm --filter @rothern/api test:cov      # +coverage
  pnpm --filter @rothern/api test:db:down  # PG'yi durdur
  ```
  (Docker Desktop WSL entegrasyonu gerekir. PG kapalıysa testler net "docker compose
  up" hatası verir — sessizce remote'a düşmez.)
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
- ✅ CSP: API helmet sıkı (`default-src 'none'`); web+admin nonce tabanlı `script-src 'self' 'nonce-<per-request>' 'strict-dynamic'` (unsafe-inline/eval kaldırıldı, src/middleware.ts + force-dynamic; style-src 'unsafe-inline' bilinçli kalır)
- ⏳ Bekleyen: alert webhook, audit_logs populate; fast-follow: log drain, frontend Sentry
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
- alert webhook, audit_logs populate (Structured logger/Sentry/CSP ✅ tamamlandı — bkz. Güvenlik Durumu)

**Teknik borç / temizlik**
- **Test paketi refactor:** 534 testin bcrypt mock'ları `SupabaseAuthService` bridge'i ile uyumsuz; login/register/password test'leri Supabase auth.users mock'larıyla yeniden yazılmalı + smoke E2E paketi güncellenmeli.
- `Supplier.sectors` (kürasyonlu) deprecated kolon kaldırılmalı (migration).
- `@rothern/email` değişince `pnpm --filter @rothern/email build` şart — CI'da otomatikleşmeli.

**AI katmanı**
- ✅ **Faz AI-3 (2026-07-24): Asistan yenileme BİTTİ** — (1) belge yükleme yeni-ihale sayfasında belirgin kart + asistan composer'ında 📎 (asistan içinden belge→taslak); (2) asistan UI modernize (marka gradient, avatar/timestamp, araç rozeti, öneri chip'leri, taslak kartı); (3) **konuşarak ihale açma**: `propose_tender_draft` non-binding araç — model çekirdek alanları toplar, eksik zorunluları sırayla sorar; taslak `AiChatSession.tenderDraft`'ta birikir (belge+konuşma birleşimi, `mergeDrafts`); yanıtta `tenderDraft` payload → "İhale formunu aç" → `sessionStorage["ai-tender-draft"]` + `yeni?ai=1` → wizard prefilled. İHALE AÇILMAZ (kategori AI seçemez; kullanıcı formda seçip Yayınla — BAĞLAYICI-YAZMA-YOK korunur). Vertex prod'da çalışıyor; teşhis mesajı sadeleştirildi.
- ✅ **Faz AI-2 (2026-07-24): Asistan sohbeti BİTTİ** — `POST /company/ai/assistant/message` (+sessions CRUD); asistan sistemin OKUMA servislerini kullanıcı kimliğiyle IN-PROCESS çağırır (ham DB YOK) → yetki katmanı (rol/tier/görünürlük/kapalı-zarf/Faz O) bedava çalışır. 6-7 okuma aracı (Gemini function-calling), BAĞLAYICI YAZMA YOK (sayfaya yönlendirir). Portal-yönlü kısıt (SA satış/ST alım verisi göremez), araç hatası → nötr `unavailable` (bilgi sızmaz), kayan pencere (son 8 tur + tek özet), 90 gün TTL cron, kullanıcıya-scope'lu kalıcı oturum. Frontend: sağ-alt floating launcher + slide-over (Silver+ ∧ SA/ST). GOTCHA: Gemini 3 function-calling **thought signature** ZORUNLU — modelin functionCall part'ındaki `thoughtSignature` geri beslemede korunmazsa 400; ayrıca fnResponse turundan sonra boş user turu EKLEME (mesajı history'ye koy, prompt="").
- ✅ **Faz AI-1 (2026-07-24): Belge/fotoğraf → ihale formu BİTTİ** — `POST /company/ai/tender-extract` (+uploads/url, +tender-refine); girdi yönlendirici (metinli PDF→TEXT bedava çıkarım; taranmış/karışık PDF→Gemini'ye DOĞRUDAN inlineData ~258 tok/sayfa; foto→sharp ≤1500px, HEIC destekli); sayfa tavanı `AI_MAX_PAGES=20`; "bir kez oku, JSON'la konuş" (refine belgeyi yeniden okumaz); AI çıktısı shared-limits sanitizer'dan geçer (geçmeyen null+flag), vision'da miktar/birim/tarih/para birimi varsayılan işaretli; KDV-dahil uyarısı; prompt-injection sınırı (<belge> VERİ + şema-kısıtlı çıktı); wizard'a giriş noktası "Belgeden Doldur (AI)" + AiFlagsBanner + refine kutusu. AI ihale AÇMAZ — oluşturma normal kapılardan. NOT: `pnpm test` artık `NODE_OPTIONS=--experimental-vm-modules` ile koşar (pdfjs fake-worker dynamic import); tek spec koşarken de bu env gerekli: `NODE_OPTIONS=--experimental-vm-modules npx jest <spec>`.
- ✅ **Faz AI-0 (2026-07-24): AI altyapısı BİTTİ** — Gemini adapter (sağlayıcı-soyut `BaseAiProvider`), USD-bazlı firma bütçesi (Silver $6 / Gold $25, takvim ayı UTC), ön-rezervasyon + FOR UPDATE (yarış kapalı), tavanlar (kullanıcı %50, günlük %25, istek-başı %5, premium alt-bütçe %20), model yükseltme = KOD kararı (eşik/feature/retry — kullanıcı seçemez), `/company/ai/usage` + `ayarlar/ai-kullanim` ekranı (yalnız yüzde). `GEMINI_API_KEY` yoksa AI kapalı (503, prod'da gürültülü); fiyat tablosu `apps/api/src/modules/ai/ai.config.ts`, her satır costUsd snapshot. AI-1/AI-2 özellikleri `AiService.callAi` kapısından geçecek.
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
