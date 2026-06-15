# Supkeys — Bağlam Dosyası

## Proje
**Supkeys**, AI destekli e-procurement & e-ihale SaaS platformu. PratisPro/SAP Ariba tarzı B2B; alıcılar için RFQ/teklif toplama/açık eksiltme/kazandırma/sipariş, tedarikçiler için davet kabul/teklif verme. V1 hedefi: 3 ay içinde RFQ flow'u tamamlanmış, üretime hazır iskelet.

## Marka
Mavi & beyaz · Inter (UI) + Plus Jakarta Sans (display) · "S" mavi kutu + lacivert/mavi dual-tone · AI agent katmanı V3'te aktif olacak.

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
apps/api      NestJS         port 4000  api.supkeys.com
apps/web      Next.js        port 3000  app.supkeys.com  (tenant + supplier rotaları)
apps/admin    Next.js        port 3001  admin.supkeys.com
packages/db       @supkeys/db        Prisma schema + migrations + seed + scripts
packages/shared   @supkeys/shared    Zod + types + helpers (slug, short-code, tender-number)
packages/email    @supkeys/email     React Email templates + Resend provider
```

## Test Hesapları (Dev)

> ⚠️ **Güvenlik notu:** Aşağıdaki parolalar **sadece lokal dev** içindir. Repo public olursa bu blok kaldırılmalı veya `CLAUDE.md.local` (gitignore'lı) varyantına taşınmalı.

| Tip | URL | E-posta | Şifre |
|-----|-----|---------|-------|
| Tenant | localhost:3000/login | ugur@demo.com | demo12345 |
| Admin | localhost:3001/admin/login | admin@supkeys.com | admin12345 |
| Supplier | localhost:3000/supplier/login | demo-supplier@firma.com | Test1234 |

E-postalar Resend `onboarding@resend.dev` test domain'inden gerçekten gönderilir — kullanıcı kayıtlı gerçek bir adres olmalı (test için kendi adresini kullan).

## Servis Başlatma
```bash
pnpm dev   # turbo, hepsi paralel
# veya tek tek:
pnpm --filter @supkeys/api dev
pnpm --filter @supkeys/web dev
pnpm --filter @supkeys/admin dev
```
Yan servis yok — Supabase Postgres, Supabase Auth, Cloudflare R2, Resend hepsi managed.

## Önemli Mimari Kararlar

1. **3 ayrı auth alanı:** Tenant (`apps/web /dashboard`), Admin (`apps/admin`), Supplier (`apps/web /supplier`). JWT payload'ında `type: "tenant" | "admin" | "supplier"`. Her tarafın kendi store'u + axios instance + 401 redirect interceptor.
2. **Multi-tenant veri izolasyonu:** Tüm sorgular tenantId scope'unda, servis seviyesinde filtrelenir.
3. **Buyer self-register YOK:** Alıcı sadece demo görüşmesi → admin'in gönderdiği davet linkiyle kayıt olabilir; e-posta verify sonrası admin manuel onay verir, otomatik onay yoktur.
4. **Tedarikçi self-register VAR** (admin onayıyla); zaten kayıtlı tedarikçinin yeni alıcı daveti kabulü → direkt `ACTIVE`.
5. **Kapalı zarf:** Tedarikçiler birbirinin tekliflerini ASLA göremez. Alıcı her zaman görür. `/supplier/tenders/:id` response'ı `invitations`/`bids`/`bidStats` field'ları içermez; sadece `myInvitation` + `myBid`.
6. **SUBMITTED bid editlenmez** (alıcıyla iletişim mesajı + Geri Çek). Alıcı eleme yaparsa LOST → tedarikçi yeniden teklif verebilir (version++).
7. **Kazandırma kalıcı:** Toplu (tek tedarikçi, tüm kalemler) veya Kalem Bazlı (her kalem ayrı tedarikçi). Finalize edilince Tender → AWARDED + Order'lar (`ORD-YYYY-NNNN`). V1'de geri alma YOK.
8. **V1 sadece RFQ:** İngiliz Usulü açık eksiltme V2'de.
9. **Body parser 25MB:** Vergi levhası + tender/bid attachment base64 (V2'de R2 presigned URL).
10. **Audit log append-only**, AI agent event-bus altyapısı V3'te (Kafka/RabbitMQ).

## Konvansiyonlar
- Form validation: react-hook-form + zod (frontend), class-validator (backend DTO)
- Hata mesajları Türkçe (kullanıcı yüzü)
- `<Field error={...} hint={...}>` ile sarmalama
- Button variants: primary | secondary | ghost · sizes: sm | md | lg
- Toast: sonner top-right, richColors
- `<RequireAuth>` / `<RequireAdminAuth>` / `<RequireSupplierAuth>` boundary
- Component yolu: `@/components/{ui,brand,providers,dashboard,tenders,orders}/*`
- API çağrıları: `useMutation` / `useQuery` (TanStack Query) + axios instance
- Auth state: Zustand persist (localStorage keys: `supkeys-auth`, `supkeys-admin-auth`, `supkeys-supplier-auth`)

## Geliştirme Notları
- **NestJS CLI watch modu WSL'de bozuk.** `apps/api/package.json` `dev` script'i `concurrently` + `tsc -w` + `nodemon` kullanır. `nest start --watch` KULLANMAYIN.
- **Prisma `.env` symlink:** `packages/db/.env` → `../../.env`. Migration komutları için gerekli.
- **Tailwind v4:** `tailwind.config.ts` YOK, tema `globals.css`'te `@theme { ... }` ile.
- **`.env`'de `INITIAL_ADMIN_*`** seed için kullanılır (production'da kaldırılır).
- **Schema değişikliği:** `pnpm --filter @supkeys/db migrate` (dev) → `migrate:deploy` (prod). Manuel SQL gerektiğinde migration klasörüne yaz, `_journal.json` güncelle.
- **DB cleanup:** `pnpm --filter @supkeys/db cleanup-pending-relations` legacy `PENDING_TENANT_APPROVAL` kayıtlarını ACTIVE'e çevirir.

## Token İzolasyonu
JWT payload `type` field'ıyla doğrulanır. Tenant token → admin/supplier endpoint = 401 "Geçersiz token tipi". Aynı şekilde diğer kombinasyonlar. Cross-token testleri yapıldı.

---

## Test & Kalite Durumu

- **Test sayısı:** 534 test, 25 suite — Supabase Auth geçişi (2026-05-19/20) sonrası bcrypt mock'ları kırık. Login/register/password servisleri `SupabaseAuthService` bridge'i bekliyor, mock güncellenmedi. **Smoke test manuel doğrulandı** (admin/tenant/supplier login → JWT alındı, generic 401 davranışı korundu). V2.7'de test paketi refactor edilmeli.
- **Coverage (geçiş öncesi):** Kritik dosyalarda %85-100 (auth, permissions, controllers)
- **Test DB:** İzole `supkeys_test`
- **Komutlar:**
  ```bash
  pnpm test              # tüm testler (şu an kırık — V2.7'de fix edilecek)
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
- ⏳ Bekleyen: Structured logger (Pino + redact), Sentry, alert webhook, audit_logs populate, CSP (helmet), V2 httpOnly cookie auth

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

## Bekleyen

### V1.5 (kısa vadeli)
- Hosting / production setup (Coolify + Hetzner, Docker image with Chromium pre-installed for PDF)
- Sipariş üzerinde mesajlaşma
- Sipariş listesi gelişmiş filtreleme/arama
- Admin dashboard KPI'ları (demo + buyer + supplier stats agregasyonu)

### V2 (orta vadeli)
- Resend domain doğrulaması + webhook tracking
- STANDARD → PREMIUM upgrade akışı + ödeme (Iyzico/Stripe)
- Tedarikçi havuzu sayfası
- Profil düzenleme + logo upload
- **Alıcı (tenant) firma profili:** Alıcı tarafında firma profili sayfası (tedarikçideki profil/logo akışına benzer). `/dashboard` içinde firma bilgisi + logo + tanıtım. (İstendi 2026-06-15.)
- **Yurtdışı şirket kaydı:** Yabancı (TR dışı) firmaların kayıt olabilmesi. Şu an kayıt TR'ye varsayılı (10-11 haneli VKN/TC, il/ilçe TR locations, vergi dairesi). Ülke seçimi + ülkeye göre vergi no/format esnetme + adres modeli (state/province) + i18n gerekir. (İstendi 2026-06-15.)
- SMS doğrulama, password reset
- Multi-language (EN)
- Kayıt UX 6 haneli kod
- İngiliz Usulü açık eksiltme
- Excel kalem import
- Açık ihale (PUBLIC visibility) + tedarikçi başvuru sistemi (V2-7)
- Kategoriye göre e-mail bildirim (V2-7)
- **Test paketi refactor (V2-7):** 534 testin bcrypt mock'ları `SupabaseAuthService` bridge'i ile uyumsuz. Login/register/password mgmt test'leri Supabase auth.users mock'larıyla yeniden yazılmalı. Smoke-test E2E paketi de güncellenecek.
- **Apply form `password` alanı temizliği (V2-7):** Buyer/Supplier başvurusunda kullanıcı şifre giriyor ama backend hash'i discard ediyor (Supabase reset-link akışı). DTO + frontend form'dan `password` field'ı kaldırılabilir; aksi halde wonky UX (kullanıcı yazıyor ama kullanılmıyor).
- Eleme/Kazandırma geri alma
- Hatırlatma e-postası özel süre
- WebSocket real-time bildirim

### V3 (uzun vadeli)
- AI agent layer (event-bus, MCP entegrasyonu, action endpoint'leri `/api/agents/v1/...`)
- "Tercihlerimi Getir" preset
- "Önceki İhalelerden Ekle" template
- Akıllı şartname motoru
- Manipülasyon tespiti

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
- Repo: `git@github.com:ugur-062/supkeys.git`
- Branch: `main`
- Her özellikten sonra commit + push.
- WIP commit'leri OK (oturum sonlarında), ama main'e push etmeden önce squash veya rebase düşün.
