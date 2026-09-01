# Rothern — Bağlam Dosyası

## Proje
**Rothern**, AI destekli e-procurement (e-satınalma) SaaS platformu. PratisPro/SAP Ariba tarzı B2B; alıcılar için RFQ/teklif toplama/açık eksiltme/kazandırma/sipariş, tedarikçiler için davet kabul/teklif verme. V1 hedefi: 3 ay içinde RFQ flow'u tamamlanmış, üretime hazır iskelet.

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
| Firma (birleşik alıcı+satıcı) | localhost:3000/company/login | firma@demo.com / firma2@demo.com / firma3@demo.com | `CLAUDE.md.local`'da |
| Admin | localhost:3001/admin/login | admin@rothern.com | `CLAUDE.md.local`'da |

> ⚠️ **Parolalar buradan KALDIRILDI (2026-09-01).** Gerekçe: dev ve prod AYNI
> veritabanını kullanıyor, dolayısıyla bu "dev" hesapları CANLI hesaplar.
> `admin@rothern.com` canlıda aktif SUPER_ADMIN'di, 2FA'sı kapalıydı ve
> parolası bu dosyada yazılıydı — denetimde bulunan en kolay sömürülebilir
> maddeydi. Parolalar artık gitignore'lı `CLAUDE.md.local` dosyasında
> tutulmalı; buraya GERİ YAZILMAMALI.

(Eski "tenant/supplier" ayrı hesapları kaldırıldı — tek Company hesabı iki portal: `/company/satinalma` + `/company/satis`.)

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

