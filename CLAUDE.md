# Supkeys — Bağlam Dosyası

## Proje
**Supkeys**, AI destekli e-procurement & e-ihale SaaS platformu. PratisPro/SAP Ariba tarzı B2B; alıcılar için RFQ/teklif toplama/açık eksiltme/kazandırma/sipariş, tedarikçiler için davet kabul/teklif verme. V1 hedefi: 3 ay içinde RFQ flow'u tamamlanmış, üretime hazır iskelet.

## Marka
Mavi & beyaz · Inter (UI) + Plus Jakarta Sans (display) · "S" mavi kutu + lacivert/mavi dual-tone · AI agent katmanı V3'te aktif olacak.

## Tech Stack
- Monorepo: pnpm 10 + Turborepo
- Backend: NestJS 10 + Prisma 6 + PostgreSQL 16 + Redis 7 (BullMQ) + JWT
- Frontend: Next.js 15 (App Router) + React 19 + Tailwind v4 (`@theme` CSS) + Zustand persist + TanStack Query + react-hook-form + zod + sonner + lucide
- E-posta: React Email + Resend (prod) + Mailpit (dev)
- Cron: NestJS Schedule (V2'de BullMQ multi-instance)
- Storage: Cloudflare R2 (V2-2'de aktif edildi; presigned PUT/GET, S3-compatible AWS SDK v3). Vergi levhası hâlâ base64 — V2.5'e ertelendi.
- Node 22, pnpm 10.33

## Repo Yapısı
```
apps/api      NestJS         port 4000  api.supkeys.com
apps/web      Next.js        port 3000  app.supkeys.com  (tenant + supplier rotaları)
apps/admin    Next.js        port 3001  admin.supkeys.com
packages/db       @supkeys/db        Prisma schema + migrations + seed + scripts
packages/shared   @supkeys/shared    Zod + types + helpers (slug, short-code, tender-number)
packages/email    @supkeys/email     React Email templates + Resend/Mailpit providers
```

## Test Hesapları (Dev)

| Tip | URL | E-posta | Şifre |
|-----|-----|---------|-------|
| Tenant | localhost:3000/login | ugur@demo.com | demo12345 |
| Admin | localhost:3001/admin/login | admin@supkeys.com | admin12345 |
| Supplier | localhost:3000/supplier/login | demo-supplier@firma.com | Test1234 |
| Mailpit UI | localhost:8025 | — | — |

## Servis Başlatma
```bash
docker compose up -d
pnpm dev   # turbo, hepsi paralel
# veya tek tek:
pnpm --filter @supkeys/api dev
pnpm --filter @supkeys/web dev
pnpm --filter @supkeys/admin dev
```

## Önemli Mimari Kararlar

1. **3 ayrı auth alanı:** Tenant (`apps/web /dashboard`), Admin (`apps/admin`), Supplier (`apps/web /supplier`). JWT payload'ında `type: "tenant" | "admin" | "supplier"`. Her tarafın kendi store'u + axios instance + 401 redirect interceptor.
2. **Multi-tenant veri izolasyonu:** Tüm sorgular tenantId scope'unda, servis seviyesinde filtrelenir.
3. **Buyer self-register YOK:** Alıcı sadece demo görüşmesi → admin'in gönderdiği davet linkiyle kayıt olabilir; e-posta verify sonrası admin manuel onay verir, otomatik onay yoktur.
4. **Tedarikçi self-register VAR** (admin onayıyla); zaten kayıtlı tedarikçinin yeni alıcı daveti kabulü → direkt `ACTIVE` (D.2.B sadeleştirmesi: tenant approval adımı kaldırıldı).
5. **Kapalı zarf:** Tedarikçiler birbirinin tekliflerini ASLA göremez. Alıcı her zaman görür. `/supplier/tenders/:id` response'ı `invitations`/`bids`/`bidStats` field'ları içermez; sadece `myInvitation` + `myBid`.
6. **E.3 Refactor (E.5'te):** Tedarikçi "Revize Et" akışı kaldırıldı — SUBMITTED bid editlenmez (alıcıyla iletişim mesajı + Geri Çek). Alıcı eleme yaparsa LOST → tedarikçi yeniden teklif verebilir (version++).
7. **Kazandırma kalıcı:** Toplu (tek tedarikçi, tüm kalemler) veya Kalem Bazlı (her kalem ayrı tedarikçi). Finalize edilince Tender → AWARDED + Order'lar (`ORD-YYYY-NNNN`). V1'de geri alma YOK.
8. **V1 sadece RFQ:** İngiliz Usulü açık eksiltme V2'de.
9. **Body parser 25MB:** Vergi levhası + tender/bid attachment base64 (V2'de MinIO presigned URL).
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
- **DB cleanup:** `pnpm --filter @supkeys/db cleanup-pending-relations` legacy `PENDING_TENANT_APPROVAL` kayıtlarını ACTIVE'e çevirir (E.6'da eklendi).

## Token İzolasyonu
JWT payload `type` field'ıyla doğrulanır. Tenant token → admin/supplier endpoint = 401 "Geçersiz token tipi". Aynı şekilde diğer kombinasyonlar. Cross-token testleri yapıldı.

---

## Tamamlanan Aşamalar (Özet)

### A — Backend Registration
6 model + 5 enum (BuyerApplication / SupplierApplication / Supplier / SupplierUser / SupplierTenantRelation / SupplierInvitation), 3 controller (registration/admin-applications/tenant-suppliers), 8 e-posta şablonu (verification + admin alert + approved + rejected + invitation), `generateSlug` TR latinize.

### B — Frontend Register Pages
`/register/buyer?invitation=` (token zorunlu, yoksa `/demo-talep`'e redirect), `/register/supplier` (self) + `?invitation=` (alıcı daveti), `/register/verify-email`. 3 adımlı stepper, react-dropzone base64, password strength, 81 il + 970 ilçe TR data, KVKK tek onay → backend `acceptTerms` + `acceptKvkk` ikilisine map.

### C — Admin Application Management
`/admin/{buyer,supplier}-applications` — 5'li KPI + URL-sync filter + tablo + drawer (vergi levhası iframe modal + onay + reddet 4 hazır sebep). Approve transactional: buyer → Tenant + COMPANY_ADMIN User; supplier → Supplier(STANDARD) + SupplierUser + (davetli ise) SupplierTenantRelation(ACTIVE) + invitation→ACCEPTED. Demo davetli buyer onaylanınca DemoRequest otomatik WON.

### D.1 — Tenant Tedarikçi Yönetimi
`/dashboard/tedarikciler` 3 tab (Onaylı / Davetler / Engellenenler), toplu davet modal'ı (≤50 e-posta + parser + dedupe + ALREADY_INVITED/ALREADY_SUPPLIER), engelleme modal'ı (sebep min10), tedarikçi detay drawer'ı. Davet e-postası shortCode formatlı (Crockford Base32, 4-1-4).

### D.2.A — Tedarikçi Paneli İskeleti
`/supplier/(authed)/{dashboard,profil,ihaleler,siparisler,ayarlar}`, ayrı SupplierShell + ayrı auth store + `noindex` metadata. CompanyCard (membership badge), TenantRelationsList.

### D.2.B — Multi-Tenant Davet Kabul (sonradan sadeleştirildi)
Mevcut tedarikçinin yeni alıcı daveti → giriş yap + tek tıkla kabul (form yeniden YOK). Davet e-postasında `acceptUrl` branchli (existing → `/supplier/login?next=...`, new → `/register/supplier`). `POST /supplier-self-service/accept-invitation { invitationToken? | shortCode? }`. **Mimari sadeleştirme:** İlişki direkt `ACTIVE` oluşur (eski `PENDING_TENANT_APPROVAL` adımı kaldırıldı, çünkü tedarikçi zaten platform onaylı). 2 e-posta: `supplier_relation_established_buyer` + `supplier_relation_established_supplier`.

### E.1 — İhale Modülü Temeli
Schema `add_tender_models`: Tender + TenderItem + TenderInvitation + Bid + BidItem + BidAttachment + TenderAttachment + Order + 8 enum (TenderType/TenderStatus/Currency/DeliveryTerm/PaymentTerm/TenderInvitationStatus/BidStatus/OrderStatus). `generateTenderNumber()` → `SUPK-YYYY-NNNN`. Read-only API + dummy seed (3 tender + 1 örnek tedarikçi).

### E.2 — İhale Oluşturma Wizard
`/dashboard/ihaleler/yeni` 4 adımlı (İhale Bilgileri → Kalemler → Tedarikçiler → Tamamla), DRAFT/publish/cancel/delete endpoint'leri (RolesGuard COMPANY_ADMIN), `tender_invitation` e-posta. Wizard redesign sonrası: ihale tipi seçim sayfası (RFQ aktif, English V2), kalem satırlarında "Detay Ekle" + "Soru Ekle" 2 ayrı modal, davet yöntemi radio cards + seçim chip listesi.

### E.3 — Tedarikçi Teklif Verme
`/supplier/ihaleler/[id]/teklif-ver` kalem bazlı teklif (currency selector, BidItemRow per item + customAnswer for soru'lu kalemler, BidTotalsCard sticky, AttachmentsUploader drag-drop), DRAFT/SUBMITTED + version, withdraw, kapalı zarf info kutuları. **Not: E.5'te "Revize Et" akışı kaldırıldı** (sadece "Geri Çek").

### E.4 — Süre Yönetimi + Alıcı İzleme
NestJS Schedule cron (`EVERY_MINUTE` `closeExpiredTenders`), 3 buyer endpoint (`/bids`, `/bids/comparison`, `/bids/:bidId`), Teklifler tab PratisPro UX (Kalem Bazlı + İhale Bazlı 2 alt-tab, en düşük yeşil pill, version mono pill), `/dashboard/ihaleler/[id]/teklif/[bidId]` ayrı detay route (3 KPI + clickable rank), canlı `CountdownFull` + polling banner (live ihalelerde 30sn). 2 e-posta (`tender_closed_supplier` hasBid branchli + `tender_closed_buyer`).

### E.5 — Kazandırma + Sipariş + E.3 Refactor
- **Migration `add_bid_elimination_fields`:** `Bid.eliminationReason String?` + `eliminatedAt DateTime?`
- **E.3 refactor:** Tedarikçi "Revize Et" tamamen kaldırıldı. SUBMITTED bid edit → 409 "alıcıyla iletişime geçin". WITHDRAWN → 409. LOST → düzenleme serbest, submit edilince version++ ve elimination fields temizlenir. Frontend: SUBMITTED form sayfası → uyarı; LOST → fresh form (önceki değerler dolu DEĞİL); my-bid-tab'de revize CTA YOK, sadece geri çek + AWARDED 🏆 banner + LOST yeniden teklif CTA.
- **Eleme akışı:** `POST /tenants/me/tenders/:id/bids/:bidId/eliminate` (10-500 char sebep, COMPANY_ADMIN), bid detail "Tüm İşlemler" Radix dropdown aktif + EliminateBidModal. `bid_eliminated_supplier` e-posta canResubmit branchli.
- **Kazandırma:** `awardFull` + `awardItemByItem` + `finalizeAward` + `closeNoAward` endpoint'leri. AwardWizardModal 4 step (choose mode → full/item selection → confirm). Finalize atomic: tender → AWARDED, SUBMITTED'lar LOST'a, her kazanan için Order (`ORD-YYYY-NNNN`). 4 e-posta (eliminated/won/lost/buyer summary).
- **Sipariş modülleri V1 read-only:** `/tenants/me/orders` + `/supplier/orders` (list/stats/detail). `/dashboard/siparisler` + `/supplier/siparisler` aktif.

### E.6 — V1 Final Polish
- `packages/db` tsconfig fix (rootDir `./src` → `.`, `@supkeys/shared` workspace dep eklendi)
- Cleanup script `prisma/scripts/cleanup-pending-relations.ts` (legacy `PENDING_TENANT_APPROVAL` → `ACTIVE` migration)
- Tenant Dashboard canlı KPI'lar: aktif/kazandırma/aktif tedarikçi/bekleyen sipariş + Son 30 Gün özeti (tamamlanan ihale + gelen teklif + toplam harcama) + Aktif İhaleler Özeti (4 tab linki) + Aktivite Feed (tender/bid/order, tıklayınca detay)
- Supplier Dashboard canlı KPI'lar: aktif davetler/aktif teklifler/kazanılan/bekleyen sipariş + Performans (son 30 gün teklif + toplam gelir + bağlı alıcı) + Aktivite Feed (invitation/bid/order)
- Backend modülleri: `tenant-dashboard` + `supplier-dashboard` (`/stats` + `/recent-activity?limit=`), parallel COUNT'lar Promise.all ile
- Hooks: `useTenantDashboardStats` + `useTenantRecentActivity`, `useSupplierDashboardStats` + `useSupplierRecentActivity` (TanStack Query, 30sn staleTime, refetchInterval YOK)
- Ortak `<ActivityFeed>` component (`@/components/dashboard/activity-feed`)
- CLAUDE.md trim (87k → ~24k karakter, eski tam içerik `CLAUDE.md.backup`'ta)
- **V1 Final QA + 4 bug fix:** Bug #1 admin list bandwidth (taxCertUrl select dışına alındı, 2.79 MB → ~1 KB), Bug #2 Outbox pattern (DB ↔ BullMQ atomik koordinasyon, EmailOutboxService cron @EVERY_MINUTE re-enqueue, fail-tolerant enqueue, graceful shutdown), Bug #3 ClampedIntPipe (regex `/^-?\d+$/` katı integer + clamp), Bug #4 seed/CLAUDE.md test şifre senkronu (`syncDemoSupplierUserPassword` her seed'de günceller). `docs/v1-qa-report.md` arşivlendi.

### E.7.A — Sidebar temizlik + Ayarlar (5 alt sayfa) + Kullanıcı Yönetimi
- **Schema migration `e7a_user_invitation_and_phone_prefs`:** `User`'a `phone`, `invitedById` (self-relation), `invitedAt`, `notificationPrefs` (Json) eklendi. `UserInvitation` modeli + `UserInvitationStatus` enum (PENDING/ACCEPTED/EXPIRED/CANCELLED). UserRole.APPROVER zaten enum'daydı, lastLoginAt zaten User'daydı.
- **Sidebar cleanup:** `Teklifler` item'ı + `/dashboard/teklifler` rotası kaldırıldı. `Onay Bekleyenler` ve `Ayarlar` artık aktif (sidebar config'te zaten YAKINDA rozeti yoktu, placeholder sayfa içerikleri güncellendi). Onay Bekleyenler placeholder rewrite (brand-50 box + ClipboardCheck + dashboard'a dön CTA, E.7.D'de aktif olacak).
- **Backend modülleri:**
  - `tenant-users` (`/tenants/me/users` namespace): `GET /` (list), `GET /me`, `PATCH /me` (sadece firstName/lastName/phone, role/isActive strip), `POST /change-password`, `PATCH /me/notification-prefs` ({prefs} body, sanitize boolean only). COMPANY_ADMIN-only: `POST /invite`, `GET /invitations`, `DELETE /invitations/:id`, `POST /invitations/:id/resend`, `PATCH /:id`. **Son admin protection** servis seviyesinde: COMPANY_ADMIN'i pasif yapamaz veya rolünü değiştiremez (en az 1 aktif admin kontrolü).
  - `public-invitations` (`/invitations` namespace, JWT yok): `GET /:token` (davet bilgisi), `POST /:token/accept` (user create + JWT döner — auto-login). On-the-fly EXPIRED detection (kayıt update + 409). Race protection: aynı e-posta zaten user olarak kayıtlıysa 409.
  - `AuthModule` artık `JwtModule`'ü export ediyor — diğer modüller (PublicInvitations) aynı imza ile token üretebilsin.
- **E-posta:** `user_invitation` şablonu (Layout + heading + info box "Davet bilgileri: firma/rol/süre" + acceptUrl CTA + "beklemiyorsan yok say" footer). Subject `👥 {tenantName} ekibine davet edildiniz — Supkeys`. types.ts/render.ts/index.ts'e tam entegre.
- **Frontend ayarlar (`/dashboard/ayarlar`):** Ana sayfa 5 kart (Hesap Bilgileri / Şifre İşlemleri / Kullanıcı İşlemleri (admin-only) / Bildirim Tercihleri / Firma Profili) PratisPro stili. Tüm alt sayfalarda `<BackToSettings>` ortak komponent.
  - **Hesap Bilgileri:** read-only mode + Pencil "Düzenle" butonu → react-hook-form + zod (firstName/lastName/phone). E-posta disabled. Rol read-only (label).
  - **Şifre İşlemleri:** 3 alan (mevcut/yeni/onay), zod refine ile "şifreler eşleşmiyor" + "yeni şifre eski ile aynı olamaz". Backend `currentPassword` bcrypt karşılaştırma + 400.
  - **Kullanıcı İşlemleri:** UsersTable (avatar + ad + e-posta + rol pill + aktif/pasif chip + son giriş relative time + Radix DropdownMenu "Düzenle" / "Pasif Yap" / "Aktif Et"). InvitationsList (sadece bekleyen davetler — Mail ikon + e-posta + rol + invitedBy + süre + Yeniden Gönder/İptal Et). InviteUserModal (e-posta + 3 radio kart rol seçimi). EditUserModal (firstName/lastName/phone/role). BUYER/APPROVER login olduğunda sayfa "sadece COMPANY_ADMIN" warning kartına düşer.
  - **Bildirim Tercihleri:** 5 grup (İhale 8 alt, Onay 2, Sipariş 2, Tedarikçi 2, Sistem 2 — sistem `locked: true`). Group-level toggle (indeterminate state) + alt-checkbox. Auto-save (her toggle'da PATCH `/me/notification-prefs`). Default opt-in (key yoksa `true`).
  - **Firma Profili:** read-only (companyName/taxNumber/taxOffice/industry/city/district/addressLine/postalCode) + warning pill "Düzenleme · V2" + destek@supkeys.com link.
  - Hooks: `useTenantUsers/UserMe/UpdateMe/ChangePassword/UpdateUser/InviteUser/Invitations/CancelInvitation/ResendInvitation/UpdateNotificationPrefs`. Public hooks: `useInvitation` (retry: false) + `useAcceptInvitation`.
- **Frontend `/accept-invite/[token]` (public):** Server component → token-aware client. `useInvitation(token)` ile davet bilgisi (loading/error states + 409/404 farklı mesajlar). Form: ad/soyad/telefon (opsiyonel)/şifre/şifre tekrar. Şifre regex `/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/`. Submit → `useAcceptInvitation` → setAuth → `/dashboard` redirect + welcome toast. metadata.robots noindex/nofollow.
- **Manuel E2E doğrulama:**
  - 14 backend test geçti: login + me + list + update phone + change password (yanlış şifre 400) + notification prefs + invite + duplicate invite 409 + token GET + accept + auto-login token ile me + BUYER user invite endpoint 403 + token reuse 409 + e-posta SENT (latency <300ms)
  - Last admin protection: self role/isActive update 403 ✓
  - Cross-token: BUYER → admin endpoint 403 ✓
  - Sidebar/breadcrumbs Teklifler temiz ✓

### E.7.B — Firma Tercihleri (adres yönetimi) + İhale wizard adres dropdown refactor
- **Schema migration `e7b_tenant_address_management`:** `TenantAddress` modeli (tenantId / type / title / country / state / city / district / fullAddress / postalCode / taxOffice / taxNumber / contactName/Phone/Email / isActive / isDefault / notes) + `AddressType` enum (FATURA / ILETISIM / TESLIMAT). `Tender`'a `billingAddressSnapshot` + `deliveryAddressSnapshot` Json alanları eklendi (snapshot pattern — adres değişse de tender'da kayıt korunur). Tenant'a `addresses` back-relation. Manuel SQL.
- **Backend `tenant-addresses` modülü:** `/tenants/me/addresses` namespace. Endpoint'ler: `GET /` (filters: type, activeOnly), `GET /:id`, `POST /` (FATURA için tax info zorunlu, ilk adres otomatik default+active), `PATCH /:id` (FATURA için tax info zorunlu kalır; default kapatma → 409, son aktif/default pasifleştirme/silme → 409), `POST /:id/set-default` (atomik; pasif adres default yapılamaz), `DELETE /:id` (default → 409, son aktif → 409). COMPANY_ADMIN-only yazma. Helper: `getAddressSnapshot(tenantId, id)` + `formatAddressSnapshotText(snap)` tender service için.
- **Backend tender create/update refactor:** `CreateTenderDto` `deliveryAddress?: string` → `billingAddressId!: string` + `deliveryAddressId!: string`. `tenant-tenders.service.createDraft/updateDraft` `snapshotForType(tenantId, addressId, expected)` helper'ı ile snapshot çekip type validate eder, `Tender.billingAddressSnapshot` + `deliveryAddressSnapshot` Json'a yazar, geriye dönük uyumlu `deliveryAddress` text alanını formatlı string ile doldurur. `TenantTendersModule` artık `TenantAddressesModule` import ediyor.
- **Backend supplier-tenders findOne:** `deliveryAddressSnapshot` response shape'ine eklendi (kapalı zarf gereği fatura tarafı supplier'a gösterilmez — sadece teslimat).
- **Frontend hooks/types/labels:** `lib/addresses/{types,...}.ts` — `TenantAddress`, `CreateAddressPayload`, `UpdateAddressPayload`, `ADDRESS_TYPE_META` (label/emoji/pillClass). `hooks/use-tenant-addresses.ts` — `useTenantAddresses(filters)` + `useCreateAddress` + `useUpdateAddress` + `useSetDefaultAddress` + `useDeleteAddress`. `TenderAddressSnapshot` tipi `lib/tenders/types.ts`'e + `TenderDetail.billingAddressSnapshot/deliveryAddressSnapshot` + `SupplierTenderDetail.deliveryAddressSnapshot` field'ları.
- **Frontend `/dashboard/ayarlar/firma-tercihleri`:** Ayarlar ana sayfaya 6. kart MapPin "Firma Tercihleri" admin-only (Kullanıcı İşlemleri ile Bildirim Tercihleri arası). Sayfa: 3 collapse `AddressGroupSection` (FATURA/ILETISIM/TESLIMAT) — header (emoji + count badge + description) + tablo (No / Başlık+default badge / İl/İlçe / Aktif/Pasif / 3-nokta menü) + "Yeni Adres Ekle" CTA. `AddressFormModal` ortak component (mode: create/edit) — type radio cards (edit'te disabled), title/country/il-ilçe (TR locations), fullAddress, postalCode, FATURA için Vergi Bilgileri conditional bölümü (zod refine: `^\d{10,11}$`), iletişim opsiyonel, isDefault checkbox. BUYER/APPROVER → "Sadece Firma Yöneticileri için" warning kartı.
- **Frontend tender wizard Step 1:** `Teslimat Adresi` textarea kaldırıldı. Yerine `AddressDropdownGroup` — 2 ayrı dropdown (FATURA aktif + TESLIMAT aktif). Default adresler `useEffect` ile otomatik seçilir. Dropdown altında `SelectedAddressPreview` (title + fullAddress + il/ilçe + tax info billing'de). Hiç adres yoksa warning kart + "Adres Yönetimine Git" CTA. `tenderFormSchema`: `deliveryAddress` → `billingAddressId` + `deliveryAddressId` (her ikisi cuid required). `STEP_FIELDS[1]` + `DEFAULT_FORM_VALUES` güncel. `use-tenant-tenders.ts buildPayload` ID'leri gönderiyor. `edit-loader.tsx` snapshot'tan ID'yi initial olarak set ediyor; adres silinmişse boş kalır.
- **Frontend tender detail (buyer + supplier):** `general-info-tab.tsx`'lere `AddressSnapshotDisplay` (title + fullAddress + il/ilçe + postalCode + tax info + iletişim). Snapshot varsa render, yoksa eski `deliveryAddress` text fallback. Supplier sadece teslimat snapshot'ı görür (sealed-bid). Buyer hem fatura hem teslimat. `step-4-review` adres satırları title + il/ilçe ile özet.
- **Seed:** `ensureDemoAddresses(tenantId)` — idempotent, demo tenant'ta hiç adres yoksa 3 default adres ekler (Genel Merkez Fatura/Teslimat + Genel İletişim, hepsi Ataşehir, FATURA tax info dolu).
- **Manuel E2E doğrulama:**
  - Address CRUD: list + filter (type+activeOnly) + create + setDefault + delete ✓
  - FATURA tax info olmadan create → 400 ✓
  - Default adres delete → 409 ✓
  - setDefault sonra eski default'u sil → 200 ✓
  - Tender create billingAddressId+deliveryAddressId ile → SUPK-2026-0009 oluştu, snapshot dolu, legacy text fallback dolu ✓
  - Detail GET: `billingAddressSnapshot`/`deliveryAddressSnapshot` Json döndü ✓
  - Yanlış tip (FATURA yerine TESLIMAT id) → 400 "Fatura adresi tipi yanlış" ✓
  - Yokolan adres ID → 404 ✓
  - Cross-token: supplier token → /addresses → 401 ✓

### E.7.C — Onay Akışı Konfigürasyonu (CRUD-only; runtime E.7.D'de)
- **Schema migration `e7c_approval_flow_config`:** `ApprovalFlow` (flowNumber tenant-wide 10001+, type/status, createdBy) + `ApprovalFlowInitiator` (M2M user) + `ApprovalFlowStep` (orderIndex/approver/conditionMinAmount Decimal/conditionCurrency/displayLabel) + `ApprovalFlowType` enum (TENDER_PUBLISH/TENDER_AWARD) + `ApprovalFlowStatus` enum (DRAFT/ACTIVE/PASSIVE). User'a 3 reverse relation. Tenant'a `approvalFlows` back-relation. Manuel SQL.
- **Backend `tenant-approval-flows` modülü** (`/tenants/me/approval-flows`):
  - `GET /` (filters: type, status), `GET /:id`. include shape: `createdBy + initiators.user + steps.approver` (orderIndex asc).
  - `POST /` (COMPANY_ADMIN-only): tenant-wide flowNumber counter (`10001+`), `validateFlowConfig` (private): initiators ⊂ {COMPANY_ADMIN, BUYER} (APPROVER 400), approvers ⊂ {COMPANY_ADMIN, APPROVER} (BUYER 400), orderIndex 1..N sıralı + unique, monoton `conditionMinAmount` (her sıralı adım eşiği önceki adımdan büyük). **1-active-per-type kuralı:** ACTIVE oluşturulurken aynı tipteki diğer ACTIVE'ler atomik olarak PASSIVE'e çevrilir.
  - `PATCH /:id` (full-replace initiators+steps if sent), `PATCH /:id/status` (atomik PASSIVE→ACTIVE swap), `POST /:id/duplicate` (DRAFT + " (Kopya)" suffix), `DELETE /:id` (V1: hard delete; E.7.D'de ApprovalRequest count check eklenecek).
- **Frontend ayarlar 7. kart `Workflow` "Onay Akışları"** admin-only (Firma Tercihleri ↔ Bildirim Tercihleri arası).
- **Frontend `/dashboard/ayarlar/onay-akislari` (liste):** header + arama + tablo (No / Akış Adı / Tür pill / Durum dot+label / Adım sayısı / Oluşturan / Son Güncelleme / 3-nokta menü). Empty state. Menü aksiyonları: Görüntüle/Düzenle, Aktif/Pasif Et, Kopyala, Sil. Admin-only guard + window.confirm delete.
- **Frontend `/onay-akislari/yeni` 3-step wizard:**
  - **Step 1 (FlowInfo):** 4'lü grid type radio cards — TENDER_PUBLISH/TENDER_AWARD aktif, ORDER/PURCHASE_REQUEST disabled "YAKINDA · V2" pill. Ad (2-100) + açıklama (0-500).
  - **Step 2 (Steps):** PratisPro Resim 5 stili horizontal diagram — `Süreç Başlatıcılar` blue bordered card + `Adım N` purple bordered cards arrow ile bağlı + dashed `Yeni Adım Ekle` card. `InitiatorPickerModal` (multi-select, search, role pill, BUYER/COMPANY_ADMIN listede). `StepEditorModal` (approver select, opsiyonel etiket, opsiyonel bütçe eşiği TRY only V1, monoton frontend kontrolü + toast). Adım silme + reindex 1..N.
  - **Step 3 (Summary):** type pill + ad + açıklama + initiators chip listesi + numbered step listesi (label + approver + condition). 2 CTA: `Taslak Olarak Kaydet` + `Aktif Olarak Kaydet` (success-yeşil).
- **Frontend `/onay-akislari/[id]` detail:** Read-only 3-section view (initiators + steps + meta). 4 aksiyon butonu: `Düzenle` (in-place wizard mode="edit", aynı `ApprovalFlowWizard` component prefilled draft ile), `Aktif/Pasif Yap`, `Kopyala`, `Sil`. `useApprovalFlow` hook detail fetch (404 → error card + back link).
- **Hooks** (`use-approval-flows.ts`): `useApprovalFlows` (filters), `useApprovalFlow` (id), `useCreateApprovalFlow`, `useUpdateApprovalFlow`, `useChangeApprovalFlowStatus`, `useDuplicateApprovalFlow`, `useDeleteApprovalFlow`. Tüm mutation'lar success'te `KEYS.all` invalidate.
- **Manuel E2E doğrulama** (10 test):
  - Liste boş başlangıç ✓
  - Create (flowNumber 10001, 2 step, ACTIVE, demo metni: 10K-1M senaryo) ✓
  - Monoton eşik validasyonu (Adım 2 < Adım 1) → 400 "Adım 2 eşiği önceki adımdan büyük olmalı" ✓
  - Sıra atlama (1, 3) → 400 "Adım sıraları 1, 2, 3 şeklinde sıralı olmalı" ✓
  - 1-active-per-type: 2. ACTIVE oluştur → eski PASSIVE'e geçti ✓
  - Duplicate → flowNumber 10003, "(Kopya)" suffix, DRAFT status ✓
  - Cleanup: 3 akış cascade delete ✓
  - Cross-token: supplier → /approval-flows → 401 ✓
  - 404: bilinmeyen id → 404 (loader) ✓
  - typecheck (api+web+admin+email+shared+db) tüm yeşil ✓

### E.7.D — Onay Çalıştırma Runtime (V1 Final)
- **Schema migration `e7d_approval_request_runtime`:** `ApprovalRequest` (APR-YYYY-NNNN tenant-wide counter, polymorphic `tenderId` — V1'de sadece tender, V2'de Order/PurchaseRequest), `ApprovalRequestStep` (snapshot conditionMinAmount + displayLabel — rule sonradan değişse bile request bağımsız) + `ApprovalRequestStatus` (PENDING/APPROVED/REJECTED/CANCELLED) + `ApprovalStepStatus` (WAITING/PENDING/APPROVED/REJECTED/SKIPPED) enum'ları. **TenderStatus genişletildi:** `IN_APPROVAL` (yayın için onay bekliyor) + `IN_AWARD_APPROVAL` (kazandırma için onay bekliyor). User'a 2 yeni reverse relation, Tenant + Tender + ApprovalFlow + ApprovalFlowStep'e back-relation. Manuel SQL.
- **Backend `tenant-approval-requests` modülü** (`/tenants/me/approval-requests`):
  - `findMatchAndCreate(tx, params)` — tender service'ten transaction içinde çağrılır. Aktif `ApprovalFlow` arar (type + initiator approved), conditionMinAmount > amount ise step SKIPPED. İlk SKIPPED olmayan adım PENDING. Tüm adımlar SKIPPED ise `null` döner (caller direkt geçer). `amount <= 0` ise atlanır.
  - `GET /` (filters: status, type, initiatorUserId, tenderNumber, approvalNumber, pendingForMe), `GET /pending-count` (sidebar badge için), `GET /:id` (tender items+invitations+createdBy include + steps approver expanded).
  - `POST /:id/approve` (note opsiyonel ≤1000): pending step → APPROVED, sıradaki SKIPPED olmayan adım → PENDING (yeni approver'a `approval_required` e-posta). Tüm adımlar tamamlandıysa request → APPROVED + tender ileriye taşınır + `tender.publish.approved` veya `tender.award.approved` event emit edilir + initiator'a `approval_approved` e-posta.
  - `POST /:id/reject` (note ≥10 char zorunlu): step → REJECTED, request → REJECTED, tender geri çevrilir (PUBLISH → DRAFT, AWARD → IN_AWARD), initiator'a `approval_rejected` e-posta (rejectionNote dahil).
  - `POST /:id/cancel` (reason ≤500 opsiyonel): sadece initiator veya COMPANY_ADMIN. Request → CANCELLED, tender revert. Reason `initiatorNote`'a "İptal sebebi: ..." formatında append.
- **Backend tender service refactor:**
  - `publish(tenantId, tenderId, userId)` — Σ(targetUnitPrice × quantity) bütçesi hesaplar (boş kalemler 0). `findMatchAndCreate({ type: TENDER_PUBLISH })` ile aktif kural arar. Kural varsa: tender → IN_APPROVAL, ilk approver'a `approval_required` e-posta, response `{status:"IN_APPROVAL", approvalRequestId, approvalNumber}`. Kural yoksa: direkt OPEN_FOR_BIDS + davet e-postaları.
  - `finalizeAward(tenantId, tenderId, userId)` — winning bid'lerin Σ(winningItems totalPrice) bütçesi. Kural varsa: tender → IN_AWARD_APPROVAL + e-posta; kural yoksa: `executeFinalizeAward()` (tüm SUBMITTED → LOST, Order create, e-postalar).
  - `executeFinalizeAward()` — paylaşılan transaction (onaysız ve onaylı path'lerden çağrılır). Idempotency check (zaten AWARDED ise atla).
  - **EventEmitter pattern:** `@nestjs/event-emitter` paketi eklendi, `EventEmitterModule.forRoot()` AppModule'a register. Approval onaylandığında approval-requests-service `tender.publish.approved` veya `tender.award.approved` event emit eder. Tender service `@OnEvent` listener'ları: `handlePublishApproved` (davet e-postaları) ve `handleAwardApproved` (executeFinalizeAward + dispatchAwardEmails). Dependency cycle riski yok.
  - `findOne` response'una `activeApprovalRequest: {id, approvalNumber, type, initiatedById} | null` eklendi (banner için). `stats`'a `inApproval` + `inAwardApproval` count'ları eklendi.
- **3 yeni e-posta şablonu** (`packages/email/src/templates/`):
  - `approval_required` — yellow summary box (APR no + tender + flow + amount), opsiyonel açıklama quote box, "Onay Sürecini Görüntüle" CTA. Subject: `🔔 Onayınız bekleniyor: {tenderTitle}`.
  - `approval_approved` — green summary, "{N} aşamalı onay süreci son olarak {lastApprover} tarafından onaylandı" + actionLabel ("İhale yayınlandı, davetler gönderildi" veya "Kazandırma tamamlandı"). Subject: `✅ Onayınız tamamlandı`.
  - `approval_rejected` — red summary + reason quote box + reverseLabel ("DRAFT'a döndü" veya "IN_AWARD'a döndü"). Subject: `❌ Onay süreciniz reddedildi`.
- **Frontend `/dashboard/onay-bekleyenler`** (placeholder kaldırıldı): 2 tab "Onay Bekleyenler" (pendingForMe) / "Tüm Onay Süreçleri" (filtre bar: status, başlatan, tür, ihale no, onay no — Suspense + URL sync). Tablo: APR no (mono link) + Tür pill + İhale (no + title) + Başlatan + Adım(`X/Y`)/Statü + Tutar TRY locale + Son İşlem + Görüntüle. Empty state ClipboardCheck. 30sn refetch.
- **Frontend `/dashboard/onay-bekleyenler/[id]`:** 3 section — Üst kart (APR no + status badge + type badge + title + 6'lı meta grid + initiator note + aksiyon butonları), Onay Tarihçesi tablosu (süreç başlatıldı satırı + her step için icon + actionText + timestamp + note), İhale Özeti kartı (tender meta + invitations chips + first 10 items list + "İhale Detayını Aç" link). 3 modal: `DecisionModal` (approve/reject birleşik, reject min 10 char), `CancelModal` (warning yellow box + reverseLabel + reason).
- **Tender detay header card:** IN_APPROVAL/IN_AWARD_APPROVAL durumunda warning-50 banner — Clock pulse icon + "Onay Bekliyor — yayın askıda" / "Kazandırma Onayı Bekliyor" + APR no mono code + "Onay Sürecini Görüntüle" + "Onayı İptal Et" (sadece initiator veya COMPANY_ADMIN). `TenderLiveStatusPill` ve `TENDER_STATUS_META` 2 yeni statu için güncellendi (warning-50 / purple).
- **Tender wizard:** Yayınla butonuna basıldığında `checkAndOpenPublish()` itemlerden hedef fiyat kontrolü yapar; eksik kalem varsa `MissingTargetWarningDialog` (Geri Dön ve Düzelt / Yine de Yayınla CTA'lar). `handlePublish` IN_APPROVAL response'u algılayıp toast'unu farklılaştırır. Header card publish butonu da aynı.
- **Sidebar pending count badge:** `useApprovalPendingCount()` 60sn refetch ile sidebar'da "Onay Bekleyenler" item'ına live badge enjekte edilir (`useMemo` ile `liveNavConfig` üretilir, mevcut `SidebarItem` `item.badge > 0` rendering pattern'ı kullanılır).
- **Manuel E2E doğrulama** (8 senaryo + cross-token):
  - Boş list + pending count 0 ✓
  - Cross-token (admin → tenant approval-requests) → 401 ✓
  - 25K tender publish (eşik 10K aşılır) → IN_APPROVAL + APR-2026-0001 + Mehmet'e approval_required ✓
  - Self-approve → 403 "Bu adımda onaylama yetkiniz yok" ✓
  - Reject < 10 char → 400 "en az 10 karakter olmalıdır" ✓
  - Mehmet approve → REQUEST_APPROVED + tender → OPEN_FOR_BIDS otomatik (event emit) + ugur'a approval_approved + tedarikçiye tender_invitation ✓
  - Already-approved approve → 409 "Bu onay süreci aktif değil" ✓
  - 5K tender (eşik altı) → onaysız direkt OPEN_FOR_BIDS ✓
  - Reject 30K tender → tender DRAFT, request REJECTED, ugur'a approval_rejected ✓
  - Cancel by initiator (50K tender) → tender DRAFT, request CANCELLED ✓
  - APR numbering sequential 0001/0002/0003 ✓
  - Frontend rotaları HTTP 200 (/onay-bekleyenler + /onay-bekleyenler/:id) ✓
  - typecheck (api+web+admin+email+shared+db) tümü yeşil ✓

🎉 **V1 COMPLETE** — Tüm temel ihale yönetim akışları (D.1-D.2.B + E.1-E.7.D) tamamlandı.

### V2-1 — Resend Webhook Entegrasyonu (E-posta Delivery Tracking)
- **Schema migration `v2_resend_webhook_tracking`:**
  - `EmailStatus` enum: `DELIVERED` + `OPENED` + `CLICKED` + `BOUNCED` + `COMPLAINED` eklendi (`FAILED`'dan önce — Postgres `ALTER TYPE ADD VALUE IF NOT EXISTS BEFORE 'FAILED'`).
  - `EmailEventType` enum (yeni): SENT/DELIVERED/DELIVERY_DELAYED/BOUNCED/COMPLAINED/OPENED/CLICKED/FAILED.
  - `email_logs` tablosuna 7 alan: `deliveredAt` + `openedAt` + `clickedAt` + `bouncedAt` + `bounceType` + `bounceReason` + `complainedAt`.
  - `providerMessageId` partial UNIQUE index (NULL hariç) — webhook lookup için.
  - `email_events` yeni tablo: `eventId UNIQUE` (svix-id idempotency), `eventType`, `occurredAt`, `payload Json`, `clickedUrl?`, `bounceType?`, `bounceReason?`. FK `email_logs(id) ON DELETE CASCADE`.
- **Backend `resend-webhook` modülü** (`/api/webhooks/resend`):
  - **`WebhookSignatureGuard`** — `svix.Webhook(secret).verify(rawBody, headers)`. Headers: `svix-id` + `svix-timestamp` + `svix-signature`. Dev'de (`NODE_ENV !== production` veya secret yok) doğrulama atlanır + warning log.
  - **`ResendEventService.handleEvent(event, eventId)`** — 4 aşama: (1) idempotency check (`emailEvent.findUnique({eventId})`), (2) `EmailLog.findUnique({providerMessageId})` lookup, (3) event type → enum map (`email.delivered` → `DELIVERED`), (4) atomik transaction: `EmailEvent.create` + `EmailLog.update`.
  - **Status precedence** (`canTransitionTo`): `QUEUED < SENDING < SENT < DELIVERED < OPENED < CLICKED < FAILED < BOUNCED < COMPLAINED`. Sadece "ileri" yön. Bounce/complain her zaman geçer (status'u "geri" düşürür gibi gözükse de bunlar daha ağır). DELIVERY_DELAYED status'a yansıtılmaz; sadece event timeline'a kaydedilir.
  - `ResendWebhookController.POST /` — `@HttpCode(200)` + `@UseGuards(WebhookSignatureGuard)`. Body shape: `{ type, created_at, data: { email_id, ... } }`. svix-id zorunlu; eksikse 400.
- **`main.ts` raw body parse** — `bodyParser: false` + `app.useBodyParser("json", { verify })` ile sadece `/api/webhooks/resend` URL'si için `req.rawBody = buf` saklanır. Diğer endpoint'ler memory'i tutmaz. svix `Webhook.verify()` rawBody string'ine ihtiyaç duyar.
- **`EmailService` providerMessageId**: Mailpit nodemailer Message-ID döndürüyor (`<uuid@resend.dev>` formatı), Resend SDK kendi `id`'sini döndürür — her ikisinde de mevcut providerMessageId field'ına yazılıyor (V2-1 öncesinden mevcut, sadece partial UNIQUE index eklendi).
- **`AdminEmailLogsService.findOne`**: `events` include eklendi (`orderBy: occurredAt asc`).
- **`AdminStatsService.getOverview` `emails` shape genişletildi**: `deliveredLast24h` + `openedLast24h` + `bouncedLast24h` paralel count'ları (`deliveredAt/openedAt/bouncedAt >= last24h`).
- **`ListEmailLogsDto.EmailStatusDto` enum** 5 yeni status (DELIVERED/OPENED/CLICKED/BOUNCED/COMPLAINED) eklendi — admin liste filtre dropdown'ında çıkar.
- **Admin frontend:**
  - `lib/email-logs/types.ts` — `EmailLogStatus` 5 yeni varyant + `EmailEventType` + `EmailEvent` interface + `EmailLog.events?` opsiyonel.
  - `lib/email-logs/status.ts` — `EMAIL_STATUS_META` 5 yeni renk paleti (DELIVERED yeşil / OPENED indigo / CLICKED mor / BOUNCED kırmızı / COMPLAINED koyu kırmızı). Yeni `EMAIL_EVENT_META` event ikon/renk haritası.
  - `email-logs/_components/detail-drawer.tsx`:
    - Bounce kartı (varsa): `bounceType.toUpperCase()` + `bounceReason`.
    - **`EventTimelineSection`**: her event ayrı satır — icon (Mail/CheckCircle2/MailOpen/MousePointerClick/AlertOctagon vs.) + label + occurredAt + clickedUrl (varsa) + bounce reason. Boşsa "Mailpit dev ortamında webhook tetiklenmiyor; `pnpm test:webhook`" hint'i.
    - Tarih bölümüne 5 yeni alan: deliveredAt / openedAt / clickedAt / bouncedAt / complainedAt.
  - **Dashboard E-posta health card** — alt bölüme 3-grid breakdown (Teslim yeşil / Açılan indigo / Bounce kırmızı) eklendi. `border-t border-surface-border` ile gönderildi/başarısız satırından ayrıldı.
  - `useAdminStats` `OverviewStats.emails` 3 yeni alan typed.
- **`pnpm test:webhook` mock script** (`apps/api/src/scripts/mock-resend-events.ts`):
  - Son SENT (veya üstü) EmailLog'u bul; providerMessageId yoksa fake `re_mock_<ts>_<id6>` set et.
  - 3 event sırayla: DELIVERED → OPENED → CLICKED.
  - **Idempotency test**: aynı `mock_<ts>_clicked` event-id'si tekrar gönderilir, `{ status: "skipped", reason: "duplicate_event" }` beklenir.
  - Final state log: status, deliveredAt/openedAt/clickedAt, events count + admin URL.
  - `ts-node --transpile-only` (NestJS DI emitDecoratorMetadata gerek). package.json `test:webhook` script.
- **Manuel E2E** (5 senaryo + DB doğrulama):
  - Migration: `\d email_events` tablo + 9'lu enum_range + email_logs 7 yeni alan ✓
  - `pnpm test:emails` → 30 e-posta SENT (Mailpit `<uuid@resend.dev>` format providerMessageId) ✓
  - `pnpm test:webhook` → DELIVERED/OPENED/CLICKED 3 event işlendi, EmailLog status `CLICKED` + 3 EmailEvent ✓
  - Idempotency: aynı eventId ikinci kez → `{ status: "skipped", reason: "duplicate_event" }` ✓
  - Admin overview email breakdown: `delivered:1, opened:1, bounced:0, failed:0` (mock CLICKED zincirinden) ✓
  - Admin email-logs detail: events array 3 satır, providerMessageId, deliveredAt/openedAt/clickedAt dolu ✓
  - Webhook endpoint dev'de svix-id header eksik → 400 "svix-id header zorunlu" (guard skip ama controller seviyesi validation) ✓
  - typecheck (api+web+admin+email+shared+db) tüm yeşil ✓

> **Production'a geçiş**: Resend dashboard → Webhooks → URL `https://api.supkeys.com/api/webhooks/resend` + `RESEND_WEBHOOK_SECRET=whsec_...` env'e set edilecek. `NODE_ENV=production` ile guard tam svix imza doğrulamasına geçer; eksik secret 401 döner.

### V2-2 — Cloudflare R2 + Dosya Upload Sistemi
- **Schema migration `v2_attachments_r2`:**
  - `Attachment` polymorphic model — `tenantId` + `scope` + `scopeRefId` + `key UNIQUE` + `originalFilename` + `mimeType` + `fileSize` + `status` + `createdAt` + `finalizedAt` + `uploadedByUserId?` + `uploadedBySupplierUserId?`. İki farklı yükleyen FK'si (tenant kullanıcı veya tedarikçi kullanıcı — sadece biri set olur).
  - `AttachmentScope` enum: `TENDER_DOC` / `BID_RESPONSE` / `ORDER_INVOICE`.
  - `AttachmentStatus` enum: `PENDING` / `UPLOADED`.
  - Reverse relations: `Tenant.attachments` + `User.uploadedAttachments` + `SupplierUser.uploadedAttachments`.
  - **Polymorphic FK kullanılmadı** — Service layer hep `scope+scopeRefId` ile sorguladığı için typed back-relation gereksiz; legacy `BidAttachment`/`TenderAttachment` ile clash yaratmadan eklendi.
- **Bağımlılıklar** (`apps/api`): `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`.
- **`apps/api/src/modules/storage/storage.service.ts`** (`@Global()` provider):
  - `onModuleInit` → `R2_*` env'leri okur (placeholder `<account-id>` değerlerini de yakalar), `S3Client(region:"auto", endpoint, credentials, forcePathStyle:false)` kurar, `HeadBucketCommand` ile bağlantı health check. Hatada bootstrap fail.
  - `buildKey(tenantId, attachmentId, originalFilename)` → `{env}/{tenantId}/{attachmentId}-{sanitizedFilename}`. `envPrefix = NODE_ENV==="production" ? "prod" : "dev"`.
  - `sanitizeFilename` — `[^a-zA-Z0-9._-]` → `_`, double-underscore collapse, leading dot/under/dash strip, 100 char cap.
  - `generatePresignedPut(key, mimeType)` — TTL 15 dk.
  - `generatePresignedGet(key, originalFilename?)` — TTL 1 saat, `ResponseContentDisposition: attachment; filename="…"` ile orijinal isim restore.
  - `checkExists(key)` — `HeadObjectCommand`, 404'te `{exists:false}`.
  - `deleteObject(key)`.
- **`apps/api/src/modules/attachments/services/attachments.service.ts`:**
  - `ActorContext` discriminated union: `{ kind:"tenant", tenantId, userId, role }` veya `{ kind:"supplier", supplierId, supplierUserId }`.
  - `requestUploadUrl(actor, params)` — MIME whitelist (15 tür: pdf/doc/docx/xls/xlsx/ppt/pptx/jpg/png/webp/gif/zip/txt/csv) + 50MB tek dosya cap + `FORBIDDEN_EXTENSIONS` (exe/sh/bat/cmd/js/html/php/py/rb/msi/dll/scr) + scope yetki + 200MB tender total cap (TENDER_DOC) → Attachment(PENDING, geçici key) → real key build → presigned PUT URL.
  - `finalizeUpload(actor, attachmentId)` — owner check + HeadObject; dosya yoksa kaydı sil + 400; varsa size mismatch warn + UPLOADED + finalizedAt.
  - `list(actor, scope, scopeRefId)` — read auth + status=UPLOADED only + `uploadedByUser`/`uploadedBySupplierUser` include + `uploadedBy: { firstName, lastName, kind:"tenant"|"supplier" }` projection.
  - `getDownloadUrl(actor, attachmentId)` — read auth + presigned GET URL.
  - `delete(actor, attachmentId)` — owner check (yükleyen veya COMPANY_ADMIN, ama tedarikçinin yüklediğine tenant tarafı dokunamaz) + status guard (yayınlanmış tender → 400, SUBMITTED bid → 400) + R2 delete (best-effort) + DB delete.
  - **Yetki matrisi:**
    - **TENDER_DOC write**: sadece kendi ihalesinin tenant'ı. **Read**: kendi tenant'ı VEYA davet edilmiş tedarikçi (`tenderInvitation` lookup).
    - **BID_RESPONSE write**: sadece bid'in supplier'ı. **Read**: bid'in supplier'ı VEYA tender'ın tenant'ı.
    - **ORDER_INVOICE write/read**: order'ın tenant'ı VEYA order'ın supplier'ı.
- **2 Controller (paylaşılan service):**
  - `TenantAttachmentsController` `/api/attachments` — `JwtAuthGuard`, tenant kullanıcıları için 5 endpoint: `POST upload-url` + `POST :id/finalize` + `GET ?scope=&scopeRefId=` + `GET :id/download-url` + `DELETE :id`.
  - `SupplierAttachmentsController` `/api/supplier/attachments` — `SupplierJwtAuthGuard`, aynı 5 endpoint, supplier kullanıcıları için.
  - Cross-token koruma: tenant token → `/supplier/attachments/...` 401, tersi de 401.
- **DTO**: `RequestUploadUrlDto` (scope enum + scopeRefId + originalFilename ≤255 + mimeType + fileSize 1..50MB) + `ListAttachmentsDto` (scope + scopeRefId — Query).
- **Frontend** (`apps/web`):
  - `lib/attachments/types.ts` — `AttachmentSurface = "tenant" | "supplier"`, `AttachmentScope`, `AttachmentItem`, response shape'leri.
  - `hooks/use-attachments.ts` — surface-aware (`api` vs `supplierApi`, path prefix `/attachments` vs `/supplier/attachments`):
    - `useAttachments(surface, scope, scopeRefId)` — `enabled` koşullu, 30sn staleTime.
    - `useUploadAttachment(surface)` — 3 aşamalı mutation: (1) backend'den presigned PUT URL iste, (2) `axios.put(uploadUrl, file)` (interceptor'sız fresh axios — auth header yok, R2 query param ile imzalı), `onUploadProgress` ile percent emit, (3) backend'e `:id/finalize` POST. Success'te ilgili list query invalidate.
    - `useDeleteAttachment(surface)` + `useDownloadAttachment(surface)` (download'da `<a href={presignedUrl} download>` + `target="_blank"`).
  - `components/attachments/attachment-upload.tsx` — drag-drop zone (state-driven `isDragOver` border-brand-500 + bg-brand-50) + multi-file paralel upload + her dosya için kart (Loader2/✓/✗ + filename + progress bar `width:%` + remove X). Upload sonrası 2 sn auto-clear. Toast'lar global interceptor + manuel.
  - `components/attachments/attachment-list.tsx` — file row (icon by mimeType: FileImage/FileSpreadsheet/FileText/FileIcon + filename + size + uploadedBy + relative date + Download/Trash2 buton). `canDelete` prop + window.confirm.
- **Entegrasyon noktaları:**
  - **Tender detay `FilesTab`** (tenant + supplier ortak — `surface` prop): DRAFT/IN_APPROVAL'da AttachmentUpload + canDelete; aksi halde sadece read. Supplier surface'inde upload yok, sadece view.
  - **Supplier `TeklifForm` "Teklif Dosyaları" section'ı**: legacy base64 `AttachmentsUploader` kaldırıldı. `draftBid?.id` varsa `<AttachmentUpload scope=BID_RESPONSE>` + `<AttachmentList>`. Yoksa "Önce Taslak Olarak Kaydet" hint card. `requireBidDocument` warning korundu.
  - **Buyer Bid Detail Page**: `Section "Teklif Dosyaları"` — `AttachmentList scope=BID_RESPONSE` + `canDelete=false`. Tedarikçi yüklediği dosyaları buyer görür ama silemez.
  - Tender wizard (yeni ihale): create modunda tenderId yok → upload bölümü gösterilmedi, kullanıcı önce taslak kaydedip detay sayfasından ekler.
- **`.env.example`** — `R2_*` değişkenleri (Cloudflare R2 setup talimatı yorumlu).
- **Manuel E2E doğrulama** (kullanıcı root `/.env`'de gerçek R2 credentials'ı doldurduktan sonra çalışır — `apps/api/.env` yüklenmez, ConfigModule `envFilePath: "../../.env"`):
  - Schema: `\d attachments` tablo + `enum_range(AttachmentScope)` `{TENDER_DOC,BID_RESPONSE,ORDER_INVOICE}` + `AttachmentStatus` `{PENDING,UPLOADED}` ✓
  - Bağımlılıklar: `@aws-sdk/client-s3@^3.x` + `@aws-sdk/s3-request-presigner@^3.x` `pnpm add` başarılı (+92 transitive) ✓
  - typecheck 6/6 (api+web+admin+email+shared+db) yeşil ✓
  - **Kullanıcı tarafı bekleyen**: gerçek R2 credentials → API reload → bucket health log → browser'dan upload/download/delete + Cloudflare R2 console doğrulama (8 senaryo: upload, list, download, delete, MIME reject, size reject, cross-tenant 403, published-tender delete-block) — kullanıcı bu env'leri verince tek tıkla test edilebilir.

> **R2 setup**: Cloudflare Dashboard → R2 → bucket oluştur (ad fark etmez; `R2_BUCKET` env'i ile eşleştir). Bu kurulumda bucket adı `supkeys-documents`. Manage R2 API Tokens → Create Token → "Object Read & Write" permission, bucket scope'lu. Token oluşunca `R2_ACCOUNT_ID` (Cloudflare hesap ID), `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`, `R2_BUCKET=<bucket-adı>` **root `/.env`'e** yazılır (ConfigModule sadece root .env'i okur). Sonra API restart.

> **Bilinen tuzaklar**: (1) `tsconfig.tsbuildinfo` bozuksa `tsc` sessizce hiçbir dosya emit etmez — `rm tsconfig.tsbuildinfo && tsc` ile force rebuild. (2) `R2_BUCKET` env'i set edilmezse StorageService bootstrap fail eder — fallback default kaldırıldı, hatalı sessiz bağlanmayı önlemek için. (3) HeadBucket 404 → bucket adı yanlış veya token bu bucket'a scope'lu değil; doğrulama için ListBuckets ile token'ın gördüğü bucket'ları listele.

### Polish-3 — UX Hijyeni (Form Hatası TR + Interceptor + Mobile + E-posta QA)
- **Backend `common/error-messages.ts`** — TR doğrulama sözlüğü (`VALIDATION_MESSAGES` REQUIRED/EMAIL_INVALID/STRING_MIN(n)/NUMBER_MIN(n) vs + `BUSINESS_MESSAGES` NOT_FOUND/FORBIDDEN/CONFLICT vs) + **`translateValidatorMessage`** helper: class-validator İngilizce default mesajlarını regex pattern matching ile TR'ye çevirir. "longer than or equal to N" / "must be one of the following values" / "property X should not exist" gibi 15+ pattern.
- **Backend `main.ts` ValidationPipe `exceptionFactory`** — `BadRequestException({ statusCode:400, error, message:"Doğrulama hatası", errors: { field: msg } })` structured response. Children dahil recursive collect; class-validator constraint'lerin ilk mesajı TR'ye çevrilir.
- **Frontend `api.ts` interceptor genişletmeleri** (`apps/web` + `apps/admin` + `supplier-auth/api.ts`):
  - 401 mevcut davranış korunur (token clear + redirect, public sayfada sessiz).
  - 403 → "Bu işlem için yetkiniz yok" toast.
  - 404 → sadece detail endpoint'lerde toast (URL `/{resource}/{id}` regex). Liste 404 sessiz.
  - 400 + `errors` object → toast atılmaz, propagate (component inline gösterir). Aksi halde `message` toast.
  - 409 / 422 → message toast. 5xx → "Sunucu hatası" toast. Network (no response) → "Bağlantı hatası" toast.
  - `pickMessage` helper — `message` string veya string[] olabilir.
- **Frontend `lib/form-errors.ts`** (`apps/web` + `apps/admin`):
  - `extractFieldErrors(error)` — `400 + errors` object varsa `Record<string, string>` döner, yoksa boş.
  - `extractErrorMessage(error, fallback)` — generic mesaj çıkarıcı.
- **Frontend `components/forms/form-field.tsx`** (`apps/web` + `apps/admin`):
  - Label + required marker (kırmızı `*`) + children + error inline (AlertCircle ikonlu, danger-600) + hint (error yokken).
  - Kullanım: `<FormField label="E-posta" required error={fieldErrors.email}><Input ... /></FormField>`.
- **iOS Safari zoom-on-focus engelleme** (`apps/web` + `apps/admin` `globals.css`):
  - `@media (max-width:640px)` `input/textarea/select { font-size:16px }`. Mobile'de 16px altı font-size'lı input'a focus iOS otomatik zoom yapar; bu kural önler.
- **Backend `pnpm test:emails` script** (`apps/api/src/scripts/test-emails.ts`):
  - 30 e-posta varyantını (16 base template + parametre varyasyonları) Mailpit'e tek seferde enqueue eder. `NestFactory.createApplicationContext` + `EmailQueue.enqueue`.
  - **`ts-node --transpile-only`**: tsx `emitDecoratorMetadata` desteklemiyor, NestJS DI için ts-node şart.
  - `tsconfig.json` exclude: `src/scripts/**/*` (build target değil — sadece runtime CLI).
  - Tüm template'ler için gerçekçi sample data (yeni/mevcut tedarikçi davet, fallback approval, 3 ayrı order_status_changed varyantı).
- **Manuel E2E** (4 senaryo + email QA):
  - Login boş body → `400 { errors: { email: "Geçerli bir e-posta...", password: "En az 1 karakter olmalı" } }` ✓
  - Geçersiz email format → `errors.email` TR mesaj ✓
  - `forbidNonWhitelisted` extra field → `errors.extra: "Bu alan kabul edilmiyor"` ✓
  - SQL injection sort (`?sort=DROP+TABLE--`) → `errors.sort: "Geçersiz seçim"` (whitelist'ten) ✓
  - `pnpm test:emails` → 30 şablon enqueue edildi, hepsi Mailpit'e SENT durumunda ulaştı (DB'de `email_logs` `qa-mailpit@supkeys-dev.local` query 30 satır SENT). Mailpit UI üzerinden http://localhost:8025'te görsel inceleme yapılabilir.
  - typecheck (api+web+admin+email+shared+db) tüm yeşil ✓

> NOT — Mobile responsive (sidebar drawer, tablo card view, modal full-screen): Tenant sidebar `mobileOpen` drawer çoktan mevcut (Polish öncesi). Diğer mobile fix'ler (tablo card view 768px, modal `inset-0` 640px, supplier sidebar drawer) Polish-3 scope'unda DOKUNULMADI — V2'de "mobile responsive sweep" ayrı sprint olarak ele alınacak. iOS zoom prevention CSS hızlı kazanç olarak eklendi (en sık şikayet edilen mobile bug).

### Polish-2 — Admin Paneli + KPI Agregasyonu
- **3 yeni backend modülü** (`apps/api/src/modules/`):
  - **`admin-stats`** (`/admin/stats/`):
    - `getOverview()` — paralel sorgular: tenants/suppliers/tenders/orders × `total + newThisMonth + newLastMonth + activeThisMonth + deltaPercent`. ApprovalRequests `totalPending + staleOver3Days`. Emails `sentLast24h + failedLast24h + failureRate%`. `deltaPercent()` helper (önceki 0 → mevcut > 0 ise %100, aksi `(curr-prev)/prev * 100`). 22 paralel `Promise.all` count.
    - `getRecentActivity(limit, max=50)` — son `recentTenders + recentOrders + recentRegistrations` (her biri tenant+createdBy include).
    - `getTenderTrend(days=30, max=90)` — `$queryRaw` ile `DATE_TRUNC('day', "createdAt")` gruplandırma (`tenders` tablosu camelCase quote'lu). Eksik günleri 0 ile doldurma.
  - **`admin-tenants`** (`/admin/tenants/`):
    - `list()` — `ListAdminTenantsDto` whitelist sort (createdAt|name × asc|desc). Search OR (name + taxNumber + users.email). `_count: { users, tenders, orders, supplierRelations(ACTIVE) }` + ilk COMPANY_ADMIN user.
    - `getOne(id)` — analytics: `tendersByStatus + ordersByStatus` Prisma `groupBy` + `totalSpendCompleted` aggregate (sum `totalAmount` where COMPLETED) + `recentTenders` (5) + tüm users (role/lastLoginAt).
  - **`admin-suppliers`** (`/admin/suppliers/`):
    - `list()` — sort whitelist (createdAt|companyName), search OR (companyName + taxNumber + users.email), membership filter STANDARD/PREMIUM. `_count: { users, bids, orders, tenantRelations(ACTIVE) }`.
    - `getOne(id)` — analytics: `bidsByStatus + ordersByStatus` groupBy + `totalRevenueCompleted` aggregate + `winRatePercent` (private `calculateWinRate`: AWARDED_FULL+PARTIAL / decided where decided = AWARDED+LOST).
- **AppModule register**: 3 modül eklendi.
- **Admin frontend** (`apps/admin/`):
  - **Yeni paketler**: `recharts@2`, `use-debounce@10`.
  - **6 list component port** (`components/list/`): SearchInput / FilterBar / SortDropdown / EmptyState (no-data + no-results) / ListSkeleton / ResultCount + `index.ts`. Web'den birebir kopyalandı (admin theme aynı brand-* token + surface-border).
  - **`useListFilters<T>` hook port** (`hooks/use-list-filters.ts`).
  - **3 yeni hook** (`hooks/`):
    - `useAdminStats.ts` — `useAdminOverview` (60sn refetchInterval) / `useAdminRecentActivity` / `useAdminTenderTrend` (5dk staleTime).
    - `useAdminTenants.ts` — `useAdminTenants(params)` + `useAdminTenantDetail(id)`.
    - `useAdminSuppliers.ts` — `useAdminSuppliers(params)` + `useAdminSupplierDetail(id)`.
- **`/admin/dashboard` (refactor)**: Placeholder kartları kaldırıldı.
  - Header + canlı pulse indicator (60sn refetch).
  - 4 KPI card (Tenant/Tedarikçi/İhale/Sipariş): icon + accent bg + label + value (TR locale) + sub + delta% (TrendingUp/Down) + clickable href (Tenant→/admin/tenants, Supplier→/admin/suppliers). `KpiGridSkeleton` loading.
  - Health row 2 kart: Onay Süreçleri (warning border eğer stale>0) + E-posta (danger border eğer failure>5%).
  - **`TrendChart` Recharts**: `LineChart` (#2563eb 2px stroke) + CartesianGrid + Tooltip + ResponsiveContainer 240px height. Veri 30 gün format `d MMM` TR.
  - 2 panel: Son Kayıtlar (clickable → tenant detay) + Son İhaleler (status badge).
- **`/admin/tenants` liste**: Polish-1 pattern — SearchInput + SortDropdown + ResultCount + ListSkeleton + EmptyState 2-variant + `useListFilters` URL sync. Tablo: Firma (logo+isim+şehir) / VKN / Yetkili (ilk admin) / Kullanıcı / İhale / Sipariş / Kayıt. Pagination önceki/sonraki (mini).
- **`/admin/tenants/[id]` detay**:
  - Header + back link.
  - 4 mini KPI (Kullanıcı/Aktif Tedarikçi/İhale/Sipariş) accent renkler.
  - **Yeşil gradient kart**: Toplam Harcama (TRY locale 2 ondalık).
  - 2 status distribution kart: İhale Durumları + Sipariş Durumları (groupBy → label/count satırları).
  - Son İhaleler (5) + Tüm Kullanıcılar (rol + son giriş).
- **`/admin/suppliers` liste**: Aynı Polish-1 pattern. Ek: membership filtre dropdown (STANDARD/PREMIUM). Tablo: Tedarikçi (logo+isim+şehir) / VKN / Üyelik+Engelli badge / Aktif Alıcı / Teklif / Sipariş / Kayıt.
- **`/admin/suppliers/[id]` detay**:
  - Header + membership badge + Engelli badge (şartlı).
  - 4 mini KPI (Kullanıcı/Aktif Alıcı/Teklif/Sipariş).
  - **Mor-indigo gradient**: Kazanma Oranı (`%X` decided bid'lere göre).
  - **Yeşil gradient**: Toplam Gelir (COMPLETED siparişler).
  - 2 status dağılımı: Teklif Durumları + Sipariş Durumları.
  - Kullanıcılar (telefon + son giriş).
- **Admin sidebar**: "Müşteri Firmaları" + "Tedarikçiler" `disabled: true` kaldırıldı, artık linkli.
- **Manuel E2E** (10 senaryo + 3 frontend route):
  - Admin login + overview KPI doğru: 2 tenants / 2 suppliers / 8 tenders / 0 orders DB count'larıyla eşleşti ✓
  - Recent activity 3 tender + 0 order + 2 registration ✓
  - Tender trend 31 gün, 7 toplam (2026-05-02: 3, 2026-05-03: 1, 2026-05-04: 3) ✓
  - Tenants list (`?sort=name:asc`) → BBB → Demo Şirket ✓
  - Tenant detail analytics: tendersByStatus groupBy çalıştı (OPEN_FOR_BIDS:1, IN_AWARD:2) ✓
  - Suppliers list (`?sort=companyName:asc`) → 1 teklif var ✓
  - Supplier detail winRate: 0% (sadece SUBMITTED bid var, decided yok) ✓
  - Cross-token: tenant token → /admin/stats/overview → 401 "Geçersiz token tipi" ✓
  - Sort SQL injection (`?sort=DROP+TABLE--`) → 400 whitelist ✓
  - Non-existing tenant → 404 "Tenant bulunamadı" ✓
  - Frontend rotaları (`/admin/dashboard`, `/admin/tenants`, `/admin/suppliers`) HTTP 200 ✓
  - typecheck (api+web+admin+email+shared+db) tüm yeşil ✓

### Polish-1 — Liste Sayfaları UX Standardizasyonu
- **Yeni paket:** `use-debounce@10` (apps/web).
- **6 ortak component** (`apps/web/src/components/list/`):
  - `SearchInput` — debounced (default 300ms) input + `X` clear butonu, dış `value` prop'u senkronlu.
  - `FilterBar` — children + activeFilterCount + onClearAll genel container.
  - `SortDropdown` — pre-defined `SortOption[]` (value/label) + ArrowUpDown ikonlu select.
  - `EmptyState` — `variant: "no-data" | "no-results"` (renkli vs nötr accent), `icon` + `title` + `description?` + `action?`.
  - `ListSkeleton` — `rows` prop'u ile avatar + 2 metin + pill placeholder satırlar.
  - `ResultCount` — `total` + `isFiltered` (TR locale formatla; "filtrelenmiş" suffix).
  - `index.ts` ile toplu re-export.
- **`useListFilters<T>` hook** (`hooks/use-list-filters.ts`) — URL query string sync. `setFilters` boş/false/undefined değerleri URL'den siler ve `page` parametresini otomatik 1'e döndürür (kullanıcı page güncellemiyorsa). `clearFilters` bare URL'e döner. `activeFilterCount` `page+sort` dışındaki keys'i sayar.
- **Backend search OR + sort whitelist:**
  - **tenant-orders + supplier-orders DTO'ları:** `OrderStatus` enum'una `IN_DELIVERY` eklendi (legacy uyum için). `ORDER_SORT_OPTIONS = ["createdAt:desc","createdAt:asc","totalAmount:desc","totalAmount:asc"]` `@IsIn` whitelist. `parseOrderSort()` helper Prisma `orderBy` çevirir; geçersizse `createdAt:desc` fallback.
  - **tenant-tenders DTO:** `TenderStatusDto` enum'a `IN_APPROVAL` + `IN_AWARD_APPROVAL` eklendi. `TENDER_SORT_OPTIONS = ["createdAt:desc","createdAt:asc","bidsCloseAt:asc","bidsCloseAt:desc"]`. `parseTenderSort()` helper.
  - **supplier-tenders DTO:** `SUPPLIER_TENDER_SORT_OPTIONS` eklendi (default: yakın biten önce + yeni → eski). Service inline `parseTenderSort` whitelist parse.
  - **tenant-approval-requests DTO:** `search?: string` (max 100 char) eklendi. Service'te `where.AND` array merge ile generic OR (`approvalNumber` + `tender.tenderNumber` + `tender.title`) `contains insensitive`.
- **Frontend liste sayfaları refactor:**
  - `/dashboard/siparisler` (orders-list-view): manuel debounce kaldırıldı → `SearchInput`. Yeni: `SortDropdown` + `ResultCount` + `ListSkeleton` (loader yerine) + `EmptyStateComponent` 2-variant (no-data → "İhale Oluştur" CTA / no-results → "Filtreleri temizle"). Sort URL `?sort=...`, filter değişimi page=1 reset.
  - `/supplier/siparisler` (supplier-orders-list-view): aynı pattern (alıcı bilgisi search içinde).
  - `/dashboard/ihaleler` (ihaleler-view): manuel debounce + ayrı "Temizle" butonu kaldırıldı → `SearchInput`. Yeni: `SortDropdown` (En Yeni / En Eski / Yakın Biten / Uzak Biten) + `ResultCount`. updateUrl `sort` desteği eklendi, search değişiminde page=1 reset.
  - `/supplier/ihaleler` (supplier ihaleler-view): aynı pattern, default sort "Yakın Biten" (supplier öncelikli).
  - `/dashboard/onay-bekleyenler`: 2 ayrı Input (tenderNumber + approvalNumber) tek `SearchInput` ile birleştirildi (backend `search` field'ı OR ile her ikisini ve title'ı kapsar). 5'li grid → 3'lü (status / başlatan / tür) + 1 SearchInput satırı. `ResultCount` + `EmptyStateComponent` 2-variant + `ListSkeleton`. `activeFilterCount` 4 alanı sayar.
  - `/dashboard/tedarikciler`: Mevcut 3-tab (Onaylı / Davet Bekleyen / Engelli) + filters-bar yapısı korundu (zaten stable + komplekstir).
- **Frontend hook'ları sort param eklendi:** `useOrders`, `useSupplierOrders`, `useTenders`, `useSupplierTenders` `params.sort` API'ye geçer. `useApprovalRequests` `params.search` eklendi.
- **Frontend types:** `ListTendersParams` + `ListSupplierTendersParams` + `ListOrdersParams` + `ListApprovalRequestsParams` `sort?: string` ve `search?: string` (approval) eklendi. `OrderStatus` type'ına `IN_DELIVERY` eklendi.
- **Manuel E2E** (8 senaryo + frontend route 200 testleri):
  - Geçerli sort (createdAt:desc) → 200, items dönüyor ✓
  - SQL injection (`DROP TABLE--`) → 400 whitelist enforce ✓
  - Geçersiz sort field → 400 whitelist ✓
  - Negatif page (-1) → 400 `Min(1)` validation ✓
  - Search "demo" → DB query OR çalıştı ✓
  - Tender sort `bidsCloseAt:asc` → items doğru sıralı (3 item bulundu) ✓
  - Approval requests `?search=APR` → search field server-side aktif ✓
  - Frontend rotaları (`/dashboard/siparisler`, `/dashboard/ihaleler`, `/dashboard/onay-bekleyenler`, `?sort=...&status=PENDING`) HTTP 200 ✓
  - typecheck (api+web+admin+email+shared+db) tüm yeşil ✓

### V1.5 Oturum 2 — Sipariş PDF Export + Onay Reminder Cron + Data Cleanup
- **Schema migration `v15_approval_reminder_field`:** `ApprovalRequest.lastReminderAt DateTime?` eklendi (idempotency için — son reminder gönderim zamanı). Manuel SQL.
- **Puppeteer kurulumu:** `puppeteer@24` apps/api'ye eklendi. `chrome-headless-shell` + `chrome` browsers `~/.cache/puppeteer/`'a indirildi (~170MB+). Production Docker image'ı için `chromium` + libnspr3/libgbm/libnss3 bağımlılıkları gerek (V2 hosting'de Alpine + chromium image).
- **Backend `pdf` modülü** (`@Global` — tüm app'te tek browser instance):
  - `PdfService onModuleInit` — sessiz lazy launch, hata olursa `Puppeteer init deferred` warning + ilk `generatePdfFromHtml` çağrısında tekrar dener (`ensureBrowser`). `--no-sandbox --disable-dev-shm-usage --disable-gpu` args.
  - `generatePdfFromHtml(html, options)` — `page.setContent(networkidle0, 30s timeout)` + `page.pdf({format: A4, margin: 0, printBackground: true})`. Buffer döner.
  - `onModuleDestroy` — graceful close.
- **Backend `order-pdf` modülü** (shared, tenant + supplier order modüllerinde import):
  - `OrderPdfService.generateOrderPdf(orderId, scope)` — order'ı tüm ilişkilerle çeker (tenant/supplier/tender/bid+winningItems/supplier.users[0]). `scope.tenantId || scope.supplierId` kontrolü 403 attığı için cross-tenant izolasyonu garantili.
  - **Snapshot fallback pattern:** `tender.billingAddressSnapshot` varsa buyer için kullanır (tax info dahil), yoksa `tenant`'tan formatlar. `deliveryAddressSnapshot` varsa, yoksa `tender.deliveryAddress` text fallback.
  - **Items hesabı:** `bid.items` `isWinner=true`, `awardedQuantity ?? tenderItem.quantity` × `unitPrice` = `totalPrice`. KDV %20 sabit (V1.5), `subtotal + vatAmount = total`.
  - Status TR label sabit map (`PENDING/IN_DELIVERY/COMPLETED/CANCELLED + legacy`).
- **Order PDF HTML template** (`pdf/templates/order-pdf.template.ts`):
  - A4 page, brand-blue gradient header (`#2563eb→#1e40af`), supkeys logo + sub-tagline, sağ üstte sipariş no + status pill.
  - 4 ana bölüm: Sipariş Bilgileri (tarih/ihale ref/title/tahmini teslim) + Teslimat Adresi (snapshot pre-line) + 2 info card (Alıcı/Tedarikçi: VKN/vergi dairesi/adres/iletişim) + Kalemler tablosu (#/Ürün+desc/Miktar/Birim/Birim Fiyat/Toplam) + Totals box (Ara Toplam / KDV %20 / Genel Toplam).
  - Notlar bölümü (varsa Teklif Notu + Teslimat Notu — yellow `#fef3c7` callout).
  - **2 imza kutusu** (Alıcı + Tedarikçi şirket adı + dashed `İmza & Tarih` placeholder).
  - Footer "Bu belge supkeys.com üzerinden ... oluşturulmuştur".
  - HTML escape utility (XSS koruması: `&<>"'` → entity).
- **Endpoint'ler:**
  - `GET /tenants/me/orders/:id/pdf` — `Res()` express response, `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="Siparis-ORD-2026-XXXX.pdf"`.
  - `GET /supplier/orders/:id/pdf` — supplier scope, aynı filename.
- **Frontend hook'lar:**
  - `useDownloadTenantOrderPdf` (use-tenant-orders.ts) — `api.get(path, {responseType:'blob'})` + `URL.createObjectURL` + `<a download>` trigger.
  - `useDownloadSupplierOrderPdf` (use-supplier-orders.ts) — `supplierApi` instance.
  - Helper `triggerBrowserDownload(blob, filename)` ortak download flow.
- **Frontend "PDF İndir" butonları:**
  - Tenant order detay header — sağ köşede `Button variant="secondary"` `FileDown` icon. Loading state `loading={isPending}`. Toast success/error.
  - Supplier order detay header — aynı buton, supplier hook + supplier api.
- **Backend `ApprovalReminderService`:**
  - `@Cron("0 9 * * *", { timeZone: "Europe/Istanbul" })` — her gün İstanbul saati 09:00.
  - `sendReminders()`: `status=PENDING` + `startedAt < now-3d` + (`lastReminderAt IS NULL` OR `lastReminderAt < now-3d`) filtresi. Batch 50.
  - Her stale request için ilk PENDING step'i çek + approver `isActive` kontrol → pasifse atla (fallback cron ilgilenir). `approval_reminder` e-posta gönder + `lastReminderAt` güncelle. Başarısızsa skip count, error log.
  - `daysWaiting = floor((now - startedAt) / DAY_MS)` — minimum 1.
  - `POST /tenants/me/approval-requests/trigger-reminders` (RolesGuard COMPANY_ADMIN) — manuel test/operasyonel tetikleme. `{sent, skipped}` döner.
- **E-posta `approval_reminder`** (yeni, 4. approval template):
  - Subject: `⏰ Onay hatırlatma: {tenderTitle} ({daysWaiting} gündür bekliyor)`.
  - Yellow summary box (`#fffbeb` border `#fde68a`): `{APR no} · {daysWaiting} gündür bekliyor` + tenderTitle + `{tenderNumber} · {flowName}` + `{amount} {currency}` (display font 22px).
  - Footer info: "Bu hatırlatma 3 gün içinde cevap verilmediği için otomatik gönderildi. 3 gün sonra tekrar hatırlatılacak."
- **DB cleanup script `v15-cleanup`** (`packages/db/prisma/scripts/v15-cleanup.ts`):
  - PENDING_TENANT_APPROVAL → ACTIVE (defansif).
  - `userInvitation.expiresAt < now` AND `status=PENDING` → `EXPIRED`.
  - 30+ gün önce FAILED EmailLog count raporlaması (silinmez).
  - `package.json` script: `pnpm --filter @supkeys/db v15-cleanup`.
- **Manuel E2E doğrulama:**
  - cleanup script: 0 PENDING + 0 expired + 0 old failed (boş ortam) ✓
  - cleanup script: test expired invitation ekle → 1 expired UserInvitation marked EXPIRED ✓
  - reminder cron: 25K tender publish → IN_APPROVAL + APR-2026-0001 → startedAt=now-4d → manuel trigger → `sent:1` + `approval_reminder` email SENT (subject: "⏰ Onay hatırlatma... (4 gündür bekliyor)") + `lastReminderAt` set ✓
  - reminder idempotency: tekrar trigger → `sent:0` (lastReminderAt yeni) ✓
  - reminder re-reminder: lastReminderAt=now-4d → trigger → `sent:1` (tekrar gönderildi) ✓
  - PDF endpoints mounted (`/api/tenants/me/orders/:id/pdf` + `/api/supplier/orders/:id/pdf`) ✓
  - PDF endpoint auth/scope: yok-id → 404 "Sipariş bulunamadı" ✓
  - **Puppeteer Chromium runtime smoke test WSL host'ta libnspr4 bağımlılığı eksik** — `Puppeteer init deferred` warning. Çalıştırmak için: `sudo apt-get install -y libnss3 libnspr4 libgbm1 libgtk-3-0 libxcomposite1 libxdamage1 libxrandr2 libasound2t64 libatk-bridge2.0-0t64 libxkbcommon0 libpango-1.0-0 libcairo2 fonts-liberation libxshmfence1`. Production Docker image'ında pre-installed.
  - typecheck (api+web+admin+email+shared+db) tümü yeşil ✓

### V1.5 Oturum 1 — Sipariş Workflow + Approver Fallback
- **Schema migration `v15_order_status_workflow`:** `OrderStatus` enum'una `IN_DELIVERY` eklendi (PENDING'den sonra; legacy ACCEPTED/IN_PROGRESS/DELIVERED reserved). `Order`'a workflow alanları: `deliveryStartedAt`, `deliveryStartedById` + `deliveryStartedBy User?` relation, `deliveryNote @db.Text`, `expectedDeliveryDate`, `completedAt`, `completedById` + `completedBy User?` relation, `completedNote @db.Text`, `cancelledAt`, `cancelledById` + `cancelledBy User?` relation, `cancelReason @db.Text`. User'a 3 yeni reverse relation. FK constraints `users(id)` `ON DELETE SET NULL`.
- **Backend tenant-orders genişletildi** (`/tenants/me/orders`):
  - `POST /:id/complete` (RolesGuard COMPANY_ADMIN/BUYER): IN_DELIVERY → COMPLETED, `completedNote` opsiyonel ≤500 char, tedarikçiye `order_status_changed` (COMPLETED) e-posta.
  - `POST /:id/cancel`: PENDING/IN_DELIVERY → CANCELLED, `reason` zorunlu 10-500 char, COMPLETED/CANCELLED'dayken 409, tedarikçiye `order_status_changed` (CANCELLED) e-posta.
  - `findOne` include genişletildi (deliveryStartedBy/completedBy/cancelledBy User select). `stats` V1.5 formatına geçti: `{total, pending, inDelivery, completed, cancelled}`.
  - Module: `EmailModule` import eklendi, `EmailQueue` + `ConfigService` inject.
- **Backend supplier-orders genişletildi** (`/supplier/orders`):
  - `POST /:id/start-delivery` (SupplierJwtAuthGuard): PENDING → IN_DELIVERY, `deliveryNote` ≤500 char + `expectedDeliveryDate` ISO opsiyonel. `deliveryStartedById` NULL bırakılır (SupplierUser ayrı tablo, FK uyumsuzluğu — info implicit). Alıcı COMPANY_ADMIN'e `order_status_changed` (IN_DELIVERY) e-posta + tahmini teslim tarihi.
  - `findOne` include genişletildi (3 user select), `stats` V1.5 formatına geçti.
- **State machine validasyonları** (transaction içinde): PENDING → IN_DELIVERY (supplier), IN_DELIVERY → COMPLETED (tenant), PENDING/IN_DELIVERY → CANCELLED (tenant), COMPLETED/CANCELLED final state. Yanlış geçişlerde 409.
- **Frontend `/dashboard/siparisler` + `/supplier/siparisler` listesi:**
  - TABS V1.5'e güncel: Tümü / Bekliyor / Teslimatta / Tamamlandı / İptal Edildi (legacy ACCEPTED/IN_PROGRESS/DELIVERED kaldırıldı).
  - KPI cards: Toplam / Bekliyor / Teslimatta (mavi) / Tamamlandı (yeşil) — `useOrderStats`/`useSupplierOrderStats` invariant.
  - `ORDER_STATUS_META` IN_DELIVERY için mavi pill + dot, COMPLETED yeşil, CANCELLED kırmızı. Eski statuslar (ACCEPTED/IN_PROGRESS/DELIVERED) backward-compat için bırakıldı.
- **Frontend tenant order detay** (`/dashboard/siparisler/[id]`):
  - `TenantOrderActions` banner: PENDING → "Tedarikçinin teslimat başlatması bekleniyor" + İptal CTA; IN_DELIVERY → "Teslim Aldım" success + İptal CTA; COMPLETED → success info; CANCELLED → danger info.
  - `CompleteOrderModal` (success-yeşil, opsiyonel not ≤500 char) + `CancelOrderModal` (danger-kırmızı, sebep 10-500 char zorunlu, danger-50 warning kutu).
  - Yeni section: **Sipariş Geçmişi** — `OrderTimeline` ortak component (Sipariş Oluşturuldu / Teslimat Başlatıldı / Teslim Alındı / İptal Edildi events with icon + timestamp + actor + meta).
  - Hooks: `useCompleteOrder`, `useCancelOrder` (TanStack Query, KEYS.all + detail invalidate).
- **Frontend supplier order detay** (`/supplier/siparisler/[id]`):
  - `SupplierOrderActions` banner: PENDING → "Teslimat Başlat" mavi CTA; IN_DELIVERY → "Alıcının onayı bekleniyor" warning info; COMPLETED → success; CANCELLED → danger banner + sebep.
  - `StartDeliveryModal` (mavi tema, opsiyonel kargo notu + opsiyonel tahmini tarih). Tarih min=bugün.
  - `OrderTimeline` aynı component, supplier tarafında da render.
  - Hook: `useStartDelivery` (supplier API'den).
- **3 yeni ortak component** (`@/components/orders/`): `complete-order-modal.tsx`, `cancel-order-modal.tsx`, `start-delivery-modal.tsx`, `order-timeline.tsx`. Hepsi Radix Dialog + Field/Label/Textarea/Input.
- **E-posta `order_status_changed`:** Dynamic 3-status content (IN_DELIVERY mavi / COMPLETED yeşil / CANCELLED kırmızı). `recipient: "buyer" | "supplier"` discriminator → headingForBuyer vs headingForSupplier (örn. "Sipariş için teslimat başlatıldı" vs "Siparişiniz teslimat sürecinde"). Opsiyonel not + opsiyonel `expectedDeliveryDate` (TR locale format). Subject örnek: `🚚 Sipariş teslimat sürecinde: {tenderTitle}`, `✅ Sipariş tamamlandı`, `❌ Sipariş iptal edildi`. text + html.
- **Approver pasifleştirilirse cron-tabanlı fallback** (`@Cron(EVERY_MINUTE)` `fallbackInactiveApprovers` in `TenantApprovalRequestsService`):
  - PENDING request'lerde PENDING step'i olup `approver.isActive=false` olanlar batch 50 fetch.
  - Her step için: aynı tenant'taki ilk ACTIVE COMPANY_ADMIN'i bulur (eski approver hariç, createdAt asc), step'in `approverUserId`'sini günceller.
  - Idempotency: zaten admin ise atla. Admin yoksa error log + skip (V2'de support@supkeys.com alert).
  - Yeni approver'a `approval_required` e-postası `isFallback: true` + `originalApproverName` flag'leri ile. Subject prefix `[Otomatik Atama]`.
  - `ApprovalRequiredData` typeına `isFallback?` + `originalApproverName?` eklendi. Şablon body'sinde sarı warning banner (HTML + text).
- **Manuel E2E doğrulama** (10 senaryo + 3 fallback senaryosu):
  - Stats yeni format `{total, pending, inDelivery, completed, cancelled}` ✓
  - Tenant complete (PENDING'deyken) → 409 "Sadece IN_DELIVERY..." ✓
  - Tenant cancel < 10 char → 400 "must be longer than..." ✓
  - Supplier startDelivery → IN_DELIVERY + alanlar dolu (deliveryNote, expectedDeliveryDate) ✓
  - `order_status_changed` IN_DELIVERY e-posta ugur'a SENT ✓
  - Supplier startDelivery (zaten IN_DELIVERY) → 409 ✓
  - Tenant complete → COMPLETED + completedAt + note dolu ✓
  - `order_status_changed` COMPLETED tedarikçiye SENT ✓
  - COMPLETED'i tekrar complete → 409, COMPLETED'i cancel → 409 ✓
  - Tenant cancel (IN_DELIVERY → CANCELLED) → cancelReason dolu ✓
  - `order_status_changed` CANCELLED tedarikçiye SENT ✓
  - Approver fallback: 25K tender publish → IN_APPROVAL + Mehmet'e e-posta → Mehmet pasifleştir → 65sn bekle → step approver=ugur (admin'e fallback), ugur'a `approval_required` e-postası `isFallback` banner'ıyla SENT ✓
  - typecheck (api+web+admin+email+shared+db) tümü yeşil ✓

---

## Bekleyen — V1.5 / V2 / V3

### V1.5 (kısa vadeli)
- Hosting / production setup (Coolify + Hetzner, Docker image with Chromium pre-installed for PDF)
- Sipariş üzerinde mesajlaşma (V2 olabilir)
- Sipariş listesi gelişmiş filtreleme/arama
- Admin dashboard KPI'ları (demo + buyer + supplier stats agregasyonu)

### V2 (orta vadeli)
- TCMB API + döviz kuru dönüşümü (çoklu para birimi karşılaştırması)
- ~~MinIO presigned URL — V1'de base64 data URL~~ → **V2-2'de Cloudflare R2 ile tamamlandı** (TENDER_DOC + BID_RESPONSE + ORDER_INVOICE)
- Resend domain doğrulaması + webhook tracking
- STANDARD → PREMIUM upgrade akışı + ödeme (Iyzico/Stripe)
- Tedarikçi havuzu sayfası ("Tüm Supkeys Tedarikçileri")
- Profil düzenleme + logo upload
- SMS doğrulama, password reset
- Multi-language (EN)
- Kayıt UX 6 haneli kod (self supplier akışı)
- İngiliz Usulü açık eksiltme
- Excel kalem import
- Kategori sistemi (UNSPSC, ~14k satır)
- Eleme/Kazandırma geri alma
- Hatırlatma e-postası özel süre
- Tedarikçi paneli PratisPro tablo redesign
- WebSocket real-time bildirim

### V3 (uzun vadeli)
- AI agent layer (event-bus, MCP entegrasyonu, action endpoint'leri `/api/agents/v1/...`)
- "Tercihlerimi Getir" preset
- "Önceki İhalelerden Ekle" template
- Akıllı şartname motoru
- Manipülasyon tespiti

---

## Git
- Repo: `git@github.com:ugur-062/supkeys.git`
- Branch: `main`
- Her özellikten sonra commit + push.
