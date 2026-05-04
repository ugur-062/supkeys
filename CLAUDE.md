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
10. **Demo davet akışı (admin → kayıt linki):**
    - **Mimari karar:** Alıcı self-register YOKtur. Alıcı sadece demo görüşmesi → admin'in gönderdiği davet linkiyle kayıt olabilir, e-posta verify sonrası admin manuel onayı bekler. (Tedarikçi self-register var; ikisinde de otomatik onay yok.)
    - `DemoRequest` modeline davet alanları: `inviteToken` (sha256 hash, unique), `inviteSentAt/SentToEmail/SentMessage/TokenExpAt/UsedAt/SentCount`, `linkedApplicationId` → `BuyerApplication` (1:1, "DemoToBuyerApp" relation). Migration: `add_demo_invite_fields`
    - Admin endpoint: `POST /api/admin/demo-requests/:id/send-invite { email, message? }` — sadece WON/DEMO_DONE'da; 14 gün geçerli token, sentCount++; `linkedApplicationId` varsa 409
    - Public endpoint: `GET /api/registration/buyer/invitation-info?token=...` → firma adı/iletişim/mesaj/expiresAt; 404/410/409 hata kodları
    - Buyer registration `POST /api/registration/buyer/applications?invitation=` query param ile davet token kabul eder; transaction içinde `BuyerApplication.create` + `DemoRequest.linkedApplicationId/inviteUsedAt` set. Davet token'ı OPSIYONEL DEĞİL — frontend `/register/buyer` davet token olmadan açıldığında `/demo-talep`'e redirect eder
    - E-posta verify (`POST /api/registration/verify-email`): TÜM buyer başvuruları (self veya demo davetli) `status=PENDING_REVIEW` olur — auto-approve YOK. Admin manual onayıyla `Tenant + User(COMPANY_ADMIN)` oluşur. `BuyerApplication.fromDemoRequest` ilişkisi sadece admin paneldeki başvuru detayında "demo davetli" rozetini göstermek için tutuluyor
    - Yeni e-posta şablonu: `demo_to_register_invitation` (kişisel mesaj quote box'ı, "Hesap Oluştur" CTA, 14 gün uyarısı, brand-50 notice box, "bilgilerinizi inceledikten sonra hesabınızı aktive edeceğiz" — auto-approve VAADİ YOK)
    - Admin panel `/admin/demo-requests` detail drawer: **buton tabanlı akış** (statü dropdown'u kaldırıldı). Statüye göre aksiyon paneli:
      - `NEW`: [Demo Yapıldı] (primary) + [Reddet] (kırmızı outline). Demo Yapıldı → PATCH `status=DEMO_DONE`
      - `DEMO_DONE` & `linkedApplicationId` yok: [Davet Linki Gönder / Yeniden Gönder] + [Reddet]
      - `DEMO_DONE` & `linkedApplicationId` var: yeşil "Kayıt tamamlandı, başvuru admin onayını bekliyor" + [Kazanıldı olarak işaretle] CTA → PATCH `status=WON`
      - `WON` / `LOST` / `SPAM`: salt bilgi (badge + closedReason etiketi insan diline çevrilmiş — `NOT_INTERESTED` → "Demo gerçekleşti, ilgilenmediler", "" → gizli, freetext olduğu gibi gösterilir)
      - `CONTACTED` / `DEMO_SCHEDULED` (legacy, yeni akışta üretilmiyor): sarı uyarı kutusu + [Demo Yapıldı] + [Reddet] CTA'ları
    - Reddet modal'ı (`reject-demo-modal.tsx`): Radix Dialog, 3 radio (Spam → `status=SPAM, closedReason=""`; "Demo gerçekleşti, ilgilenmediler" → `status=LOST, closedReason="NOT_INTERESTED"`; "Diğer" → textarea zorunlu, `status=LOST, closedReason=freetext` max 500 char)
    - Send-invite modal bilgi kutusu güncellendi: "otomatik aktif olacak" → "başvuru incelemeye düşer, admin panelden manuel onay vereceksiniz" (auto-approve vaadi yok)
12. **Kayıt sistemi (Aşama B — frontend):**
    - **Akış:** Alıcı = sadece demo + admin daveti yolu (self-register yok); Tedarikçi = self VEYA alıcı daveti. Her iki akışta da admin manuel onayı zorunlu, otomatik onay hiçbir senaryoda yok
    - 3 public rota: `/register/buyer?invitation={token}` (token zorunlu, yoksa server-side `redirect("/demo-talep")`), `/register/supplier` (self) + `?invitation={token}` (alıcı daveti), `/register/verify-email?token=...&type=buyer|supplier`
    - 3 adımlı stepper: Firma Bilgileri → Yetkili → Tamamlandı (sticky header, mobile'da label gizli)
    - Tek `useForm<FullRegistration>` (zod resolver, `firmInfoSchema.merge(userInfoBase).refine(passwords match)`); step 1'de `FIRM_FIELDS`, step 2'de `USER_FIELDS` `trigger`. Step 3 success: TEK mesaj — "ekibimiz başvurunuzu inceleyecek, onay sonrası giriş yapabileceksiniz" (auto-approve mesajı yok)
    - `RegistrationLayout` (`apps/web/src/app/register/layout.tsx`): üst SupkeysLogo + "Giriş Yap" linki, footer KVKK + Hizmet Şartları
    - Komponentler `apps/web/src/components/registration/`: `stepper`, `step-firm-info`, `step-user-info`, `step-success`, `invitation-banner`, `file-upload` (react-dropzone, base64, 10MB), `password-strength` (3 bar), `address-fields` (TR il-ilçe `<select>`, il değişince ilçe reset), `terms-checkbox` (KVKK + Hizmet Şartları tek onay)
    - Şemalar `lib/registration/schemas.ts` + API helper `lib/registration/api.ts`. UI tek `termsAccepted` → backend `acceptTerms` + `acceptKvkk` ikilisine map eder
    - Buyer davet akışı: useQuery ile `buyer/invitation-info` çağrılır; 200 → banner + e-posta pre-fill + form; 404/410/409 → ErrorCard (form AÇILMAZ): 404 "Davet linki geçersiz" / 410 "Davet süresi dolmuş" / 409 "Bu davet zaten kullanılmış" — her birinde "Demo Talep Et" CTA (409'da "Giriş Yap")
    - Supplier davet akışı: aynı mantık ama davet OPSIYONEL — token yoksa form normal akışa düşer (self-register destekli)
    - Verify-email callback: `useRef` flag ile StrictMode double-effect guard; başarı → tek mesaj "doğrulandı, incelemeye alındı"; 410 → "Yeniden Başvur" CTA; 409 → "Giriş Yap"; 404 → "Anasayfa"
    - Backend: `GET /api/registration/supplier/invitation-info?token=` eklendi (404/410/409 hata kodları); `taxCertUrl` MaxLength 20MB; `app.useBodyParser("json", { limit: "20mb" })` (MinIO V2'de gerçek upload)
    - TR il-ilçe verisi: `packages/shared/src/data/turkey-locations.ts` — 81 il + ~970 ilçe, `getCityNames()` + `getDistrictsByCity(city)` helpers
    - Landing CTA: sadece "Tedarikçi Olarak Kayıt Ol" linki var (alıcılar `/demo-talep` yolundan girer); login formunda "Tedarikçi misiniz? Tedarikçi olarak kayıt ol" linki
    - Bağımlılıklar: `react-dropzone` eklendi (apps/web)
13. **Kayıt sistemi (Aşama C — admin başvuru yönetimi):**
    - 2 yeni admin sayfası: `/admin/buyer-applications` + `/admin/supplier-applications` (server component → `Suspense` → client view, `RequireAdminAuth` boundary)
    - 5'li KPI cards (Toplam / E-posta Bekliyor / İncelemede / Onaylanan / Reddedilen) + URL-sync filter bar (search + status, 300ms debounce, "Temizle") + tablo + pagination + 5sn refetchInterval
    - Buyer tablo kolonları: Firma / Yetkili / E-posta / Tip (kısa: A.Ş./Ltd./Şahıs) / Vergi No / Statü / Tarih / Detay
    - Supplier tablo: aynı + "Davet" kolonu — `📩 {tenantName}` (indigo pill) veya `Self` (slate pill)
    - Detay drawer (sağdan, `md:max-w-2xl`, sticky header + scroll içerik + sticky footer aksiyon): üst banner (buyer = sarı "🎯 Demo Davetli Başvuru" + bağlı demo'nun firma adı + `/admin/demo-requests` linki; supplier davetli = indigo "📩 {tenant} tarafından davet edildi" / supplier self = slate "Self Kayıt"), Firma Bilgileri (companyType label, vergi numarası mono, web sitesi link, Vergi Levhası tıklanabilir kart), Adres, Yetkili (e-posta kopyalanabilir), Süreç (createdAt + emailVerifiedAt + reviewedAt/reviewedBy + tenant/supplier link + rejectionReason kutusu + IP)
    - `TaxCertModal` (`apps/admin/src/app/admin/buyer-applications/_components/tax-cert-modal.tsx`, supplier drawer'dan da import edilir): max-w-4xl, base64 data URL parse (`useMemo` ile sadece açıkken), PDF → `<iframe>`, image → `<img>`, format desteklemiyorsa "İndir" CTA. Header'da "İndir" butonu (download attribute, dosya adı: companyName-slug + uzantı)
    - `ApproveDialog`: success-yeşil onay; buyer için "Demo {companyName} otomatik 'Kazanıldı' olarak işaretlenecek" notu (varsa); supplier için "Tenant ile aktif ilişki otomatik kurulacak" notu (davetli ise)
    - `RejectModal`: 4 hazır sebep dropdown (Şirket bilgileri / Vergi numarası / Vergi levhası / Sektör hizmet kapsamı dışı) + "Diğer" → textarea zorunlu (5-500 char). Hazır sebep + ek not seçilirse "{sebep} — {not}" şeklinde gönderilir. Backend `RejectApplicationDto` ile uyumlu (MinLength 5)
    - Sticky bottom aksiyonlar: PENDING_REVIEW → [Onayla] (success-600) + [Reddet] (kırmızı outline); PENDING_EMAIL_VERIFICATION → sarı bilgi notu, aksiyon yok; APPROVED/REJECTED → bilgi gösterimi, aksiyon yok
    - Hooks: `use-buyer-applications.ts` + `use-supplier-applications.ts` (TanStack Query, list/detail/stats/approve/reject; approve sonrası demo-requests query'leri de invalidate edilir)
    - Sidebar `Başvurular` parent grubu (icon `ClipboardList`, slate-400 başlık) + 2 child (`Alıcı Başvuruları`, `Tedarikçi Başvuruları`) — child'larda PENDING_REVIEW kırmızı badge, parent'ta toplam badge
    - Backend ek: `admin-buyer-applications.service.approve()` artık `fromDemoRequest`'ı transaction içinde otomatik `WON` statüsüne geçirir + `closedAt` set eder (status zaten WON ise atlar). `findOne` artık `fromDemoRequest` (id + companyName + contactName + email + status) include ediyor
    - Tipler: `apps/admin/src/lib/applications/{types,status,company-type}.ts` (ApplicationStatus, CompanyType, REJECTION_REASONS sabiti, status meta + label/badgeClass map'leri)
14. **Brand & üyelik kademesi yenileme:**
    - Resmi Supkeys logoları projeye dağıtıldı: `apps/web/public/`, `apps/admin/public/` (favicon.ico, apple-touch-icon, supkeys-logo-full + white, supkeys-icon 7 boyut + white) + `packages/email/src/templates/_assets/` (full + 128 ikon)
    - `SupkeysLogo` (web + admin) artık `next/image` tabanlı, variant (`full`/`icon`/`full-white`/`icon-white`) + size (`sm`/`md`/`lg`/`xl`) + priority destekliyor; `AdminLogo` `SupkeysLogo`'yu sarıp "ADMIN" pill ekliyor (light variant koyu sidebar için)
    - Logo kullanım yerleri güncellendi: tenant landing/login/demo-talep/dashboard sidebar (collapsed → icon, expanded → full); admin login (dark variant) + admin sidebar (light variant)
    - Root layout `metadata`: title.template, description, icons (4 farklı boyut + apple-touch), OpenGraph (locale=tr_TR, image=full logo). Admin app icon set + robots noindex/nofollow
    - E-posta `Layout` component artık `process.env.WEB_URL`/supkeys-logo-full.png URL'iyle `<Img>` render ediyor (dev'de localhost:3000, prod'da gerçek domain)
    - Üyelik kademesi yeniden adlandırıldı: BRONZE → STANDARD, SILVER → PREMIUM (migration `rename_membership_enum_to_standard_premium`, manuel SQL ile mevcut data güvenli map'lendi). Tüm kod referansları + e-posta template metni ("Standart üyelik" / "Premium üyeliğe yükselterek") güncellendi
15. **Tenant tedarikçi yönetimi (Aşama D.1):**
    - `/dashboard/tedarikciler` placeholder kaldırıldı, yerine 3 tab'lı tam fonksiyonel sayfa: **Onaylı Tedarikçiler / Çağrılan Tedarikçiler (Davetler) / Engellenenler**. URL params: `?tab=approved|invitations|blocked`, `?search=`, `?invStatus=`, `?page=` (Suspense wrapped server component)
    - Header card: gradient (brand-50 → white → indigo-50/40), 3 madde açıklama + 2 CTA: "Tedarikçi Havuzu" (Yakında pill, disabled) + "Yeni Tedarikçi Davet Et" (COMPANY_ADMIN değilse disabled, tooltip)
    - Sekme başlıklarında count badge'leri: aktif sekme `border-brand-600 text-brand-700 bg-brand-50/30`, pasif `text-slate-500 hover:bg-slate-50`
    - **Tab 1 (Onaylı):** kolonlar Üyelik (STANDARD slate-100 / PREMIUM yellow-50 pill) / Firma + companyType / Vergi No / İletişim (primary user) / İlişki Tarihi / Detay. Boş state'te "İlk Tedarikçinizi Davet Edin" CTA
    - **Tab 2 (Davetler):** kolonlar E-posta / Yetkili / Statü (PENDING/ACCEPTED/EXPIRED/CANCELLED, geçmişse "Süresi Doldu") / Gönderildi / Geçerlilik (`formatDistanceToNowStrict tr`) / Aksiyon dropdown — PENDING'de [Yeniden Gönder + İptal Et], EXPIRED'da [Yeniden Davet Et], ACCEPTED'da kabul tarihi metni
    - **Tab 3 (Engellenen):** kolonlar Firma / Vergi No / Engelleme Sebebi (60 char truncate + tooltip) / Engellenme Tarihi / "Engeli Kaldır" butonu (window.confirm + inline POST `/unblock`)
    - **Davet modal (toplu):** Radix Dialog max-w-lg, virgül/noktalı virgül/satır sonu/boşluk ile bölünen e-posta parser (`parseEmails` lowercase + dedupe + email regex), validation pill'leri (yeşil = geçerli, kırmızı = format hatası veya `ALREADY_INVITED`/`ALREADY_SUPPLIER`), max 50 e-posta limit. Yetkili adı + 500 char mesaj + collapsible "E-posta Önizlemesini Göster" → iframe (`POST .../preview`, 500ms debounce). Submit POST `/batch`; karışık başarı/hata durumunda modal açık kalır, başarılı e-postalar input'tan çıkarılır, hatalılar pill'lerde sebep gösterir
    - **Engelleme modal:** sebep min 10 max 500 char, sarı uyarı kutusu ("ihalelerinize teklif veremez", "havuzda görünmeye devam eder", "tedarikçiye gösterilmez")
    - **Tedarikçi detay drawer (md:max-w-2xl):** sticky header (Building2 ikonu + companyName + taxNumber mono + Üyelik/RelationStatus pill'leri + "Tüm İşlemler" Radix DropdownMenu — ACTIVE'de [Engelle], BLOCKED'da [Engeli Kaldır]). Body: BLOCKED ise üstte kırmızı uyarı kutusu (sebep + tarih), ardından Firma Bilgileri / Adres / İletişim (e-posta kopyalanabilir) / İlişki bölümleri + 3 PlaceholderSection ("Yakında" pill — Performans / Kategori / İletişim Geçmişi)
    - Permission: `useAuthStore.user.role === "COMPANY_ADMIN"` → davet/block/unblock görünür; BUYER/APPROVER salt görüntüleme. Backend `RolesGuard("COMPANY_ADMIN")` ile koruma
    - **Backend ek (`apps/api/src/modules/tenant-suppliers`):**
      - Yeni `TenantSuppliersController` + service: `GET /api/tenants/me/suppliers` (`?status=ACTIVE|BLOCKED|PENDING_TENANT_APPROVAL&search=&page=&pageSize=`), `GET .../stats` ({total, active, blocked, pending}), `GET .../:id` (relationId üzerinden tenant-scoped detay), `POST .../:id/block` (reason min10), `POST .../:id/unblock`. Response her zaman `{relationId, relationStatus, blockedAt, blockedReason, supplier: {…, users[primary]}}` formatında
      - Mevcut `SupplierInvitationsController`'a 2 yeni endpoint: `POST .../batch` (≤50 emails, dedupe, per-row result `{email, success, invitationId|reason}` ve `summary`; mevcut PENDING davetli olanlar `ALREADY_INVITED`, aktif tedarikçi olanlar `ALREADY_SUPPLIER`); `POST .../preview` (`renderEmail("supplier_invitation")` ile fake `PREVIEW_TOKEN` üzerinden HTML üretir, frontend iframe'le gösterir)
    - Hooks: `use-tenant-suppliers.ts` + `use-supplier-invitations.ts` (TanStack Query); davet aksiyonları sonrası ilgili query key'leri invalidate eder
    - Tipler/lib: `apps/web/src/lib/tedarikciler/{types,status,membership,parse-emails}.ts`
    - Bağımlılıklar: `@radix-ui/react-tabs` + `@radix-ui/react-dialog` (apps/web)
16. **Tedarikçi paneli iskeleti (Aşama D.2.A):**
    - **Üçüncü auth alanı:** Tenant (`apps/web /dashboard`) ve Admin (`apps/admin`) yanına yeni `apps/web /supplier/*` alanı. JWT izolasyonu: payload `type: "supplier"` field'ı + `SupplierJwtStrategy` (`type !== "supplier"` → 401 "Geçersiz token tipi"). Üç store bağımsız: tenant `supkeys-auth`, admin `supkeys-admin-auth`, supplier `supkeys-supplier-auth` (Zustand persist localStorage)
    - Backend yeni modül `apps/api/src/modules/supplier-auth/`:
      - `POST /api/supplier-auth/login` — bcrypt rounds=12, timing-safe (yoksa dummy hash ile compare). 401: yanlış kimlik; 403: `supplier.isBlocked` (sebep ile) / `supplier.isActive=false` / `user.isActive=false`. Başarılı: `{token, supplierUser, supplier}` (membership, isActive, isBlocked dahil), `lastLoginAt` güncellenir
      - `GET /api/supplier-auth/me` (SupplierJwtAuthGuard) → `{supplierUser, supplier, tenantRelations[]}`. Her relation `{id, tenantId, tenantName, tenantSlug, status, blockedAt, blockedReason, createdAt}` formatında
      - `SupplierJwtStrategy.validate()` ek olarak `user.isActive`, `supplier.isActive`, `supplier.isBlocked` runtime kontrolleri yapar — engellenen tedarikçi token'ı her istekte 401 alır
    - Frontend (`apps/web`) yeni alan:
      - `/supplier/login` — public, Suspense yok, kendi hidrasyon mantığı (token varsa `/supplier/dashboard`'a redirect). SupkeysLogo + "Tedarikçi Girişi" başlığı + form. Footer'da "Hesabınız yok mu? → Tedarikçi olarak kayıt ol" + "Alıcı musunuz? → /login"
      - `/supplier/(authed)/` route group: `RequireSupplierAuth` → `SupplierShell` (sidebar + header + content). Group dışı `/supplier/login` public kalır
      - `/supplier/dashboard` — greeting (firstName + companyName + bugünün TR tarihi), 4 KPI (`Devam Eden Siparişler`/brand, `Kazandığınız İhaleler`/success, `Teklif Verdiğiniz İhaleler`/indigo, `Davet Edildiğiniz İhaleler`/warning — hepsi "—" + "Henüz veri yok" pill), onboarding card 3 adım ("Profilini Tamamla" `/supplier/profil`, "Müşterilerinle Bağlantı Kur" — `tenantRelations.length > 0` ise tamamlandı, "İhalelere Katıl" yakında), 2 boş panel (Bekleyen İhaleler / Son Aktiviteler)
      - `/supplier/profil` — CompanyInfoCard (Firma + Adres + Üyelik bölümleri, salt görünüm; STANDARD ise "Premium üyelik avantajları" upsell kutusu + disabled "Premium'a Yükselt"; "Düzenle" butonu disabled "Yakında"; alt notta `support@supkeys.com`) + TenantRelationsList (boş state veya satır listesi: Building2 ikonu + tenantName + bağlantı tarihi + RelationStatusBadge; BLOCKED'da kırmızı "Engelleme sebebi" satırı; alt panel "Yeni Davet Kodu Ekle" disabled "YAKINDA" — D.2.B'de aktif olacak)
      - `/supplier/{ihaleler,siparisler,ayarlar}` — `PlaceholderPage` (yeniden kullanılan tenant component'i; yeni `icon: LucideIcon` + `backHref` + `backLabel` props ile parametrik oldu) + supplier-spesifik highlights
    - SupplierShell (`apps/web/src/components/supplier-shell/`):
      - **Sidebar 240↔64 collapse**, kendi Zustand persist key `supkeys-supplier-sidebar`. Üstte CompanyCard (Building2 placeholder logo + companyName + Üyelik badge: STANDARD slate / PREMIUM yellow, Award ikonu); collapsed modda sadece logo + 7×5 mini badge (tooltip ile firma + üyelik). Menu (5 item, gruplar yok): Ana Sayfa / İhaleler [yakında] / Siparişler [yakında] / Profilim / Ayarlar [yakında]. Aktif item `bg-brand-50 text-brand-700` + sol kenar 3px `brand-600` indicator
      - **Header sticky** (h-16, beyaz/blur): sayfa breadcrumb (üstte küçük "Tedarikçi Paneli" üst satırı + büyük başlık), search input disabled "Yakında", bell disabled, user dropdown (Radix DropdownMenu — avatar+initials + ad + e-posta + Profil/Ayarlar/Çıkış kırmızı)
    - Auth lib & hooks (`apps/web`):
      - `lib/supplier-auth/{types,store,api}.ts` — `useSupplierAuthStore` (token + supplierUser + supplier + tenantRelations + isHydrated), `supplierApi` (kendi axios instance, kendi 401 → `/supplier/login` redirect interceptor)
      - `hooks/use-supplier-auth.ts` — `useSupplierAuth`, `useSupplierLogin`, `useSupplierMe` (login sonrası SupplierShell mount'unda enabled, `staleTime: 60s`), `useSupplierLogout` (queryClient.clear + window.location)
      - `components/providers/supplier-auth-hydration.tsx` — `RequireSupplierAuth` (isHydrated + token check, yoksa `/supplier/login`'e yönlendirir)
      - `lib/supplier/{nav-config,membership,status,use-sidebar}.ts` — sidebar nav, membership/companyType etiketleri, relation status meta
    - Landing + tenant /login footer: "Tedarikçi Girişi →" linki eklendi (yan yana "Kayıt Ol" ile)
    - **noindex**: `/supplier/layout.tsx`'de `metadata.robots: {index:false, follow:false}` — tüm `/supplier/*` rotaları arama motorlarına kapalı
    - Manuel doğrulama: 3 ayrı token cross-test edildi (tenant→supplier-auth/me 401, supplier→auth/me 401, admin→supplier-auth/me 401, tenant şifresi → supplier-auth/login 401), `/me` `tenantRelations` ile dolu, login sonrası redirect, sidebar collapse persist
17. **Multi-tenant tedarikçi davet kabul akışı (Aşama D.2.B):**
    - **Karar:** Mevcut bir tedarikçi (kayıtlı SupplierUser) yeni alıcının davetini aldığında **yeniden form doldurmaz**; hesabıyla giriş yapıp daveti tek tıkla kabul eder. Kabul anında `SupplierTenantRelation(status=PENDING_TENANT_APPROVAL)` oluşur — alıcı admin'i onaylayana kadar ilişki aktif değil. Onay/red akışı **platform admin'ini** atlar (zaten doğrulanmış tedarikçi)
    - Migration `add_invitation_short_code_and_tracking`: `SupplierInvitation`'a `isExistingSupplier` (Boolean default false), `shortCode` (String? unique — 4-1-4 format K7X9-3M2P), `openedAt` (DateTime?) eklendi. Migration manual SQL olarak uygulandı (seed dışı baseline yok)
    - **Kısa kod üreteci:** `packages/shared/src/helpers/short-code.ts` — Crockford Base32 alfabesi (32 karakter, I/L/O/U dışlanmış), 8 karakter (4-1-4 format). `generateShortCode()` Web Crypto API tabanlı (`globalThis.crypto.getRandomValues` — Node 19+ ve browser uyumlu, mask+retry ile uniform dağılım). `normalizeShortCode()` (lowercase→UPPERCASE, boşluk/`_`→`-`, çoklu `-`→tek), `validateShortCode()` (regex)
    - Backend `SupplierInvitationsService` create + batch:
      - `detectExistingSupplier(email, tenantId)` — aktif SupplierUser var + bu tenant ile ilişki yok → `isExistingSupplier=true`. İlişki varsa (ACTIVE/PENDING/BLOCKED) → ConflictException ("zaten onaylı listenizde" / "bekleyen talep var" / "engellediniz")
      - `generateUniqueShortCode()` — 5 deneme retry collision handling (1 trilyon kombinasyon, pratik retry sıfır)
      - Davet e-postasında `acceptUrl` branchli: existing → `/supplier/login?next=/supplier/profil?invitation=<token>`; new → `/register/supplier?invitation=<token>` (mevcut akış)
      - Subject branchli: existing → "{tenant} sizinle yeni bir bağlantı kurmak istiyor"; new → "{tenant} sizi tedarikçi olarak davet etti"
      - Batch endpoint mixed sonuç döner: ALREADY_INVITED (PENDING dup) / ALREADY_SUPPLIER (her status'ta ilişki var) / success (existing+ilişki yok → isExistingSupplier=true ile invitation oluşur)
    - **E-posta şablonu** `supplier-invitation.tsx` `isExistingSupplier` branching ile yeniden yazıldı: existing branch'te "Hesabıma Giriş Yap ve Kabul Et" CTA + dashed-border CodeBox'da `shortCode` (font-mono, letter-spacing 0.15em) + "manuel kod kopyala" yönergesi. New branch davranışı korundu (mevcut)
    - **Tracking:** `GET /api/registration/supplier/invitation-info` ilk açılışta `openedAt`'i fire-and-forget set eder; response'a `isExistingSupplier` eklendi (frontend register sayfasında ileride uyarı için kullanılabilir)
    - Backend yeni modül `apps/api/src/modules/supplier-self-service/`:
      - `POST /api/supplier-self-service/accept-invitation` (`SupplierJwtAuthGuard`) — body `{invitationToken?: string, shortCode?: string}` (en az biri zorunlu)
      - Doğrulama: token/code bul → status (`ACCEPTED`/`CANCELLED`/expired) → `isExistingSupplier=false` ise 400 → invitation.email ≠ supplierUser.email → 403 → tenant ile mevcut ilişki (ACTIVE/PENDING/BLOCKED) → 409 sebep ile
      - Transaction: `SupplierTenantRelation(status=PENDING_TENANT_APPROVAL)` create + `SupplierInvitation` (`status=ACCEPTED, acceptedBySupplierId, acceptedAt, openedAt fallback`) update
      - Tenant'ın aktif tüm `COMPANY_ADMIN`'lerine `supplier_relation_pending` e-posta (fire-and-forget)
    - **Tenant approval endpoints** (`TenantSuppliersController`):
      - `GET /api/tenants/me/suppliers/pending-relations` — sadece bu tenant'ın PENDING_TENANT_APPROVAL ilişkileri (supplier + primary user). Sıralama: en yeni üstte
      - `POST /api/tenants/me/suppliers/relations/:id/approve` (`@Roles("COMPANY_ADMIN")`) → status=ACTIVE, supplier_relation_approved e-posta
      - `POST /api/tenants/me/suppliers/relations/:id/reject` body `{reason?: string max 500}` → status=BLOCKED, blockedReason set ("Alıcı tarafından reddedildi" varsayılan), supplier_relation_rejected e-posta
      - Stats `pending` zaten mevcut PENDING_TENANT_APPROVAL count'unu döndürüyordu — değişmedi
    - **3 yeni e-posta şablonu:** `supplier_relation_pending` (alıcı admin'lerine, summary box ile firma + vergi no + şehir + sektör + "Talebi İncele" CTA `/dashboard/tedarikciler?tab=pending`), `supplier_relation_approved` (tedarikçiye, profile CTA), `supplier_relation_rejected` (tedarikçiye, opsiyonel reason quote box, support CTA)
    - **Frontend supplier:**
      - `/supplier/login` artık `?next=` query param'ı okur ve başarılı login sonrası buraya gider; safeNextPath helper sadece `/supplier/*` whitelist'ler (open redirect koruması). Login page Suspense ile sarıldı (Next 15 useSearchParams)
      - `/supplier/profil` "Yeni Davet Kodu Ekle" butonu artık aktif: URL'de `?invitation=<token>` varsa modal otomatik açılır + token mode (yeşil "Davet bulundu" kart, doğrudan kabul). Manuel mod: shortCode input (font-mono, uppercase tracking-wider), live `validateShortCode` kontrolü, format hatasında inline mesaj. Modal kapanırken `?invitation` URL'den temizlenir
    - **Frontend tenant:**
      - `/dashboard/tedarikciler` 4. tab "Onay Bekleyenler" eklendi (Clock icon + warning-100 badge; 0 ise default slate badge). `PendingRelationsTable` her satır warning-50 card: firma + üyelik + onay bekliyor pill + companyType + VKN + city + sektör + primary user (e-posta + telefon link) + relative tarih + sağda "Onayla" (success-yeşil) / "Reddet" (kırmızı outline) butonları. Boş state Users2 ikonu + "Onay bekleyen tedarikçi yok" mesajı. 30sn auto-refetch
      - `RejectRelationModal` — Radix Dialog, opsiyonel sebep textarea (max 500), submit → POST `/relations/:id/reject`. Sebep boş bırakılırsa "Alıcı tarafından reddedildi" varsayılan
      - `InvitationsTable`'a "Görüldü mü?" kolonu: `OpenedBadge` (openedAt yok → slate "Açılmadı" + Clock; <5 dk → brand-50 animate-pulse "Şu an inceliyor" + Eye; ≥5 dk → success-50 "X önce açıldı" + CheckCircle2)
      - `Sidebar` "Tedarikçiler" item'ında live PENDING_TENANT_APPROVAL badge (kırmızı pill) — `useSupplierStats().pending` 30sn refetch
    - Manuel E2E doğrulandı: existing supplier davet (`isExistingSupplier=true`, shortCode üretildi) → supplier login + accept-invitation `{shortCode}` → PENDING_TENANT_APPROVAL relation + supplier_relation_pending e-posta admin'lere → tenant approve → ACTIVE + supplier_relation_approved e-posta. Reject akışı: aynı flow + `{reason}` → BLOCKED + supplier_relation_rejected e-posta. Cross-token: tenant token → /supplier-self-service 401. Re-invite ALREADY_SUPPLIER 409. Batch mixed sonuç. invitation-info açılınca openedAt set
18. **İhale modülü temeli (Aşama E.1):**
    - **Schema (`add_tender_models` migration):** Tender + TenderItem + TenderInvitation + Bid + BidItem + BidAttachment + TenderAttachment + Order + 8 enum (TenderType, TenderStatus, Currency, DeliveryTerm, PaymentTerm, TenderInvitationStatus, BidStatus, OrderStatus). Tenant/User/Supplier/SupplierUser modellerine geri ilişkiler eklendi. Tender unique `tenderNumber`, `(tenantId, status)` + `(status, bidsCloseAt)` index'leri; TenderInvitation `(tenderId, supplierId)` unique; Bid `(tenderId, supplierId)` unique (tedarikçi başına 1 aktif teklif). Decimal alanları `Decimal(15,4)` veya `Decimal(20,4)` (toplam). Migration manuel SQL ile uygulandı (env non-interactive)
    - **Numara üreteci** `packages/shared/src/helpers/tender-number.ts`: `generateTenderNumber()` → `SUPK-YYYY-NNNN` formatı (yıl bazlı son sayı + 1, padStart(4)); `generateOrderNumber()` → `ORD-YYYY-NNNN`. Race koşulu DB unique constraint'le yakalanır (servis tarafında retry; v1 trafik düşük olduğu için yeterli)
    - **Backend** yeni 2 modül:
      - `TenantTendersModule` — `GET /api/tenants/me/tenders` (status/search/pagination, list item shape: itemCount/invitationCount/bidCount + createdBy minified), `GET /stats` (DRAFT/OPEN_FOR_BIDS/IN_AWARD/AWARDED/CANCELLED/CLOSED_NO_AWARD sayım), `GET /:id` (tenant scope kontrolü; items + invitations + attachments + bidStats). Auth: `JwtAuthGuard` (her tenant rolü okuyabilir)
      - `SupplierTendersModule` — `GET /api/supplier/tenders` (filter=active/past/all + search + pagination, **DRAFT görünmez**, `invitations: { some: { supplierId } }` ile sadece davetli kayıtlar), `GET /stats` (activeInvitations + submittedBids + wonTenders + ongoingOrders), `GET /:id` (önce davet kontrolü; davetsizse 404). **Kapalı zarf:** detay response'unda `invitations`, `bids`, `bidStats` ASLA dönmez; sadece `myInvitation` ve `myBid` (varsa) dönüyor. Auth: `SupplierJwtAuthGuard`
    - **Seed `packages/db/prisma/seed/tenders.ts`** (idempotent — title üzerinden tekrar etmez): 3 dummy tender + örnek tedarikçi + Demo Şirket COMPANY_ADMIN (`ugur@demo.com / demo12345`) ana seed'den çağrılır. Örnek tender'lar: SUPK-2026-0001 OPEN_FOR_BIDS (4 kalem + 3 davet, customQuestion'lı 2 kalem), SUPK-2026-0002 IN_AWARD (kapanmış), SUPK-2026-0003 DRAFT (yayınlanmamış)
    - **Frontend tenant** `/dashboard/ihaleler` (placeholder kaldırıldı):
      - Liste: 6'lı KPI (Toplam/Taslak/Yayında/Kazandırma/Tamamlandı/İptal+Kapalı) + 6 sekme (Tümü/Taslak/Yayında/Kazandırma/Tamamlandı/İptal-Kapalı) + URL sync (`?tab&search&page`) + 300ms debounce search + tablo (İhale No / Adı / Tip / Statü / Davetli / Teklif / Açılış / Kapanış: OPEN_FOR_BIDS'da CountdownTimer, diğerlerinde tarih) + 30sn refetch
      - "Yeni İhale Aç" butonu disabled "YAKINDA" pill (E.2'de aktif)
      - Detay `/dashboard/ihaleler/[id]`: gradient header (tenderNumber + TenderTypeBadge + StatusBadge + title + description + sağda OPEN_FOR_BIDS'de büyük CountdownTimer veya IN_AWARD'da disabled "Kazandırmayı Tamamla" CTA), 5 sekme (Genel Bilgi / Kalemler / Davetli Tedarikçiler / Teklifler placeholder / Dosyalar). Kalemler tablosu (orderIndex, name, description tooltip, qty/unit, materialCode, targetUnitPrice, customQuestion HelpCircle pill). InvitationsTab kart liste (companyName + Üyelik badge + VKN + InvitationStatus badge + emailOpenedAt göstergesi). BidsTab E.4 placeholder. 15sn detay refetch
    - **Frontend supplier** `/supplier/ihaleler` (placeholder kaldırıldı):
      - Liste: 4'lü mini KPI (Aktif Davet / Verilen Teklif / Kazanılan / Devam Eden Sipariş) + 3 sekme (Aktif/Geçmiş/Tümü) + tablo (İhale No / Adı / Alıcı / Statü / Kapanış: CountdownTimer / Teklif Durumum: BidStatusBadge)
      - Detay `/supplier/ihaleler/[id]`: header card (tenderNumber + tip/statü + title + description + sağda CountdownTimer + disabled "Teklif Ver" YAKINDA pill), Alıcı Firma kutusu (sadece tenant.name), **3 sekme (Genel Bilgi / Kalemler / Dosyalar — KAPALI ZARF: Davetli Tedarikçiler ve Teklifler sekmeleri YOK)**. Items + Files tab tenant component'leri yeniden kullanılıyor (DRY)
    - **Components & lib:**
      - `apps/web/src/components/countdown-timer.tsx` — Web Crypto-bağımsız, dakika/saniye otomatik geçişli sayaç (>1sa: dakika tick; <1sa: saniye tick + kırmızı renk; <24sa: sarı). Sürenin dolması "Süresi Doldu"
      - `apps/web/src/components/tenders/status-badge.tsx` — TenderStatusBadge / TenderTypeBadge / InvitationStatusBadge / BidStatusBadge
      - `apps/web/src/lib/tenders/{types,labels}.ts` — tüm tender domain tipleri + Incoterm açılımları + para birimi sembolleri + status meta map'leri
      - Hooks: `use-tenant-tenders.ts` (TanStack Query, list 30sn / detail 15sn) + `use-supplier-tenders.ts` (kendi `supplierApi` üzerinden)
    - Sidebar: `/supplier/nav-config` "İhaleler" item'ından `placeholder: true` flag'i kaldırıldı; tenant nav-config zaten link olarak göstertiyordu
    - **Manuel E2E doğrulandı:**
      - migration + seed başarılı, 3 tender + 1 örnek tedarikçi + 1 ACTIVE relation oluştu
      - tenant `/tenders/stats` → `{total:3, draft:1, openForBids:1, inAward:1}` ✓
      - tenant detail → `bidStats: {total:0, submitted:0, draft:0}` ✓
      - **Kapalı zarf:** supplier detail response'unda `invitations`/`bids`/`bidStats` field'ları YOK; sadece `myInvitation` + `myBid` (null) dönüyor ✓
      - **DRAFT görünmezliği:** supplier `GET /supplier/tenders/{draftId}` → 404 "İhale bulunamadı" ✓
      - **Cross-token:** tenant token → `/supplier/tenders` → 401 "Geçersiz token tipi"; supplier token → `/tenants/me/tenders` → 401 ✓
      - liste/detay sayfaları HTTP 200 (her iki taraf)
19. **İhale oluşturma 4-adımlı wizard (Aşama E.2):**
    - **Backend ek endpoint'ler** (`TenantTendersController` + service): `POST /api/tenants/me/tenders` (DRAFT oluştur), `PATCH /:id` (DRAFT update — items/invitations/attachments full-replace, V2'de delta), `POST /:id/publish` (DRAFT → OPEN_FOR_BIDS, validations: ≥1 item, ≥1 davet, kapanış geleceğe), `POST /:id/cancel` body `{reason min10 max500}` (OPEN_FOR_BIDS/IN_AWARD → CANCELLED), `DELETE /:id` (sadece DRAFT). Tüm yazma endpoint'leri `RolesGuard` + `@Roles("COMPANY_ADMIN")` — BUYER/APPROVER 403
    - **DTOs** (`apps/api/src/modules/tenant-tenders/dto/`): `CreateTenderDto` + `TenderItemInputDto` (nested) + `TenderAttachmentInputDto` (5MB/file, max 10), `UpdateTenderDto extends CreateTenderDto`, `CancelTenderDto`. class-validator: `@ArrayMinSize(1)/@ArrayMaxSize(100)` items, `@ArrayMaxSize(50)` invitedSupplierIds, `@IsDateString` for tarihler, `@IsEnum` Currency/DeliveryTerm/PaymentTerm. Business rules `validateBusinessRules()` private helper'da: primaryCurrency ⊂ allowedCurrencies, DEFERRED → paymentDays zorunlu, bidsCloseAt > now, bidsOpenAt < bidsCloseAt, davetli liste duplicate yok
    - **`assertActiveSuppliers(tx, tenantId, ids)`** — davetli tedarikçilerin tamamı bu tenant'ın `ACTIVE` ilişkisinde mi diye kontrol eder; engelli/pending/yabancı tedarikçi varsa 400 "X tanesi onaylı/aktif listenizde değil"
    - **Publish flow:** `bidsOpenAt` null ise yayın anına set edilir; status update sonrası `setImmediate`/Promise dispatch ile her davetli supplier'ın aktif primary user'ına `tender_invitation` e-postası queue'ya bırakılır + `TenderInvitation.emailSentAt` set edilir. Hata olursa loglanır, ihale yayınlandı olarak kalır (re-send V2). Publish endpoint idempotent değil — DRAFT olmayanda 409
    - **Yeni e-posta şablonu** `tender_invitation` (`packages/email/src/templates/tender-invitation.tsx`): "🎯 Yeni İhale Daveti: {title}" subject + summary box (tenderNumber mono · title · {itemCount} kalem · kapanış formatlı d MMMM yyyy HH:mm tr locale) + "İhaleyi İncele" CTA → `/supplier/ihaleler/:id`. types.ts'de `TenderInvitationEmailData` + render.ts switch-case eklendi
    - **`apps/api/src/main.ts` body limit 20mb → 25mb** (10 attachment × 2MB ortalama + JSON overhead için pay)
    - **Frontend `/dashboard/ihaleler/yeni`** + `/[id]/duzenle` paylaşılan `TenderWizard` komponenti (`apps/web/src/app/dashboard/ihaleler/yeni/_components/`):
      - `WizardStepper` 4 adım (İhale Bilgileri → Kalemler → Tedarikçiler → Tamamla, mobile'da label gizli)
      - **Step 1 (Step1Info):** 8 section — Genel (title/description/type — ENGLISH_AUCTION disabled "YAKINDA"), Kurallar (3 checkbox: kapalı zarf/tüm kalemler zorunlu/dosya zorunlu), Para (radio + multi-checkbox + decimal select 0-4 + TCMB info kutu), Teslimat (Incoterm select + adres), Ödeme (Peşin/Vadeli radio + DEFERRED'de paymentDays input), Hüküm/Notlar (termsAndConditions tedarikçiye açık + internalNotes dahili), Zaman (datetime-local açılış+kapanış), Dosyalar (`FileUploadMulti` drag-drop max 10×5MB, base64 PDF/DOC/XLS/JPG/PNG)
      - **Step 2 (Step2Items):** `useFieldArray` items, satır kart layout: 1-100 kalem, her satırda `name/quantity/unit/materialCode` + collapsible "Detay & Soru Ekle" → description/requiredByDate/targetUnitPrice/customQuestion. "Soru var" rozeti (warning-50). En az 1 kalem, sil butonu sadece >1'de aktif
      - **Step 3 (Step3Suppliers):** `useSuppliers({status:"ACTIVE"})` ile onaylı tedarikçi listesi + 300ms-debounce'suz arama (companyName/taxNumber/email) + checkbox kart liste (membership badge, VKN mono, primary user e-mail), "Görünenleri Seç"/"Temizle" toolbar + canlı seçili sayacı. Boş state'te "Tedarikçilere Git" CTA
      - **Step 4 (Step4Review):** Edit-link'li 3 section (İhale Bilgileri / Kalemler tablosu / Davetli Tedarikçiler), tedarikçi adları runtime `useSuppliers` map'lenir, `onEditStep(s)` ile o adıma dön. Sticky footer altında [Geri] · [Taslak Olarak Kaydet] · [Yayınla → PublishConfirmDialog] (invitedCount=0'da disabled tooltip)
      - **PublishConfirmDialog** (Radix `Dialog`, success-yeşil): "{N} tedarikçiye davet e-postası gönderilecek + yayın sonrası kalem/davet değişmez" warning-50 box → "Yayınla" CTA
      - State: tek `useForm<TenderFormData>` (zod resolver = `tenderFormSchema` `lib/tenders/form-schema.ts` — primaryCurrency ⊂ allowedCurrencies, DEFERRED→paymentDays, bidsCloseAt>now, bidsOpenAt<close refine'leri). `STEP_FIELDS[1..3]` array'i ile her adımda `form.trigger(fields)` validation. Mutation hooks `useCreateTender`/`useUpdateTender`/`usePublishTender` aynı dosya `use-tenant-tenders.ts`'de
      - `/dashboard/ihaleler/[id]/duzenle` — `EditLoader` `useTenderDetail(id)` ile DRAFT'ı çeker, status≠DRAFT ise sarı "düzenlenemez" kart + detay linki, DRAFT ise `tender → TenderFormData` map (datetime-local format, items.quantity Number(), tenders.invitations → invitedSupplierIds[]) + `<TenderWizard mode="edit" initialData={...}>`. **NOT: V1'de attachments edit modunda full-replace nedeniyle eski dosyalar silinir; "Düzenle"den çıkarken dosyalar yeniden yüklenmelidir (V2'de signed URL ile düzeltilecek — duzenle/_components/edit-loader.tsx'de yorum satırı var)**
    - **Liste sayfası** `/dashboard/ihaleler` "Yeni İhale Aç" butonu artık aktif: COMPANY_ADMIN ise `<Link href="/dashboard/ihaleler/yeni">`, BUYER/APPROVER ise `disabled` + tooltip "Bu işlem için Firma Yöneticisi yetkisi gerekiyor". `useAuth().user.role` kontrolü
    - **Detay sayfası** `header-card.tsx` status'a göre aksiyon paneli (sadece COMPANY_ADMIN'e gözükür):
      - DRAFT: [Düzenle (Pencil)] · [Yayınla (Send, success-yeşil, davet=0'da disabled)] · [Sil (Trash2, danger outline)]
      - OPEN_FOR_BIDS: [İhaleyi İptal Et (Ban, danger outline)] — header'ın altında ek satır
      - CANCELLED: header altında danger-50 kutu içinde `cancelReason` + `cancelledAt` (varsa)
      - IN_AWARD: disabled "Kazandırmayı Tamamla" YAKINDA (E.5'te)
    - 3 yeni dialog: `PublishConfirmDialog` (yeniden kullanım — yeni/'den import), `DeleteConfirmDialog` (kalıcı silme uyarısı), `CancelTenderDialog` (sebep textarea min 10 max 500)
    - **Manuel E2E doğrulandı:**
      - `POST /tenders` SUPK-2026-0004 DRAFT oluştu ✓
      - `POST /:id/publish` → status=OPEN_FOR_BIDS + publishedAt + emailSentAt set; Mailpit'te "🎯 Yeni İhale Daveti: …" subject ile demo-supplier@firma.com'a düştü ✓
      - `POST /:id/cancel {reason}` → CANCELLED ✓; sonra `DELETE /:id` → 409 "Sadece taslak ihaleler silinebilir" ✓
      - `DELETE` DRAFT → 200 ✓; `GET /:id` → 404 ✓
      - validation: kapanış geçmişte → 400 ✓; davet=0 yayın → 400 ✓; geçersiz supplierId → 400 ✓
      - supplier login + `GET /supplier/tenders?filter=all` cancelled tender görür ✓
      - frontend `/dashboard/ihaleler` + `/dashboard/ihaleler/yeni` HTTP 200 ✓
      - typecheck (api/web/admin/email/shared) tüm yeşil ✓
20. **E.2 Wizard UI Redesign (PratisPro tarzı):** _backend dokunulmadı, sadece UI/UX_
    - **Adım 0 (yeni landing):** `/dashboard/ihaleler/yeni` artık `useSearchParams` ile dallanıyor (`yeni-router.tsx` içinde `<Suspense>` sarmalı). Param yoksa `TenderTypeSelection` 2 büyük kart gösterir: **RFQ (Teklif Talebi)** mavi şeritli, "Önerilen" success-pill, hover şerit kalınlaşır → `?type=rfq` push; **İngiliz Usulü** purple şeritli, "Yakında" warning pill, opacity-75 cursor-not-allowed (`?type=english` hâlâ landing'e düşer). Header breadcrumb (Dashboard › İhaleler › İhale Oluştur). `?type=rfq` ile direkt `<TenderWizard mode="create">` mount edilir
    - **Edit akışı korundu:** `/dashboard/ihaleler/[id]/duzenle` zaten `<EditLoader>` içinde `<TenderWizard mode="edit" initialData>` çağırıyor — tip seçim ekranı görmez, direkt wizard'a girer
    - **Adım 2 (Step2Items):** Tek "Detayları Göster/Gizle" toggle KALDIRILDI; row component'i `ItemRow`'a extract edildi, her satır kendi modal state'ini tutar:
      - **"Detay Ekle"** butonu → `ItemDetailModal` (max-w-lg): description (rows=4 max 2000) + requiredByDate (date) + targetUnitPrice (dahili). Kayıtlıyken buton "Detayı Düzenle" + brand-50 bg + ✓ rozet, yanında description ilk 60 karakter italic özet (truncate)
      - **"Soru Ekle"** butonu → `ItemQuestionModal` (max-w-md): warning-50 info kutu + customQuestion (rows=4 max 500) + footer'da "Soruyu Kaldır" inline (sebep boş değilse) + "Vazgeç"/"Kaydet". Kayıtlıyken buton "Soruyu Düzenle" + warning-50 bg + ✓ rozet
      - Modal'lar `useFormContext` üzerinden register ediyor → form değerleri anlık update (V1 basit; "Vazgeç" değişiklikleri geri almaz, sadece modal kapatır). Validation hatası varsa buton'da `ring-1 ring-danger-300`
    - **Adım 3 (Step3Suppliers) PratisPro radio-card layout:**
      - **Davet yöntemi 2 radio kart:** "Tüm Supkeys Tedarikçileri" (disabled "Yakında" V2'de aktif olacak; engellediği tedarikçiler hariç açıklaması) + "Sadece Onaylı Tedarikçilerim" (V1 aktif, brand-400 border + ring-2 brand-100, "Aktif" success pill, 3 maddelik açıklama liste)
      - **Bilgi banner'ları:** Loading'de skeleton; allSuppliers=0 → warning-50 boş state + "Tedarikçi Davet Et" Link CTA; aksi halde success-50 banner ("X onaylı tedarikçiniz bulundu") + arama input + "Tümünü Seç (X)" butonu (filtre sonucu üzerinden, `allVisibleSelected` ise disabled)
      - **Tedarikçi liste:** max-h 480px scroll, satırlarda checkbox + companyName + membership badge + VKN/şehir/sektör + primary user. Seçiliyken `bg-brand-50 border-brand-300 shadow-sm`
      - **Alt seçim özeti kartı:** seçili≥1 → brand-50 + chip listesi (Building2 + truncate companyName + X kaldır), seçili=0 → slate-50 dashed + "Henüz tedarikçi seçmediniz". Sağda "Temizle" butonu
    - **Stepper, Step1, Step4 değişmedi.** Form schema (`tenderFormSchema`) ve API mutation hooks (`useCreateTender/useUpdateTender/usePublishTender`) tamamen aynen
    - Manuel doğrulama: `/yeni` 2 kart landing ✓, `?type=rfq` wizard ✓, `?type=english` landing'e fallback ✓, `/duzenle` direkt wizard ✓, `pnpm --filter @supkeys/web typecheck` clean ✓

### ⏳ Sıradaki (Bu Sprint)
1. **Aşama E.3**: Tedarikçi teklif verme. `/supplier/ihaleler/[id]/teklif-ver` — kalem bazlı teklif (Birim Fiyat × Miktar otomatik toplam), kalem sorusu cevabı, teklif notu, attachment, para birimi (allowedCurrencies içinden), taslak/gönder, teklif revize et (version++), kapalı zarf altında "Verildi" statüsü, kapanış sonrası teklif yok
2. Admin dashboard KPI'ları (demo + buyer + supplier stats agregasyonu, hızlı linkler)
3. MinIO entegrasyonu: vergi levhası + tender attachment base64 → MinIO upload + signed URL (V2). Şu an `TenderAttachment.fileUrl` data URL — DRAFT update ediyorken eski dosyalar full-replace nedeniyle kaybediliyor

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