1. **2 auth realm'i:** Company (`apps/web /company/*` — TEK firma hesabı hem alıcı hem satıcı, iki portal `satinalma`/`satis`; rol/izin/tier kapıları) + Admin (`apps/admin`). JWT payload `type: "company" | "admin"`; cookie realm'leri `rk_company`/`rk_admin` (+ `rk_csrf`/`rk_admin_csrf`). Her realm'in kendi store'u + axios instance + 401 interceptor'ı.
2. **Multi-tenant veri izolasyonu:** Tüm sorgular tenantId scope'unda, servis seviyesinde filtrelenir.
3. **Firma self-signup VAR (3 aşama):** signup → e-posta doğrulama (6 haneli kod, hesap-bazlı 5/saat üretim tavanı) → onboarding (yalnız Kurucu) → panel içi kapılar (KYC/doğrulama belgeleri admin onayı; satın alma talebi açma Silver+, satış teklifi Bronz+ — bkz. Faz T/Y). Davetle katılım (firma-kullanıcı daveti + referral/dış davet) ayrıca var.
4. **Bağlantı modeli:** firmalar arası bağlantı (invite/accept, blok), ilan görünürlüğü PUBLIC/CONNECTIONS/PRIVATE — tek kaynak `listing-visibility.ts`.
5. **Kapalı zarf:** Teklifçiler birbirinin tekliflerini ASLA göremez; ilan sahibi her zaman görür. `GET /company/listings/:id` non-owner dalı `invitations`/`bids`/`bidStats` içermez; yalnız `myInvitation` + `myBid` (+ pazarlıkta ayarlı `auctionView`). Sözleşme testleri: closed-envelope/visibility-matrix spec'leri.
6. **SUBMITTED bid editlenmez VE geri çekilemez** (Geri Çek kaldırıldı). Tek değişiklik yolu: alıcıyla iletişim → alıcı eleme yapar LOST → tedarikçi yeniden teklif verebilir (version++). WITHDRAWN yalnız legacy kayıtlarda.
7. **Kazandırma kalıcı:** Toplu (tek tedarikçi, tüm kalemler) veya Kalem Bazlı (her kalem ayrı tedarikçi). Finalize edilince Tender → AWARDED + Order'lar (`ORD-YYYY-NNNN`). Şu an geri alma YOK (bekleyen).
8. **Ana akış RFQ:** İngiliz Usulü açık eksiltme tipi kurulu ama ikincil/ayrı akış.
9. **Body parser 5MB** (Y-3 ile 25→5MB düşürüldü); belgeler R2 presigned URL ile yüklenir (base64 gövde yalnız küçük içe-aktarma dosyaları).
10. **Audit log append-only**, AI agent event-bus altyapısı ileride (Kafka/RabbitMQ).
11. **Siparişte belge yükleme YOK (2026-08-22):** Platform muhasebe/belge arşivi değil — teminat/irsaliye/dekont/fatura/LC belgeleri firmaların kendi kanallarında yaşar (`company_order_documents` tablosu + `CompanyDocType` enum DROP edildi). Kalan: ödeme bildir/onayla/reddet (alındı-alınmadı), IBAN snapshot (accept'te banka hesabı zorunlu), LC adım damgaları BEYAN olarak (belge kapısı yok), `requireGuaranteeLetter` bayrağı yalnız BİLGİ (onay kapısı yok). İlan/teklif belgeleri ayrı modüller, aynen duruyor.

## Ürün Dili — "ihale" DEĞİL "satın alma talebi" (2026-09-01)

Kullanıcının gördüğü hiçbir yerde **"ihale" geçmez**. Yeniden adlandırma
yapıldı (623+ dize, 4 rota, 308 yönlendirmelerle).

**İki portal, İKİ ayrı sözcük** — bu ayrım kritik, tek kelimeye indirgenemez:

| Bağlam | Ne demek | Sözcük |
|--------|----------|--------|
| Satınalma | Firmanın KENDİ satın alma talepleri | **talep** ("Taleplerim") |
| Satış — kendi sattıkları | Firma satıyor | **ilan** ("Satış İlanlarım") |
| Satış — teklif verilecekler | BAŞKA firmaların talepleri | **talep** ("Açık Talepler") |

Satış tarafına "satın alma talebi" demek TERSTİR (orada firma satıyor).
Tek kaynak: `apps/web/src/lib/company/portals.ts` `MODULE_LABELS` —
gerekçe orada yorumda.

**Türkçe not:** `talep` son sesi yumuşar (talep → **talebi**, talebe,
talebin). Yeni metin yazarken "talepi/talepe" yazma. Çoğul: talepler →
**taleplerini**, taleplerinde.

**Henüz DEĞİŞMEYEN (bilinçli, kullanıcı görmez):**
- Kod adları: `IhaleListView`, `ihaleler-view.tsx`, `components/ihale/`,
  `isIhale`, `satinalma-ihale-tab`
- Kod yorumları
- `docs/audit-*.md` denetim raporları — **TARİHSEL KAYIT**: o tarihteki kodu
  ve o günkü dizeleri anlatırlar; bugünkü sözcükle yeniden yazmak raporu
  gerçeğe aykırı hâle getirir (okuyucu git geçmişinde başka bir şey bulur).

Rota değişimi (eskiler `next.config.ts` `redirects()` ile 308 yönlenir —
gönderilmiş e-postalardaki CTA'lar kırılmasın diye; o e-postalar geri
alınamaz):

| Eski | Yeni |
|------|------|
| `/company/satinalma/ihalelerim` | `/company/satinalma/taleplerim` |
| `/company/satis/acik-ihaleler` | `/company/satis/acik-talepler` |
| `/company/satinalma/sablonlar/ihale` | `.../sablonlar/talep` |
| `/company/satis/sablonlar/ihale` | `.../sablonlar/ilan` |

`/company/ilan/[id]` DEĞİŞMEDİ — "ilan" nötr terim (hem alım hem satış
kaydının detay sayfası).

## Kayıt Ülkeleri — SEKİZ ülke (2026-09-01)

Yeni kayıt yalnız şu ülkelerden alınır. Tek kaynak: `@rothern/shared`
`data/country-profiles.ts`. Gerekçe: `docs/plan-country-registration.md`.

| Kod | Ülke | Not |
|-----|------|-----|
| TR | Türkiye | 6 belge (mevcut akış) |
| **XN** | KKTC | **ISO 3166-1'de KODU YOK** — kullanıcıya ayrılmış X-aralığı. Dış sistemlere GÖNDERİLMEMELİ |
| RU | Rusya | `enhancedDueDiligence: true` → her kayıt zorunlu manuel inceleme |
| AZ · KZ · UZ | Azerbaycan, Kazakistan, Özbekistan | ortak yabancı temeli |
| CN | Çin | 营业执照 TEK belgede sicil+vergi+temsilci → vergi belgesi İSTENMEZ |
| AE | BAE | Trade License zorunlu; TRN yalnız KDV mükellefinde → vergi belgesi zorunlu DEĞİL |

**AB ve Afrika bilinçli KAPALI.** AB'yi ertelemenin maliyeti yok: VIES 27
ülkede aynı doğrulamayı yapar ve **VIES zaten yazılmış durumda** — açmak
profil eklemekten ibaret. Afrika'da tersi: ortak doğrulama altyapısı yok,
54 ayrı sicil; toptan değil talep geldikçe eklenir.

**Kapı YALNIZ YENİ KAYDA uygulanır.** `COUNTRIES` (98) kısaltılmadı: mevcut
firmaların ülkesi gösterilebilmeli ve adres defterinde her ülke seçilebilmeli
(teslimat adresi kayıt kapısına tabi değil). Kapatılan bir ülkedeki çalışan
hesap ASLA kilitlenmemeli.

## Konvansiyonlar
- Form validation: react-hook-form + zod (frontend), class-validator (backend DTO)
- Hata mesajları Türkçe (kullanıcı yüzü)
- `<Field error={...} hint={...}>` ile sarmalama
- Button variants: primary | secondary | ghost · sizes: sm | md | lg
- Toast: sonner top-right, richColors
- `<RequireAuth>` / `<RequireAdminAuth>` / `<RequireSupplierAuth>` boundary
- Component yolu: `@/components/{ui,brand,providers,dashboard,tenders,orders}/*`
- **Değerlendirmeler firma bazında gruplu (2026-08-22):** `ReviewSummary` (shared) — genel puan = ortak ortalamalarının ortalaması (her firma bir oy); her ortak tek satır; ad yalnız `CompanyReview.showName` opt-in + platform içi (`revealNames`), herkese açık `/firma/[slug]`'da ASLA ("Doğrulanmış alıcı/tedarikçi"). Tek yardımcı `company-reviews/review-summary.ts` (public-profile + connections + reviews/company aynı). Değerlendirme kartında "Firma adım referans olarak görünsün" kutusu (varsayılan kapalı).
- **Profilim = yerinde düzenleme (2026-08-22):** `ProfileEditor` + `CompanyProfileView` `edit` slotları (public görünümle tek düzen); görseller `lib/image-resize` ile tarayıcıda küçültülür; logo/kapak/galeri anahtarları her yüklemede benzersiz (R2 object-lock 409 + önbellek). Görsellerin `pub-*.r2.dev` yerine `cdn.rothern.com`'dan servis edilmesi için `scripts/migrate-public-images.ts` (r2.dev TR'de engelli).
- API çağrıları: `useMutation` / `useQuery` (TanStack Query) + axios instance
- **Auth = httpOnly cookie oturum** (token JS'ten OKUNMAZ; XSS'e kapalı). Zustand persist YALNIZ UI snapshot'ı tutar (`user`/`company`), token DEĞİL — persist key'leri `rothern-company-auth` (web) + `rothern-admin-auth` (admin); remember→localStorage, aksi→sessionStorage. Kimlik `/me` ile doğrulanır. Mutating isteklerde CSRF double-submit (`rk_csrf`/`rk_admin_csrf` → `X-CSRF-Token`). **Kayan oturum:** AuthCookieInterceptor her istekte token ömrünün yarısı geçtiyse taze token basar (CSRF değeri korunur) — aktif kullanıcı düşmez, `JWT_EXPIRES_IN` (prod: 7d olmalı) kadar inaktif kalan düşer; "Oturumumu açık bırak" `persistent` claim'iyle taşınır.

