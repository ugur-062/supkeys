# Supkeys — Claude Code Bağlam Dosyası

## Proje Tanımı
**Supkeys**, AI destekli e-satın alma (e-procurement) ve e-ihale platformudur. PratisPro/SAP Ariba tarzı bir B2B SaaS. Tedarikçi yönetimi, RFQ/teklif toplama, İngiliz usulü açık eksiltme, kazandırma, sipariş yönetimi ve raporlama.

## Marka
- İsim: **Supkeys**
- Renk: **Mavi & beyaz** (kurumsal kimlik)
- Tipografi: Inter (UI), Plus Jakarta Sans (display)
- Logo: "S" mavi kutu + "sup" lacivert + "keys" mavi
- AI agent entegrasyonu yol haritada (V3'te aktif olacak)

## Mimari Genel Bakış

### Monorepo Yapısı
- **Tool:** pnpm workspace + Turborepo
- **Konum:** `/home/noah/projects/supkeys`supkeys/
├── apps/
│   ├── api/      # NestJS backend (port 4000)
│   ├── web/      # Next.js tenant app (port 3000) — app.supkeys.com hedef
│   └── admin/    # Next.js admin panel (port 3001) — admin.supkeys.com hedef [HENÜZ KURULMADI]
├── packages/
│   ├── db/       # Prisma schema + client (@supkeys/db)
│   └── shared/   # Ortak Zod şemaları, tipler (@supkeys/shared)
├── docker-compose.yml
├── .env          # tüm değişkenler
└── pnpm-workspace.yaml

### Tech Stack
- **Backend:** NestJS 10, Prisma 6, PostgreSQL 16, Redis 7, JWT (passport-jwt), bcrypt, class-validator
- **Frontend:** Next.js 15 (App Router), React 19, **Tailwind CSS v4** (CSS'te `@theme` direktifi), TypeScript, Zustand (persist), TanStack Query, react-hook-form + zod, axios, sonner (toast), lucide-react
- **DB Container:** Postgres + Redis + MinIO (S3-uyumlu) docker-compose ile
- **Node:** 22.x, **pnpm:** 10.33.0

### Kritik Mimari Kararlar
1. **3 app'li yapı:** Tenant app (`apps/web`) ve Admin panel (`apps/admin`) ayrı subdomain'lerde çalışacak (`app.supkeys.com`, `admin.supkeys.com`). Backend ortak (`api.supkeys.com`).
2. **İki tip auth:** `User` (tenant kullanıcısı) ve `PlatformAdmin` (Supkeys ekibi). JWT payload'ında `type: "tenant" | "admin"` field'ı ile token izolasyonu sağlanmış. Bir tarafın token'ı diğer endpoint'lere geçmiyor.
3. **Multi-tenant:** Her `User` bir `Tenant`'a bağlı. Veri izolasyonu ileride row-level security veya servis seviyesinde tenant_id filtresi ile yapılacak.
4. **Audit log append-only** olacak (henüz tablo yok, V3 öncesi gelecek).
5. **AI agent altyapısı:** V1'den event-bus hazır olsun (Kafka/RabbitMQ — şu an yok, sonra eklenecek). Agent action endpoint'leri `/api/agents/v1/...` namespace'inde olacak.

## Mevcut Durum (Bu Dosya Yazıldığında)

### ✅ Tamamlanan
1. **Monorepo iskeleti** — pnpm + turbo + tsconfig.base.json
2. **Docker Compose** — Postgres + Redis + MinIO çalışıyor
3. **Prisma şeması** — `Tenant` (yeni opsiyonel firma profil alanları: industry/city/district/addressLine/postalCode/taxNumber unique/taxOffice), `User` (UserRole: COMPANY_ADMIN/BUYER/APPROVER), `PlatformAdmin` (AdminRole: SUPER_ADMIN/SALES/SUPPORT), `DemoRequest` (NEW/CONTACTED/DEMO_SCHEDULED/DEMO_DONE/WON/LOST/SPAM), `EmailLog`, `BuyerApplication` + `SupplierApplication` (ApplicationStatus: PENDING_EMAIL_VERIFICATION/PENDING_REVIEW/APPROVED/REJECTED), `Supplier` (membership: STANDARD/PREMIUM — eski BRONZE/SILVER yeniden adlandırıldı, migration: `rename_membership_enum_to_standard_premium`) + `SupplierUser`, `SupplierTenantRelation` (RelationStatus: ACTIVE/PENDING_TENANT_APPROVAL/BLOCKED), `SupplierInvitation` (InvitationStatus: PENDING/ACCEPTED/EXPIRED/CANCELLED), `CompanyType` enum (JOINT_STOCK/LIMITED/SOLE_PROPRIETOR)
4. **Backend modülleri:**
   - `health` — `GET /api/health` (DB ping)
   - `auth` — `POST /api/auth/login`, `GET /api/auth/me` (JWT, bcrypt rounds=12, 7d expiry). `POST /auth/register` KALDIRILDI — kayıt artık `/registration/...` endpoint'leri üzerinden, admin onayıyla
   - `admin-auth` — `POST /api/admin/auth/login`, `GET /api/admin/auth/me`
   - `demo-requests` — Public: `POST /api/demo-requests`. Admin: `GET /api/admin/demo-requests` (filtre/pagination), `GET /api/admin/demo-requests/stats`, `GET /api/admin/demo-requests/:id`, `PATCH /api/admin/demo-requests/:id`
   - `registration` — Public 3 akış: `POST /api/registration/buyer/applications`, `POST /api/registration/supplier/applications?invitation={token}`, `POST /api/registration/verify-email`, `GET /api/registration/{buyer|supplier}/applications/:id/status`. E-posta doğrulama (24 saat token), service-level + DB-level dedupe (aynı e-posta için bekleyen başvuru engeli)
   - `admin-applications` — Admin: `/api/admin/buyer-applications` ve `/api/admin/supplier-applications` (list/filter, stats, detail, approve, reject). Approve transactional: buyer → Tenant + User(COMPANY_ADMIN); supplier → Supplier(BRONZE) + SupplierUser + (varsa) SupplierTenantRelation(ACTIVE) + invitation→ACCEPTED. Slug otomatik: companyName → Türkçe latinize → benzersizlik kontrolü (`@supkeys/shared` `generateSlug` + `uniqueSlug`)
   - `tenant-suppliers` — Tenant: `/api/tenants/me/supplier-invitations` (POST/list/detail/resend/cancel). RolesGuard ile COMPANY_ADMIN role kısıtı (BUYER/APPROVER → 403). Token sha256 hash olarak saklanır, ham token sadece e-postada; 7 gün geçerli
5. **Seed:** `pnpm --filter @supkeys/db seed` ile Demo tenant + ilk SUPER_ADMIN oluşur (`admin@supkeys.com / admin12345`).
6. **Frontend (apps/web):**
   - Public landing (`/`)
   - Demo talep formu (`/demo-talep`) — react-hook-form + zod, success state, sonner toast
   - Login (`/login`) — email + password, "şifremi göster", validation
   - Tenant dashboard layout (modernized): collapsible sidebar with 10 routes (8 placeholder + 1 dashboard + Profil footer link), Stripe/Vercel-style premium look, rich KPI cards with trend pills, gradient onboarding checklist with time estimates, empty panels with CTAs
   - `/dashboard` (gerçek): greeting (firstName + tenant + Aktif yeşil pill + bugünün tarihi `d MMMM yyyy, EEEE` TR locale), 4 KPI kartı (Aktif İhaleler/brand, Onay Bekleyen/warning, Bu Ay Tasarruf/success, Tedarikçiler/indigo — boş veride "—" + "Henüz veri yok" pill, hover -translate-y-0.5 shadow-md), gradient onboarding (brand-50 → white → indigo-50/40, 3 adım + süre rozetleri 2dk/5dk/1dk + outline CTA buttons), 2 boş panel (Yaklaşan İhaleler / Son Aktiviteler — büyük yumuşak ikon dairesi + CTA)
   - 9 placeholder rota: `ihaleler`, `ihaleler/yeni`, `teklifler` (yeni), `onay-bekleyenler`, `siparisler`, `tedarikciler`, `raporlar`, `ayarlar`, `profil` (yeni) — `PlaceholderPage` ortak komponenti (`iconKey` string ile Server→Client güvenli, "Yakında V2" pill, highlights, dashboard'a dön)
   - Sidebar nav config tek dosyada (`lib/dashboard/nav-config.ts`): "Operasyonel" (Dashboard, İhaleler, Teklifler, Yeni İhale Aç CTA, Onay Bekleyenler badge, Siparişler), "Yönetimsel" (Tedarikçiler, Raporlar, Ayarlar) + footer'da Profil link. Aktif state gradient bg-brand-50/40 + sol kenar 3px brand-600 indicator + iç gölge, "Yeni İhale Aç" brand-600→700 gradient CTA shadow-lg hover, footer kullanıcı kartı avatar + yeşil online dot
   - Header: backdrop-blur, sayfa başlığı font-display text-xl + üstünde küçük slate-400 breadcrumb chain, search slate-50 bg focus:bg-white shadow-sm, bell + Radix dropdown user menu (avatar + ad + e-posta + tenant pill, Profilim/Ayarlar/Çıkış)
   - `DashboardShell` (sidebar + header + content), `app/dashboard/layout.tsx` `RequireAuth` ile sarmalı, mobil hamburger + drawer
   - Sidebar toggle: kenarda yuvarlak 24px chevron butonu (Stripe pattern), state localStorage'a persist
   - Auth: Zustand persist (`supkeys-auth` localStorage key) + axios interceptor (request: bearer token; response: 401 → auto-logout & /login redirect)
   - `RequireAuth` boundary, `AuthHydrationBoundary` (SSR/CSR mismatch önler)
   - Bağımlılıklar: `@radix-ui/react-tooltip`, `@radix-ui/react-dropdown-menu`, `date-fns` eklendi
7. **Frontend (apps/admin):**
   - Next.js 15 + Tailwind v4 admin paneli kuruldu, port 3001
   - Koyu sidebar (slate-900) + açık içerik (slate-50) tema, brand mavi accent, kırmızı "Admin" pill rozeti
   - `/admin/login` — email + password formu, react-hook-form + zod, sonner toast
   - Korumalı `/admin/dashboard` — `AdminShell` (sol sidebar nav + üst header + content), placeholder KPI kartları, token doğrulama
   - Korumalı `/admin/demo-requests` — KPI cards (Toplam/Yeni/Demo Yapıldı/Kazanıldı), filters bar (search + status + temizle, URL search params ile sync), tablo (firma/kişi/email/statü/atanmış/tarih + detay), pagination, Radix Dialog tabanlı sağdan açılan detay drawer (statü güncelleme + closedReason WON/LOST/SPAM'da, notlar). TanStack Query cache invalidation, sonner toast
   - Korumalı `/admin/email-logs` — sistem tarafından gönderilen tüm e-postaların kaydı; filtreler (status / template / alıcı search), pagination, status badge (QUEUED/SENDING/SENT/FAILED), 5sn'de bir auto-refresh, detay drawer'da subject + alıcı + provider + provider message ID + payload JSON + errorMessage (varsa)
   - Sidebar'da "Demo Talepleri" item aktif; NEW sayısı kırmızı badge olarak görünür (stats endpoint'inden). "E-posta Logları" item de aktif
   - Auth: AYRI Zustand store (`supkeys-admin-auth` localStorage key) + AYRI axios instance
   - `RequireAdminAuth` boundary, `AuthHydrationBoundary`, root `/` token'a göre login/dashboard'a redirect
   - Sidebar nav item'ları: Dashboard, Demo Talepleri, E-posta Logları (aktif); Müşteri Firmaları / Tedarikçiler / Ayarlar (yakında)
   - Bağımlılıklar: `@radix-ui/react-dialog`, `date-fns` (admin app'ine eklendi)
8. **E-posta altyapısı:**
   - `packages/email` workspace paketi: React Email template'leri (10 toplam: `demo_request_received`, `demo_request_admin_alert`, `buyer_email_verification`, `supplier_email_verification`, `buyer_application_admin_alert`, `supplier_application_admin_alert`, `buyer_application_approved`, `supplier_application_approved`, `application_rejected` — buyer/supplier ortak, `supplier_invitation`), Resend + Mailpit (nodemailer SMTP) provider'ları, `createEmailClient(config)` factory, `renderEmail(spec)` helper (HTML + plain-text fallback). Tsc ile `dist/` build edilir
   - Mailpit container docker-compose'a eklendi (port 1025 SMTP, 8025 Web UI). Geliştirmede `EMAIL_PROVIDER=mailpit`
   - Backend `EmailModule` (apps/api): BullMQ kuyruğu (`email`, attempts=3, exponential backoff), `EmailQueue` producer, `EmailProcessor` worker, `EmailService` (provider client + EmailLog yazımı). Redis bağlantısı `REDIS_URL`'den parse
   - Demo talebi + registration akışlarında fire-and-forget e-posta tetiklenir (verification → admin alert on verify → approved/rejected on review)
   - Admin endpoint'leri: `GET /api/admin/email-logs` (filtre/pagination), `GET /api/admin/email-logs/:id`
   - `.env`'de `EMAIL_PROVIDER` (mailpit/resend), `MAILPIT_HOST/PORT`, `RESEND_API_KEY`, `EMAIL_FROM_NAME/ADDRESS/REPLY_TO`. Production geçişi: `EMAIL_PROVIDER=resend` + verified domain
9. **Kayıt sistemi (Aşama A — backend):**
   - 3 kayıt akışı: alıcı self, tedarikçi self (Premium kandidatı), tedarikçi davetli (alıcının daveti üzerinden)
   - Migration `add_registration_and_suppliers` — `BuyerApplication`/`SupplierApplication` (vergi levhası URL string, KVKK + terms onay zorunlu, password 8-72 + en az 1 büyük + 1 küçük + 1 rakam validation), `Supplier`, `SupplierUser`, `SupplierTenantRelation`, `SupplierInvitation`
   - Token üretimi: `crypto.randomBytes(32).toString("hex")` (64 karakter); SupplierInvitation'da sadece sha256 hash saklanır, ham token e-postada
   - E-posta doğrulama 24 saat geçerli, davet 7 gün geçerli; resend davet token'ı yeniler
   - Admin approval transactional: buyer → Tenant (slug otomatik üretilir) + User(COMPANY_ADMIN); supplier → Supplier(STANDARD) + SupplierUser + (davetli ise) SupplierTenantRelation(ACTIVE) + invitation status=ACCEPTED
   - 8 yeni e-posta şablonu (yukarıda)
   - Aşama B-C: frontend register formları + e-posta doğrulama callback sayfası + admin paneli "Başvurular" sayfaları gelecek
10. **Demo davet akışı (admin → kayıt linki, otomatik onay):**
    - `DemoRequest` modeline davet alanları: `inviteToken` (sha256 hash, unique), `inviteSentAt/SentToEmail/SentMessage/TokenExpAt/UsedAt/SentCount`, `linkedApplicationId` → `BuyerApplication` (1:1, "DemoToBuyerApp" relation). Migration: `add_demo_invite_fields`
    - Admin endpoint: `POST /api/admin/demo-requests/:id/send-invite { email, message? }` — sadece WON/DEMO_DONE'da; 14 gün geçerli token, sentCount++; `linkedApplicationId` varsa 409
    - Public endpoint: `GET /api/registration/buyer/invitation-info?token=...` → firma adı/iletişim/mesaj/expiresAt; 404/410/409 hata kodları
    - Buyer registration `POST /api/registration/buyer/applications?invitation=` query param ile davet token kabul eder; transaction içinde `BuyerApplication.create` + `DemoRequest.linkedApplicationId/inviteUsedAt` set
    - E-posta verify (`POST /api/registration/verify-email`): `BuyerApplication.fromDemoRequest` set ise admin onayı atlanır → otomatik `Tenant + User(COMPANY_ADMIN)` oluşur, `status=APPROVED`, `reviewedById=null` (sistem otomatik), "🎉 Hesabınız aktif" e-postası gönderilir; response'da `autoApproved: true, tenantId`
    - Yeni e-posta şablonu: `demo_to_register_invitation` (kişisel mesaj quote box'ı, "Hesap Oluştur" CTA, 14 gün uyarısı, brand-50 notice box)
    - Admin panel `/admin/demo-requests` detail drawer: WON/DEMO_DONE statüsünde "Davet Linki Gönder" butonu; Radix Dialog modal (e-posta editlenebilir + 500 karakter mesaj + 14 gün geçerli bilgi kutusu); davet gönderilmiş ise mavi bilgi kutusu (e-posta + tarih + sentCount) + "Yeniden Gönder"; kayıt tamamlanmış ise (`linkedApplicationId` var) yeşil "Kayıt tamamlandı" kutusu
11. **Brand & üyelik kademesi yenileme:**
    - Resmi Supkeys logoları projeye dağıtıldı: `apps/web/public/`, `apps/admin/public/` (favicon.ico, apple-touch-icon, supkeys-logo-full + white, supkeys-icon 7 boyut + white) + `packages/email/src/templates/_assets/` (full + 128 ikon)
    - `SupkeysLogo` (web + admin) artık `next/image` tabanlı, variant (`full`/`icon`/`full-white`/`icon-white`) + size (`sm`/`md`/`lg`/`xl`) + priority destekliyor; `AdminLogo` `SupkeysLogo`'yu sarıp "ADMIN" pill ekliyor (light variant koyu sidebar için)
    - Logo kullanım yerleri güncellendi: tenant landing/login/demo-talep/dashboard sidebar (collapsed → icon, expanded → full); admin login (dark variant) + admin sidebar (light variant)
    - Root layout `metadata`: title.template, description, icons (4 farklı boyut + apple-touch), OpenGraph (locale=tr_TR, image=full logo). Admin app icon set + robots noindex/nofollow
    - E-posta `Layout` component artık `process.env.WEB_URL`/supkeys-logo-full.png URL'iyle `<Img>` render ediyor (dev'de localhost:3000, prod'da gerçek domain)
    - Üyelik kademesi yeniden adlandırıldı: BRONZE → STANDARD, SILVER → PREMIUM (migration `rename_membership_enum_to_standard_premium`, manuel SQL ile mevcut data güvenli map'lendi). Tüm kod referansları + e-posta template metni ("Standart üyelik" / "Premium üyeliğe yükselterek") güncellendi

### ⏳ Sıradaki (Bu Sprint)
1. **Aşama B**: Frontend register sayfaları (3 form: alıcı self / tedarikçi self / tedarikçi davetli) + e-posta doğrulama callback sayfası
2. **Aşama C**: Admin panel "Başvurular" sayfaları (buyer-applications + supplier-applications listeleri + detail/approve/reject)
3. Admin dashboard KPI'ları (`GET /admin/demo-requests/stats` kullan)

### 🔮 Yol Haritası (Sonra)
- Tenant register sayfası (`/register`) — backend `POST /auth/register` zaten var
- Tenant dashboard'un gerçek layout'u (sidebar + KPI grid + ihale tablosu)
- Tedarikçi yönetimi modülü
- Kategori ağacı (UNSPSC tarzı, ~14k satır)
- İhale/RFQ modülü
- Teklif toplama, açık eksiltme
- Kazandırma, sipariş
- AI agent altyapısı

## Geliştirme Akışı

### Servisleri Başlatma
```bashContainer'lar
docker compose up -dAPI (terminal 1)
pnpm --filter @supkeys/api dev
→ http://localhost:4000/apiWeb (terminal 2)
pnpm --filter @supkeys/web dev
→ http://localhost:3000Admin (terminal 3, kurulduktan sonra)
pnpm --filter @supkeys/admin dev
→ http://localhost:3001

### Önemli Notlar
- **NestJS CLI watch modu WSL'de bozuk.** `apps/api/package.json` `dev` script'i `concurrently` ile `tsc -w` + `nodemon` kullanır. `nest start --watch` KULLANMAYIN.
- **Prisma `.env` symlink:** `packages/db/.env` → `../../.env` symlink. Migration komutları için gerekli. Yeni migration'da bu kalır.
- **Tailwind v4:** `tailwind.config.ts` YOK, tema `apps/web/src/app/globals.css` içinde `@theme { ... }` ile tanımlı. `apps/admin` için yeni `globals.css` yazılırken bu yapı korunmalı (admin için koyu tema renkleri eklenecek).
- **`.env`'de `INITIAL_ADMIN_*` değişkenleri** seed için kullanılır. Production'da kaldırılır.

### Test Edilmiş Auth Akışları
```bashTenant
curl -X POST http://localhost:4000/api/auth/register -H "Content-Type: application/json" 
-d '{"email":"x@y.com","password":"demo12345","firstName":"X","lastName":"Y","companyName":"Y","companySlug":"y-slug"}'curl -X POST http://localhost:4000/api/auth/login -H "Content-Type: application/json" 
-d '{"email":"ugur@demo.com","password":"demo12345"}'
→ { token, user: { id, email, firstName, lastName, role: "COMPANY_ADMIN", tenant: { id, name, slug } } }Admin
curl -X POST http://localhost:4000/api/admin/auth/login -H "Content-Type: application/json" 
-d '{"email":"admin@supkeys.com","password":"admin12345"}'
→ { token, admin: { id, email, firstName, lastName, role: "SUPER_ADMIN" } }

### Token İzolasyonu
JWT payload'ında `type: "tenant"` veya `type: "admin"` var. Tenant token'ı admin endpoint'inde, admin token'ı tenant endpoint'inde **401 "Geçersiz token tipi"** alır. Bu test edildi, çalışıyor.

## Kod Stili & Konvansiyonlar
- **Form validation:** react-hook-form + zod (frontend), class-validator (backend DTO)
- **Hata mesajları Türkçe:** kullanıcıya görünen tüm metinler TR
- **Field component:** `<Field error={...} hint={...}>` ile sarmalama
- **Button variants:** primary | secondary | ghost; size: sm | md | lg
- **Toast:** sonner, top-right, richColors
- **Korumalı sayfa:** `<RequireAuth>` boundary ile sarmala
- **Component yolu:** `@/components/ui/*`, `@/components/brand/*`, `@/components/providers/*`
- **API çağrıları:** `useMutation`/`useQuery` (TanStack Query) + `api` axios instance
- **Auth state:** Zustand store, `useAuth()` hook ile erişim

## Kullanıcı Hesapları (Geliştirme)
- **Tenant:** `ugur@demo.com / demo12345` (tenant: Demo Şirket / demo-firma, role: COMPANY_ADMIN)
- **Admin:** `admin@supkeys.com / admin12345` (role: SUPER_ADMIN)

## Git
- Repo: `git@github.com:ugur-062/supkeys.git`
- Branch: `main`
- Her özellikten sonra commit + push.
