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
3. **Prisma şeması** — `Tenant`, `User` (UserRole: COMPANY_ADMIN/BUYER/APPROVER), `PlatformAdmin` (AdminRole: SUPER_ADMIN/SALES/SUPPORT), `DemoRequest` (DemoRequestStatus: NEW/CONTACTED/DEMO_SCHEDULED/DEMO_DONE/WON/LOST/SPAM)
4. **Backend modülleri:**
   - `health` — `GET /api/health` (DB ping)
   - `auth` — `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` (JWT, bcrypt rounds=12, 7d expiry)
   - `admin-auth` — `POST /api/admin/auth/login`, `GET /api/admin/auth/me`
   - `demo-requests` — Public: `POST /api/demo-requests`. Admin: `GET /api/admin/demo-requests` (filtre/pagination), `GET /api/admin/demo-requests/stats`, `GET /api/admin/demo-requests/:id`, `PATCH /api/admin/demo-requests/:id`
5. **Seed:** `pnpm --filter @supkeys/db seed` ile Demo tenant + ilk SUPER_ADMIN oluşur (`admin@supkeys.com / admin12345`).
6. **Frontend (apps/web):**
   - Public landing (`/`)
   - Demo talep formu (`/demo-talep`) — react-hook-form + zod, success state, sonner toast
   - Login (`/login`) — email + password, "şifremi göster", validation
   - Korumalı dashboard placeholder (`/dashboard`) — kullanıcı bilgisi + firma kartı + token doğrulama
   - Auth: Zustand persist (`supkeys-auth` localStorage key) + axios interceptor (request: bearer token; response: 401 → auto-logout & /login redirect)
   - `RequireAuth` boundary, `AuthHydrationBoundary` (SSR/CSR mismatch önler)
7. **Frontend (apps/admin):**
   - Next.js 15 + Tailwind v4 admin paneli kuruldu, port 3001
   - Koyu sidebar (slate-900) + açık içerik (slate-50) tema, brand mavi accent, kırmızı "Admin" pill rozeti
   - `/admin/login` — email + password formu, react-hook-form + zod, sonner toast
   - Korumalı `/admin/dashboard` — `AdminShell` (sol sidebar nav + üst header + content), placeholder KPI kartları, token doğrulama
   - Korumalı `/admin/demo-requests` — KPI cards (Toplam/Yeni/Demo Yapıldı/Kazanıldı), filters bar (search + status + temizle, URL search params ile sync), tablo (firma/kişi/email/statü/atanmış/tarih + detay), pagination, Radix Dialog tabanlı sağdan açılan detay drawer (statü güncelleme + closedReason WON/LOST/SPAM'da, notlar). TanStack Query cache invalidation, sonner toast
   - Sidebar'da "Demo Talepleri" item aktif; NEW sayısı kırmızı badge olarak görünür (stats endpoint'inden)
   - Auth: AYRI Zustand store (`supkeys-admin-auth` localStorage key) + AYRI axios instance
   - `RequireAdminAuth` boundary, `AuthHydrationBoundary`, root `/` token'a göre login/dashboard'a redirect
   - Sidebar nav item'ları: Dashboard, Demo Talepleri (aktif); Müşteri Firmaları / Tedarikçiler / Ayarlar (yakında)
   - Bağımlılıklar: `@radix-ui/react-dialog`, `date-fns` (admin app'ine eklendi)

### ⏳ Sıradaki (Bu Sprint)
1. **Resend e-posta altyapısı** + admin'e yeni demo talebi bildirimi
2. Admin dashboard KPI'ları (`GET /admin/demo-requests/stats` kullan)

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