## Tek Kaynaklar (single source) — dokunmadan önce buraya bak

Denetim boyunca en sık tekrar eden hata: **helper yazılıyor, çağrı yerlerinin
bir kısmı bağlanmıyor** ve iki hesap sessizce ayrışıyor. Yeni bir hesap/kural
yazmadan önce burada karşılığı var mı diye bak.

| Konu | Tek kaynak |
|------|-----------|
| Para/kur bazı (rapor+pano) | `common/company/report-currency.ts` |
| Kalem toplamı / yuvarlama | `common/company/bid-items.ts` (`roundMoney`, `sumLineTotals*`) |
| Ödeme durumu | `common/company/order-payments.ts` |
| Efektif paket (INV-TIER-1) | `common/company/effective-tier.ts` (`effectiveTier`, `tierAtLeastWhere`, `anyPackageWhere`) |
| İlan görünürlüğü | `common/company/listing-visibility.ts` |
| Bağlantı geçerliliği | `common/company/valid-connection.ts` |
| Faz O dar-bağlam | `common/company/full-read-context.ts` |
| Kimlik yolunda Company select | `common/company/auth-company-select.ts` |
| Teslim SÜRESİ → tarih | `common/company/delivery-time.ts` |
| Web derin bağlantıları (CTA) | `common/company/app-routes.ts` |
| Gövde string trim'i (DTO) | `common/decorators/trim.decorator.ts` |
| IBAN (TR + yabancı mod-97) | `@rothern/shared` `ibanChecksumOk` / `isValidIbanTr` |
| İçe aktarma sütun/limit | `@rothern/shared` `item-import.ts` / `bid-import.ts` |
| Para birimi sembolü (web) | `lib/tenders/labels.ts` (`CURRENCY_SYMBOL`, `CURRENCIES`, `currencySymbol`) |
| Tarih biçimi (web) | `lib/format-date.ts` |
| Para gösterimi (web) | `components/ui/money.tsx` |
| Query anahtarları (web) | `NOTIFICATION_KEY`, `MESSAGE_KEYS` (hook'lardan export) |

## Bekleyen Migration'lar (prod'a UYGULANMADI)

`pnpm --filter @rothern/db migrate:deploy` bekliyor. Üçü de **tamamen
eklemeli** — tablo yeniden yazımı yok:

| Migration | İçerik |
|-----------|--------|
| `20260831090000` | `listing_round_snapshots.currency` + `amountTry`, `company_complaints.complainantCompanyId` indeksi |
| `20260901090000` | `listing_items.updatedAt` (ilan detayı ETag parmak izi için) |
| `20260901100000` | `order_revision_items` + `company_kyc_revisions` RLS policy'leri |

## Geliştirme Notları
- **NestJS CLI watch modu WSL'de bozuk.** `apps/api/package.json` `dev` script'i `concurrently` + `tsc -w` + `nodemon` kullanır. `nest start --watch` KULLANMAYIN.
- **Prisma `.env` symlink:** `packages/db/.env` → `../../.env`. Migration komutları için gerekli.
- **Tailwind v4:** `tailwind.config.ts` YOK, tema `globals.css`'te `@theme { ... }` ile.
- **`.env`'de `INITIAL_ADMIN_*`** seed için kullanılır (production'da kaldırılır).
- **Schema değişikliği:** `pnpm --filter @rothern/db migrate` (dev) → `migrate:deploy` (prod). Manuel SQL gerektiğinde `prisma/migrations/<timestamp>_<ad>/migration.sql` oluştur (Prisma uygulanan migration'ları DB'deki `_prisma_migrations` tablosunda izler — güncellenecek bir dosya YOKTUR). **Her yeni migration'dan ÖNCE `docs/migration-safety.md` kontrol listesini oku** (veri kaybı / kilit / rollback = PITR+snapshot kuralları).
- **DB cleanup:** `pnpm --filter @rothern/db cleanup-pending-relations` legacy `PENDING_TENANT_APPROVAL` kayıtlarını ACTIVE'e çevirir.
- **gitleaks pre-commit hook:** Repo `.githooks/pre-commit` ile staged sır taraması yapar (versiyonlanmış, husky yok). Klonladıktan sonra bir kez aktive et: `git config core.hooksPath .githooks`. gitleaks binary gerekir (kur: `~/.local/bin`); yoksa hook fail-closed engeller. Acil atlama: `SKIP_GITLEAKS=1 git commit ...`.

## Token İzolasyonu
JWT payload `type` field'ıyla doğrulanır. Tenant token → admin/supplier endpoint = 401 "Geçersiz token tipi". Aynı şekilde diğer kombinasyonlar. Cross-token testleri yapıldı.

---

## Test & Kalite Durumu

- **Test sayısı (2026-09-01):** API **147 suite / 1295 test** (114 integration + 35 unit) · web **57 dosya / 354 test** · admin **15 / 79**. Hepsi yeşil.
  - *Eski not kaldırıldı:* "534 test, bcrypt mock'ları kırık, test paketi refactor edilmeli" iddiası BAYATTI — `bcrypt` repoda hiç geçmiyor (Supabase Auth geçişi 2026-05-20'de tamamlandı), auth spec'leri geçiyor.
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
  **BİRLİKTE** koşar (bugün 147 suite / 1295 test yeşil, 0 deadlock). (Remote'a koşma;
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
- ✅ **Denetim 2026-08-23 Parça 1 (Kimlik&Oturum) Dalga A** (rapor `docs/audit-2026-08-23-part1-auth.md`): `parseCookies` toleranslı (bozuk `%` çerez 500/WS-çökme kapandı) + WS handshake tamamen try içinde + `process.on('unhandledRejection')` ağı; logout yanıtında kayan-oturum atlanır (`markAuthCleared`); gerçek istemci IP `resolveClientIp` (`TRUST_CF_CONNECTING_IP=true` prod — api Render'ın Cloudflare'i arkasında; throttle tracker + `@ClientIp()`); Sentry requestData cookies/headers/body KAPALI; access-log URL token maskesi (`maskSensitiveUrl`); **admin `tokenVersion`** (parola/2FA değişimi eski oturumları düşürür, yanıt taze `token` döner) + admin TOTP sırrı şifreli (`common/auth/totp-secret-cipher.ts`, opsiyonel `TOTP_ENC_KEY`); kuruculuk devri hedef aktif + `permissionsOverride` temizlenir; e-posta kodu hesap-bazlı 5/saat üretim tavanı + atomik deneme sayacı; Supabase Auth 429/5xx → 503 (+Sentry), "parola hatalı" değil. Kalan LOW/INFO + Dalga B raporda.
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
  - V2-6: UNSPSC kategori sistemi — güncel durum (2026-07-26): **4 seviye**
    (Segment/Family/Class/Commodity), `packages/db/src/seeds/unspsc.tsv` (13.305
    satır) + platform-özel endüstriyel ekler `categories-custom.tsv` (x99xxxxx
    kod aralığı: iskele/kalıp, elektrik pano, çelik konstrüksiyon, KKD, rigging,
    MRO — 118 satır). `cleanup-categories -- --apply` KOBİ-dışı 20 segmenti
    gizler → 38 aktif segment / ~8.2k aktif satır. Satın Alma Talebi kategorisi min L3;
    firma ana kategorileri exactLevel L1 (segment). AI önerisi 2 aşamalı → L3.
    Seed: `pnpm --filter @rothern/db seed-categories` sonra `cleanup-categories
    -- --apply`. NOT: web-dev ve prod API AYNI Supabase DB'yi kullanıyor —
    tek koşum ikisine de yansır (Category.id = UNSPSC kodu, rebuild güvenli).
    Arama TR-katlanmış `searchText` kolonundan (`foldSearchText`, shared) —
    'İ'/aksan sorunu yok; eşanlamlı jargon `category-keywords.tsv` →
    `keywords` kolonu, canlıya reseed'siz `apply-category-keywords` ile.
    Sonuçsuz aramalar API loglarında "Kategori araması sonuçsuz" (kürasyon
    girdisi).
- **Polish:** Liste sayfaları UX, admin paneli + KPI, form hata TR, mobile, e-posta QA.

---

## Bekleyen / Yapılacaklar

> **Sürüm/faz ayrımı YOK.** V1.5/V2/V2.7/V3 gibi kademeler kaldırıldı — her şey tek backlog, sıraya göre yapılır. Aşağıdaki gruplar yalnızca konuya göredir, öncelik/erteleme değil.

**Ürün özellikleri**
- ✅ **Tedarikçi keşfi + dış davet (2026-07-27):** "AI ile daha fazla eriş" —
  (A) dizin keşfi: kategori-eşleşmeli bağlantısız BRONZ+ firmalar → bağlantı
  daveti (`/company/ai/supplier-discovery`); (B) web keşfi: Gemini **Google
  Search grounding** (`webSearch` flag; grounding+responseSchema BİRLEŞMEZ →
  2 aşama: araştırma metni → şemalı JSON; e-posta yalnız açıkça yayınlanmışsa,
  kullanıcı doğrular); (C) dış davet e-postası: referral altyapısı + `listingId`
  bağlamı ("X sizi Y satın alma talebine davet etti", tender_external_invite şablonu) —
  frenler: günlük 20/firma, adrese ömür boyu 1, opt-out (`referral_opt_outs` +
  `/davet-kapat` + public GET endpoint), kayıtlı-adres skip; kayıt token'la
  tamamlanınca bağlantı ACTIVE + satın alma talebine otomatik davet (acceptReferralInvites).
  Giriş noktaları: wizard Davetliler adımı + satın alma talebi detay ⋮ menüsü.
- **Yurtdışı şirket kaydı — ÇEKİRDEK BİTTİ (Faz 1-3):** ülke seçimi (COUNTRIES, 98 ülke) + ülke-farkında vergi/adres doğrulama (TR strict VKN/TCKN, yabancı gevşek) + onboarding UI (alıcı+tedarikçi). Şema: Tenant/Supplier.country+stateRegion. KALAN: (a) i18n — UI hâlâ Türkçe (next-intl greenfield, ayrı büyük iş); (c) yabancı belge/KYB kontrolü = mevcut admin onayı + belge (ödeme sağlayıcısı KYB yapmaz çünkü sanal POS düşünülüyor). **(b) VIES YAPILDI** — `POST /company-auth/vies-check` + onboarding'de "VIES ile doğrula" butonu çalışıyor; not bayattı. AB kayıt kapısıyla kapalı olduğu için şu an erişilemez, AB açılınca hazır.
- STANDARD → PREMIUM upgrade akışı + ödeme (Iyzico/Stripe) + escrow
- Açık satın alma talebi (PUBLIC) + tedarikçi başvuru sistemi
- Kazandırma geri alma (un-award) — SONRAYA bırakıldı (canlı siparişlere dokunan riskli iş). NOT: eleme geri almaya gerek yok — elenen tedarikçi zaten baştan yeniden teklif verebiliyor (mevcut davranış kabul edildi).
- WebSocket real-time bildirim
- Admin ek kontroller: impersonate (güvenlik değerlendirilecek), iade/refund, doğrudan kullanıcı ekleme, CSV export, dahili not, global arama

**Altyapı / production**
- Hosting / production setup (Coolify + Hetzner, Chromium pre-installed Docker image — PDF)
- Resend domain doğrulaması + webhook tracking
- alert webhook, audit_logs populate (Structured logger/Sentry/CSP ✅ tamamlandı — bkz. Güvenlik Durumu)

**Teknik borç / temizlik**
- ~~Test paketi refactor~~ — **TAMAMLANDI**, madde kaldırıldı (bcrypt kalıntısı yok, suite yeşil).
- **Rig stub gotcha (tekrar eden):** yaygın enjekte edilen bir servise YENİ bağımlılık/çağrı eklendiğinde elle kurulan test rig'leri kırılır — bu denetim boyunca **8 kez** tekrarladı. İki biçimi var: (a) eksik stub → `x is not a function`, (b) **constructor SIRASI kayması** → yanlış nesne enjekte olur ve hata ancak o bağımlılığa ULAŞAN bir testte çıkar (sessiz). Böyle bir değişiklikten sonra **TAM api suite'i** koşulmalı; rig'ler mümkünse paylaşılan bir yardımcıdan kurulmalı.
- `Supplier.sectors` (kürasyonlu) deprecated kolon kaldırılmalı (migration).
- `@rothern/email` değişince `pnpm --filter @rothern/email build` şart — CI'da otomatikleşmeli.

**AI katmanı**
- ✅ **Faz AI-4 (2026-07-27): Asistan AKSİYON çerçevesi (Faz 1) BİTTİ** —
  "rol bazında her şey, ciddi işlerde onay" modeli. Model ASLA doğrudan
  yazamaz: `request_*` araçları yalnız DOĞRULANMIŞ `pendingAction` üretir
  (AiChatSession.pendingAction, tek kullanımlık, 10 dk TTL); yürütme YALNIZ
  kullanıcının confirm endpoint'iyle (`POST .../actions/:id/confirm`, CSRF'li)
  — prompt-injection zinciri yapısal kırık. Yetki = kullanıcı yetkisi (execute
  mevcut servisleri kullanıcı kimliğiyle çağırır; rol/tier/KYC kapıları aynen).
  Onay kartı içeriği backend özeti (model metni değil); critical'da vurgulu UI.
  Aksiyonlar: `request_send_invites` (normal) + `request_publish_tender`
  (critical; davetli-kapalı yayın → en az 1 bağlantılı davetli kodu zorunlu,
  varsayılan teslimat adresi otomatik) + Faz 2: `request_eliminate_bid`
  (normal; yalnız SUBMITTED) + `request_award_tender` (critical, TOPLU —
  kalem-bazlı sayfaya yönlendirilir; onay akışı devredeyse şirket onayına
  düşer, kararı model DEĞİL kullanıcı verir) + Faz 3: `request_place_bid`
  (critical, yalnız satis portalı; TÜM kalemler fiyatlı + teslim tarihi
  zorunlu, amount=Σ hesaplanır — award nöbetçisi uyumlu; belge/zorunlu-soru
  isteyen satın alma talebi sayfaya yönlendirilir; fiyatı model uyduramaz) +
  `request_mark_order_received` (normal, yalnız satinalma; IN_DELIVERY→
  DELIVERED). Diğer sipariş adımları (gönderim/ödeme/tamamlama/iptal) bilinçli
  araçsız — sayfaya yönlendirilir. Audit: `ai.action_executed` via metadata'lı.
- ✅ **Faz AI-3 (2026-07-24): Asistan yenileme BİTTİ** — (1) belge yükleme yeni talep sayfasında belirgin kart + asistan composer'ında 📎 (asistan içinden belge→taslak); (2) asistan UI modernize (marka gradient, avatar/timestamp, araç rozeti, öneri chip'leri, taslak kartı); (3) **konuşarak satın alma talebi açma**: `propose_tender_draft` non-binding araç — model çekirdek alanları toplar, eksik zorunluları sırayla sorar; taslak `AiChatSession.tenderDraft`'ta birikir (belge+konuşma birleşimi, `mergeDrafts`); yanıtta `tenderDraft` payload → "Satın Alma Talebi formunu aç" → `sessionStorage["ai-tender-draft"]` + `yeni?ai=1` → wizard prefilled. SATIN ALMA TALEBİ AÇILMAZ (kategori AI seçemez; kullanıcı formda seçip Yayınla — BAĞLAYICI-YAZMA-YOK korunur). Vertex prod'da çalışıyor; teşhis mesajı sadeleştirildi.
- ✅ **Faz AI-2 (2026-07-24): Asistan sohbeti BİTTİ** — `POST /company/ai/assistant/message` (+sessions CRUD); asistan sistemin OKUMA servislerini kullanıcı kimliğiyle IN-PROCESS çağırır (ham DB YOK) → yetki katmanı (rol/tier/görünürlük/kapalı-zarf/Faz O) bedava çalışır. 6-7 okuma aracı (Gemini function-calling), BAĞLAYICI YAZMA YOK (sayfaya yönlendirir). Portal-yönlü kısıt (SA satış/ST alım verisi göremez), araç hatası → nötr `unavailable` (bilgi sızmaz), kayan pencere (son 8 tur + tek özet), 90 gün TTL cron, kullanıcıya-scope'lu kalıcı oturum. Frontend: sağ-alt floating launcher + slide-over (Silver+ ∧ SA/ST). GOTCHA: Gemini 3 function-calling **thought signature** ZORUNLU — modelin functionCall part'ındaki `thoughtSignature` geri beslemede korunmazsa 400; ayrıca fnResponse turundan sonra boş user turu EKLEME (mesajı history'ye koy, prompt="").
- ✅ **Faz AI-1 (2026-07-24): Belge/fotoğraf → satın alma talebi formu BİTTİ** — `POST /company/ai/tender-extract` (+uploads/url, +tender-refine); girdi yönlendirici (metinli PDF→TEXT bedava çıkarım; taranmış/karışık PDF→Gemini'ye DOĞRUDAN inlineData ~258 tok/sayfa; foto→sharp ≤1500px, HEIC destekli); sayfa tavanı `AI_MAX_PAGES=20`; "bir kez oku, JSON'la konuş" (refine belgeyi yeniden okumaz); AI çıktısı shared-limits sanitizer'dan geçer (geçmeyen null+flag), vision'da miktar/birim/tarih/para birimi varsayılan işaretli; KDV-dahil uyarısı; prompt-injection sınırı (<belge> VERİ + şema-kısıtlı çıktı); wizard'a giriş noktası "Belgeden Doldur (AI)" + AiFlagsBanner + refine kutusu. AI satın alma talebi AÇMAZ — oluşturma normal kapılardan. NOT: `pnpm test` artık `NODE_OPTIONS=--experimental-vm-modules` ile koşar (pdfjs fake-worker dynamic import); tek spec koşarken de bu env gerekli: `NODE_OPTIONS=--experimental-vm-modules npx jest <spec>`.
- ✅ **Faz AI-0 (2026-07-24): AI altyapısı BİTTİ** — Gemini adapter (sağlayıcı-soyut `BaseAiProvider`), USD-bazlı firma bütçesi (Silver $6 / Gold $25, takvim ayı UTC), ön-rezervasyon + FOR UPDATE (yarış kapalı), tavanlar (kullanıcı %50, günlük %25, istek-başı %5, premium alt-bütçe %20), model yükseltme = KOD kararı (eşik/feature/retry — kullanıcı seçemez), `/company/ai/usage` + `ayarlar/ai-kullanim` ekranı (yalnız yüzde). `GEMINI_API_KEY` yoksa AI kapalı (503, prod'da gürültülü); fiyat tablosu `apps/api/src/modules/ai/ai.config.ts`, her satır costUsd snapshot. AI-1/AI-2 özellikleri `AiService.callAi` kapısından geçecek.
- ✅ **Excel ile kalem içe aktarma — Faz 1 (2026-08-22):** AI'sız, deterministik, her pakete açık. `GET /company/listing-item-import/template` (xlsx: Kalemler + Nasıl Doldurulur + Örnek; SATIS+KALEM'de taban/hemen-al sütunları) + `POST .../parse` (base64 gövde ≤5MB, xlsx/csv, yalnız ÖNİZLEME döner — satır-hata listesi; yazmaz). Sütun tanımı TEK KAYNAK `@rothern/shared` `item-import.ts` (başlık/alias/limit). Web: Kalemler adımında "Excel ile İçe Aktar" (önizleme → ekle/değiştir). AI "Belgeden Doldur" artık serbest Excel/CSV'yi de okur (router: sheet→metin tablo, TEXT yolu). **Faz 2 (2026-08-22) BİTTİ — tedarikçi fiyat içe aktarma:** `GET /company/listings/:id/bid-import/template` (satın alma talebine özel xlsx: kalemler ön-dolu + GİZLİ ItemId, yalnız fiyat/para birimi/teslim/not açık; AI'sız, her paket) + `POST .../bid-import/parse` (ItemId ile KESİN eşleme) + `POST /company/ai/bid-price-extract` (Silver+, feature `bid_price_extract`; model yalnız belge SATIRLARINI okur, fiyat uyduramaz; EŞLEŞTİRME KODDA `bid-matching.ts`: kod→ad→Dice/kapsama benzerliği ≥0.85 high / ≥0.60 medium / model ipucu ≥0.35; toplam÷miktar türetme, miktar/birim/para birimi/KDV uyarıları; teslim metni→BidDeliveryTime). Sözleşme `@rothern/shared bid-import.ts` (`BidImportResult`: her kalem için match + unmatchedDocRows + notices). Web: teklif-ver "Kalem Fiyatları" başlığında "Excel Şablonu ile Fiyatla" + "Belgeden Fiyatla (AI)" → tek önizleme dialog'u (güven rozeti, elle eşleme, uygula-kutusu) → yalnız itemState dolar; gönderme normal akış. Hiçbir uç teklif YAZMAZ.
- AI agent layer (event-bus, MCP entegrasyonu, action endpoint'leri `/api/agents/v1/...`)
- "Tercihlerimi Getir" preset, "Önceki Satın Alma Taleplerinden Ekle" template
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
