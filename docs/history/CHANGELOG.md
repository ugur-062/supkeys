# Rothern — Geliştirme Geçmişi

Bu dosya tamamlanmış aşamaların detaylı kaydıdır. Aktif çalışma için CLAUDE.md'ye bakın.

---

## 2026-07-19 → 07-21 — RLS multi-tenant backstop LOKAL ROLLOUT TAMAM (INV-MT-5)

**Sonuç:** Postgres RLS güvenlik ağı **27 tabloda gerçek policy'li, lokal-kanıtlı** (kısıtlı
rol `rothern_app` + `RLS_ENABLED=true` ile `rls-isolation.spec`'te izolasyon testli, full-suite
98 suite / 902 test yeşil, fail-closed, kill-switch var). **Prod'da KAPALI** — aktivasyon ayrı/
taze tur (adımlar: `docs/launch-checklist.md § RLS aktivasyon`). Plan: `docs/rls-plan.md`.

- **Plumbing (Faz 1):** tenant ALS + interceptor/middleware, Prisma `$extends` RLS extension
  (`RLS_ENABLED` flag-arkası, `SET LOCAL app.current_company_id` tx-içi), `runTenantTx`,
  `PrismaBypassService` (owner rol, admin/auth-precontext/public/cron için).
- **Policy'ler (Faz 2-6g):** 9 direct (`companyId=current`) + 2 transitif (approval steps,
  EXISTS-parent) + 6 iki-taraflı (`IN(a,b)`: connections/blocks/complaints/referrals/
  message_threads/listing_invitations) + 1 message + 4 kapalı-zarf (listing_bids + 3 child,
  INV-BID-1 satır-düzeyi) + 5 orders (company_orders `IN(buyer,seller)` + 4 child EXISTS-parent).
- **Orders özel:** cron sweep (`sendDuePaymentReminders`) bypass'a ayrıldı (Step 1, davranış
  değişmez) → policy sonra (Step 2). **PERF EXPLAIN'lendi:** child EXISTS-parent = hashed SubPlan
  (görünür order-id bir kez) + buyer/seller index BitmapOr → 1.9ms (sağlıklı).
- **İLKE (INV-MT-5'e yazıldı):** tenant-scoped basit / iki-taraflı / kapalı-zarf / DAĞINIK-guard
  (orders) → RLS AL; **tek-helper görünürlük (listings `listing-visibility.ts`) + directory
  (companies/users/notifications/invitations) → bilinçli PERMISSIVE** (getiri < 4-yollu EXISTS bedeli).
- **Test altyapısı dersi:** orphaned `pnpm test` wrapper'ları test DB'de çakışıp jest'i ~40
  suite'te öldürür (deadlock değil) → `pkill` + DB-conn temizliği + tek `run_in_background`.
  Migration-history tuzağı: `packages/db/.env` symlink→remote → test DB'ye migration jest
  globalSetup uygular (elle `migrate deploy` yanlış hedef, "No pending" yalanı).

**Bu oturum arkında ayrıca** (kullanıcı özeti — ilgili memory/commit'lerde izli): iş akışı
(A1 satıcı iptal+DISPUTED, TTK 23 ayıp ihbarı, mal-mukabili+ADVANCE vadesi, sipariş/ödeme
yaşam-döngüsü ayrımı, KDV konvansiyonu), lokal Postgres test altyapısı (4× hız + deadlock
kökü connection_limit=1 + CI), CSRF canlı-bug (COOKIE_DOMAIN eksik) + prod-config boot-guard,
INV-AUDIT-1 3. dalga, CSP nonce. **Kod tarafında launch-blocker YOK** (kalanlar backup/plan
kurulumu = kullanıcı elinde, veya avukat: TTK 23 + KVKK).

---

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
- `packages/db` tsconfig fix (rootDir `./src` → `.`, `@rothern/shared` workspace dep eklendi)
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
- **E-posta:** `user_invitation` şablonu (Layout + heading + info box "Davet bilgileri: firma/rol/süre" + acceptUrl CTA + "beklemiyorsan yok say" footer). Subject `👥 {tenantName} ekibine davet edildiniz — Rothern`. types.ts/render.ts/index.ts'e tam entegre.
- **Frontend ayarlar (`/dashboard/ayarlar`):** Ana sayfa 5 kart (Hesap Bilgileri / Şifre İşlemleri / Kullanıcı İşlemleri (admin-only) / Bildirim Tercihleri / Firma Profili) PratisPro stili. Tüm alt sayfalarda `<BackToSettings>` ortak komponent.
  - **Hesap Bilgileri:** read-only mode + Pencil "Düzenle" butonu → react-hook-form + zod (firstName/lastName/phone). E-posta disabled. Rol read-only (label).
  - **Şifre İşlemleri:** 3 alan (mevcut/yeni/onay), zod refine ile "şifreler eşleşmiyor" + "yeni şifre eski ile aynı olamaz". Backend `currentPassword` bcrypt karşılaştırma + 400.
  - **Kullanıcı İşlemleri:** UsersTable (avatar + ad + e-posta + rol pill + aktif/pasif chip + son giriş relative time + Radix DropdownMenu "Düzenle" / "Pasif Yap" / "Aktif Et"). InvitationsList (sadece bekleyen davetler — Mail ikon + e-posta + rol + invitedBy + süre + Yeniden Gönder/İptal Et). InviteUserModal (e-posta + 3 radio kart rol seçimi). EditUserModal (firstName/lastName/phone/role). BUYER/APPROVER login olduğunda sayfa "sadece COMPANY_ADMIN" warning kartına düşer.
  - **Bildirim Tercihleri:** 5 grup (İhale 8 alt, Onay 2, Sipariş 2, Tedarikçi 2, Sistem 2 — sistem `locked: true`). Group-level toggle (indeterminate state) + alt-checkbox. Auto-save (her toggle'da PATCH `/me/notification-prefs`). Default opt-in (key yoksa `true`).
  - **Firma Profili:** read-only (companyName/taxNumber/taxOffice/industry/city/district/addressLine/postalCode) + warning pill "Düzenleme · V2" + destek@rothern.com link.
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

> **Production'a geçiş**: Resend dashboard → Webhooks → URL `https://api.rothern.com/api/webhooks/resend` + `RESEND_WEBHOOK_SECRET=whsec_...` env'e set edilecek. `NODE_ENV=production` ile guard tam svix imza doğrulamasına geçer; eksik secret 401 döner.

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

> **R2 setup**: Cloudflare Dashboard → R2 → bucket oluştur (ad fark etmez; `R2_BUCKET` env'i ile eşleştir). Bu kurulumda bucket adı `rothern-documents`. Manage R2 API Tokens → Create Token → "Object Read & Write" permission, bucket scope'lu. Token oluşunca `R2_ACCOUNT_ID` (Cloudflare hesap ID), `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`, `R2_BUCKET=<bucket-adı>` **root `/.env`'e** yazılır (ConfigModule sadece root .env'i okur). Sonra API restart.

### V2-3 — Multi-Currency + TCMB Integration
- **Schema migration `v2_multi_currency`:**
  - `ExchangeRate` model (`currency` Currency + `rate` Decimal(15,6) + `rateDate` @db.Date + `source` TCMB|MANUAL|FALLBACK + `fetchedAt`). UNIQUE on `(currency, rateDate)`. TRY için kayıt YOK (rate=1 sabit) — sadece USD/EUR.
  - `Bid.exchangeRateSnapshot` Json? — submit anındaki TCMB kuru: `{rate, rateDate, fetchedAt, source}`. bid.currency=TRY ise null kalır.
  - `Currency` enum (TRY/USD/EUR), `Tender.primaryCurrency`, `Tender.allowedCurrencies`, `Bid.currency` zaten mevcuttu (V1).
- **Bağımlılıklar** (`apps/api`): `@nestjs/axios` + `axios` + `xml2js` + `@types/xml2js`.
- **Backend `currency` modülü** (`@Global`):
  - `TcmbService.fetchTodayRates()` — TCMB `https://www.tcmb.gov.tr/kurlar/today.xml` GET, xml2js parse, `Tarih_Date.$.Tarih` (TR format DD.MM.YYYY) veya `.Date` (US MM/DD/YYYY) attribute'unu kabul eder, `ForexSelling` (Döviz Satış) değerini USD + EUR için döndürür. Hata durumunda null + warn.
  - `ExchangeRateService` — `getCurrentRate(currency)` (TRY=1, diğerleri DB latest), `getRateOnDate(currency, date)` (snapshot için), `getCurrentRates()` (3'lü Record), `takeSnapshot(currency)` (bid submit için: en güncel kur + rateDate + fetchedAt + source — TRY için null), `toTry(amount, currency, onDate?)`, `refreshFromTcmb()` (USD+EUR upsert atomik). Fallback rates: USD=34, EUR=37 (DB boşsa veya TCMB down).
  - `ExchangeRateScheduler` — `@Cron("0 16 * * 1-5", { timeZone: "Europe/Istanbul" })` (Pzt-Cum 16:00 — TCMB ~15:30 yayın + buffer). Hafta sonu TCMB yayınlamaz, cron tetiklenmez. `onApplicationBootstrap` 30 sn sonra bir kez fetch dener (DB seeding için, idempotent).
  - **2 controller paylaşılan service:**
    - `ExchangeRateController` `/api/exchange-rates` (auth yok — public): `GET /current` → `{rates:{TRY:1,USD:...,EUR:...}, timestamp}`.
    - `AdminExchangeRateController` `/api/admin/exchange-rates` (`AdminJwtAuthGuard`): `POST /refresh-now` → manuel TCMB fetch + upsert.
- **Bid submit snapshot:** `supplier-tenders.service.ts submitBid()` artık `exchangeRateService.takeSnapshot(bid.currency)` çağırır; sonuç `Bid.exchangeRateSnapshot` Json'a yazılır. TRY bid'lerde null. Geriye dönük doğru karşılaştırma garanti — kur sonradan değişse de bid kaydı bağımsız.
- **Frontend** (`apps/web`):
  - `lib/format-currency.ts` — `Currency` type, `getCurrencySymbol`, `formatPrice(amount, currency, decimals=2)` (Intl.NumberFormat tr-TR/en-US/de-DE locale), `formatPriceWithTry(amount, currency, rate)` (orijinal + ≈ TRY).
  - `hooks/use-exchange-rates.ts` — `useCurrentExchangeRates()` 5dk cache + 5dk refetchInterval, public endpoint'ten okur.
  - `components/currency-badge.tsx` — `<CurrencyBadge currency={...} codeOnly?>` 3 renk paleti (TRY yeşil/USD mavi/EUR mor).
  - `lib/tenders/types.ts` `BidDetailExpanded.exchangeRateSnapshot` field eklendi.
  - `bid-detail-view.tsx` KPI kartında: bid.currency≠TRY ise `≈ ₺X,XXX (kur: 45.2714 · 2026-05-08 TCMB)` ek satırı. TRY bid'lerde değişiklik yok.
- **Manuel E2E doğrulama:**
  - `tcmb-probe.mjs` standalone test: TCMB ulaşılabilir ✓, USD=45.27 EUR=53.23 ✓, Tarih="08.05.2026" parse ✓.
  - Migration: `\d exchange_rates` + Bid.exchangeRateSnapshot jsonb ✓.
  - `POST /admin/exchange-rates/refresh-now` → `{success:true, date:"2026-05-08", rates:{USD:45.2714, EUR:53.232}}` ✓ DB'ye 2 satır yazıldı.
  - `GET /exchange-rates/current` → `{rates:{TRY:1, USD:45.2714, EUR:53.232}, timestamp:...}` ✓.
  - Cron registered "0 16 * * 1-5" Europe/Istanbul ✓.
  - typecheck (api+web+admin+email+shared+db) tüm yeşil ✓.

> **Bilinen tuzaklar (V2-3)**: (1) TCMB XML'de `Tarih` (DD.MM.YYYY) ile `Date` (MM/DD/YYYY) attribute'u farklı format — parser ikisini de kabul eder. (2) Prisma `@db.Date` field'ına `new Date("YYYY-MM-DD")` valid (UTC midnight'a çevrilir); ISO timestamp string'i `Invalid Date` verir. (3) TCMB hafta sonu yayınlamaz — son iş günü kuru kullanılır (Cumartesi 09.05.2026'da 08.05.2026 Cuma kuru). (4) Fallback rates (USD=34, EUR=37) güncel değil — production'da first cron fetch ile düzelir; hiç TCMB yoksa muhafazakâr kalır.

### V2-4 — 1-on-1 Mesajlaşma (WhatsApp-style)
- **Schema migration `v2_4_messaging`:**
  - 2 model: `MessageThread` (polymorphic context: ORDER|TENDER, contextRefId, tenant+supplier FK, lastMessageAt + tenantLastReadAt + supplierLastReadAt) + `Message` (threadId FK CASCADE, senderType TENANT_USER|SUPPLIER_USER, senderUserId/senderSupplierUserId, content @db.Text, attachmentIds Json default '[]', emailNotifiedAt, sentAt).
  - 2 enum: `MessageContext`, `MessageSenderType`.
  - `AttachmentScope` enum'a `MESSAGE_ATTACHMENT` eklendi (V2-2 R2 attachment ile entegre).
  - UNIQUE `(context, contextRefId, tenantId, supplierId)` — bir alıcı-tedarikçi-context kombinasyonu için tek thread. Tedarikçiler birbirinin thread'ini ASLA göremez.
  - Tenant + Supplier reverse relations (`messageThreads`).
- **Backend `messaging` modülü:**
  - `MessagesService` — `getOrCreateThread`, `listMessages` (auto mark-read), `sendMessage` (event emit), `getUnreadCount`, `listTenderThreadsForTenant`. Polymorphic ORDER/TENDER + tenant/supplier authz `resolveParties` helper'ı ile (TENANT_USER tender context'inde `targetSupplierId` zorunlu; SUPPLIER_USER tender context'inde `tenderInvitation` zorunlu).
  - `TenantMessagesController` `/tenants/me/...` — order messages (GET/POST), tender threads (GET — listele), tender messages (GET/POST per supplier), unread-count.
  - `SupplierMessagesController` `/supplier/...` — order messages (GET/POST), tender messages (tek thread; davet edilmiş olmak şart), unread-count.
  - `SendMessageDto` — content max 5000, attachmentIds max 5.
  - `MessageEmailScheduler` `@Cron(EVERY_5_MINUTES)` — `emailNotifiedAt NULL` + `sentAt ≤ now-5dk` mesajlar batch (100). Karşı taraf 5dk içinde okuduysa email atlanır + mark notified. Karşı taraf yoksa skip + mark. Recipient: TENANT_USER sender → 1. SupplierUser; SUPPLIER_USER sender → 1. COMPANY_ADMIN. Context label resolve (Sipariş ORD-... | İhale SUPK-...). CTA URL surface'a göre `WEB_URL/dashboard|supplier`.
  - `AttachmentsService` MESSAGE_ATTACHMENT scope authz: scopeRefId polymorphic (önce order, sonra tender lookup). Tenant=kendi tarafı, Supplier=order tarafı veya tender'a davet edilmiş.
- **E-posta `message_notification` template** — Layout + heading "Yeni mesajınız var" + brand-blue borderLeft preview kutu (mesaj 200 char + ellipsis) + "Mesajı Görüntüle ve Yanıtla" CTA + helper "5 dakika içinde okunmadığı için otomatik gönderildi". Subject `💬 {senderCompanyName} mesaj gönderdi · {contextLabel}`. types.ts `MessageNotificationData` + render.ts case branch + index.ts export.
- **Frontend hooks** (`use-messages.ts`):
  - `useThreadMessages(surface, context, refId, targetSupplierId?)` — surface-aware (`api`/`supplierApi`), 30sn polling, path matrix (`/tenants/me/orders/:id/messages` | `/tenants/me/tenders/:id/threads/:supplierId/messages` | `/supplier/orders/:id/messages` | `/supplier/tenders/:id/messages`). Auto mark-read backend'de.
  - `useSendMessage` — POST + invalidate (thread + unread + tender-threads).
  - `useTenderThreadsForTenant(tenderId)` — sol-rail listesi.
  - `useUnreadCount(surface)` — 60sn refetch.
- **Frontend components** (`components/messaging/`):
  - `MessageThread` — WhatsApp tarzı bubble UI. Sender side branching (mavi sağ / beyaz sol), `senderName` üstte (sadece karşı taraf), timestamp altta (Today/Yesterday/full), Enter→gönder Shift+Enter→yeni satır, file picker (multi up to 5, R2 upload via `useUploadAttachment` MESSAGE_ATTACHMENT scope), pending file chips, auto-scroll bottom.
  - `MessageAttachment` — bubble içinde dosya satırı, click → `useDownloadAttachment` presigned GET (browser Content-Disposition'dan filename'i alır).
  - `TenderThreadsList` — tedarikçi listesi: avatar (Building2) + ad + unread dot + son mesaj preview (80 char, "Sen: " prefix tenant gönderdiğinde) + relative timestamp.
- **Entegrasyon noktaları:**
  - `dashboard/siparisler/[id]/_components/order-detail-view.tsx` — Section "Mesajlar" + `<MessageThread surface="tenant" context="ORDER">`.
  - `supplier/(authed)/siparisler/[id]/_components/supplier-order-detail-view.tsx` — aynı pattern surface="supplier".
  - `dashboard/ihaleler/[id]/_components/tender-detail-view.tsx` — yeni `messages` tab + `TenderMessagesTab` (12-col grid: 4-col ThreadList + 8-col selected MessageThread).
  - `supplier/(authed)/ihaleler/[id]/_components/tender-detail-view.tsx` — yeni `messages` tab + tek thread MessageThread.
- **Manuel E2E** (8 senaryo):
  - tenant tender threads list (davet edilmiş supplier görünür, threadId=null) ✓
  - tenant ilk mesaj → TENANT_USER ✓
  - supplier list+reply ✓
  - tenant unread=1 (supplier mesajı henüz okumadı) ✓
  - tenant list mesajları (auto mark-read) ✓
  - tenant unread=0 ✓
  - empty content → 400 "Mesaj boş olamaz" ✓
  - cross-token (supplier→tenant endpoint) → 401 "Geçersiz token tipi" ✓
  - DB doğrulama: 1 thread, 2 message, lastMessageAt set ✓
  - 11 messaging route registered ("Mapped {/api/tenants/me/orders/:orderId/messages, GET}", vd.) ✓
  - typecheck (api+web+admin+email+shared+db) tüm yeşil ✓

> **Sapma**: Spec "Sidebar mesaj ikonu + unread badge" istiyordu; üst-seviye `/mesajlar` inbox sayfası V2.5'e bırakıldığı için sidebar item gerçek hedefe işaret edemiyor. `useUnreadCount(surface)` hook'u + backend endpoint hazır — V2.5'te inbox sayfası eklendiğinde sidebar bağlanır. Şu an mesajlar sipariş+ihale detay tab'larından erişilir.

### V2-4 düzeltme — Messenger-stili UX (header dropdown + /mesajlar sayfası)
- **Schema migration `v2_4_messaging_preview`:** `MessageThread.lastMessagePreview VARCHAR(200)` field eklendi. `sendMessage` her mesajda preview'i (içerik 200 char veya `📎 N dosya`) cache'ler — her thread liste yüklemesinde `Message.findFirst` yapmaktan kaçınılır.
- **Backend `MessagesService.listAllThreadsForUser`** + `GET /tenants/me/threads` + `GET /supplier/threads`:
  - Tüm thread'leri (sipariş + ihale karışık) `lastMessageAt desc` sıralayıp döner; bağlam metadata'sı (orderNumber/tenderNumber/title) batch fetch ile zenginleştirilir.
  - Shape: `{threadId, context, contextRefId, contextLabel, contextNumber, contextTitle, otherPartyId, otherPartyName, lastMessagePreview, lastMessageAt, unread}`.
  - `lastMessageAt: { not: null }` filter — boş thread'ler listeye düşmez.
- **Frontend yeni dosyalar:**
  - `lib/avatar-utils.ts` — `getAvatarProps(name)` deterministik renk + initials (8 paletli, djb2-ish hash).
  - `components/ui/avatar-initials.tsx` — sm/md/lg boyut, `select-none`, aria-label.
  - `components/messaging/context-badge.tsx` — `📦 Sipariş` (success-50) / `📋 İhale` (blue-50) rozet.
  - `components/messaging/thread-list-item.tsx` — Avatar + ad + ContextBadge + son mesaj preview + relative timestamp (Today/Yesterday/full) + unread dot.
  - `components/messaging/header-messages-dropdown.tsx` — `MessageCircle` button + unread badge (>9 → "9+") + dropdown (son 5 thread + "Tüm Mesajları Görüntüle"). Click outside ile kapanır. Thread tıklandığında: ORDER → bağlam sayfası, TENDER → `/mesajlar?thread=<id>`.
  - `app/dashboard/mesajlar/page.tsx` + `app/supplier/(authed)/mesajlar/page.tsx` — WhatsApp Web 2-kolon layout (lg:col-span-4 list + lg:col-span-8 MessageThread). `?thread=<id>` query param ile auto-select; ilk yüklemede ilk thread otomatik seçilir. `Suspense` boundary.
  - `MessageThread`'a opsiyonel `headerInfo` prop eklendi — `ThreadChatHeader` (avatar + ad + bağlam rozeti) küçük header bandı.
- **Hook'lar:**
  - `useAllThreads(surface)` — surface-aware path (`/tenants/me/threads` veya `/supplier/threads`), 30sn refetch + 15sn staleTime.
  - `useSendMessage` invalidate'ine `KEYS.allThreads(surface)` eklendi.
- **Sidebar nav:**
  - `nav-config.ts` (tenant) — yeni "Mesajlar" link `/dashboard/mesajlar` + `MessageCircle` icon + live badge (sidebar'da `useUnreadCount("tenant").data.count`).
  - `supplier/nav-config.ts` — yeni "Mesajlar" link `/supplier/mesajlar` (badge için `liveNavConfig` infrastructure supplier sidebar'da yok; future iyileştirme).
- **Header'lara `<HeaderMessagesDropdown surface=...>` mount:**
  - Tenant: `dashboard/header.tsx` Bell button'unun yanına.
  - Supplier: `supplier-shell/header.tsx` Bell button'unun yanına.
- **E2E (smoke):**
  - `GET /tenants/me/threads` → 200, mevcut thread `{contextLabel:İhale, contextNumber:SUPK-2026-0015, otherPartyName, lastMessageAt}` ✓
  - `GET /supplier/threads` → 200, boş array (demo-supplier'ın mesajı yok) ✓
  - 13 messaging route registered (eski 11 + 2 yeni `/threads`) ✓
  - typecheck (api+web+admin+email+shared+db) tüm yeşil ✓
- **Sidebar/header bağlanması ile V2-4 ilk commit'teki "Sapma" notu kapatıldı**: artık üst-seviye `/mesajlar` inbox sayfası mevcut + sidebar badge canlı + header dropdown her sayfadan erişilebilir.

### V2-4 düzeltme — Real-time polling fix (sayfa yenilemeden mesaj görünmüyordu)
- **Sorun:** mesaj gönderildiğinde karşı tarafta sayfa yenilemeden görünmüyordu, header badge geç güncelleniyordu. İki neden:
  1. **React Query polling ayarları:** `refetchInterval: 30_000` (30sn — uzun) + `staleTime: 15_000`/`30_000` + window focus refetch yok + mount'ta force refetch yok → cache eski veriyi gösterir, tab'a dönülünce hemen yenilenmez.
  2. **Express conditional GET:** `If-None-Match` header ile gelen polling istekleri `304 Not Modified` dönüyordu (Express default `fresh` algoritması) — tarayıcı eski body'i kullanıyor, useQuery cache stale kalıyor.
- **Hook düzeltmesi `use-messages.ts`:** Tek bir `LIVE_QUERY_OPTIONS` sabiti ile tüm mesaj query'leri için: `refetchInterval: 5_000` (5sn) + `refetchIntervalInBackground: false` (tab inaktifken durur — CPU/pil tasarrufu) + `refetchOnWindowFocus: true` + `refetchOnMount: "always"` + `refetchOnReconnect: true` + `staleTime: 0` (cache her zaman stale → her render fresh fetch). Tüm 5 query (useAllThreads/useThreadMessages/useTenderThreadsForTenant/useUnreadCount) bu config'i kullanır.
- **Optimistic update `useSendMessage`:** `onMutate` query cancel + previous snapshot + temp message (`temp-{Date.now()}` id, "Sen" sender adı, ISO sentAt) thread'e push edilir → kullanıcı kendi mesajını anında görür. `onError` rollback. `onSettled` invalidate (server'dan gerçek mesaj gelir, temp replace olur).
- **Backend `NoCacheInterceptor`:** `messaging` modülüne controller-level interceptor.
  - Request seviyesinde `If-None-Match` + `If-Modified-Since` header'ları silinir → Express `fresh` check bypass olur → her zaman 200 + fresh body döner.
  - Response seviyesinde `Cache-Control: no-cache, no-store, must-revalidate, private` + `Pragma: no-cache` + `Expires: 0` set edilir.
- **E2E doğrulama:**
  - `If-None-Match: stale-etag` ile request → `HTTP 200` + full body (304 değil) ✓
  - `Cache-Control: no-store` response'ta mevcut ✓
  - typecheck (api+web+admin+email+shared+db) tüm yeşil ✓

> **UX sonucu:** Browser A mesaj gönderdikten sonra Browser B'de sayfa yenilemeden ~5 saniye içinde balona düşer. Header badge ~5 saniye içinde güncellenir. Kullanıcı kendi mesajını gönderdiği anda optimistic olarak balonda görür (~0sn).

### V2-3 düzeltme — Tek Currency Modeli (allowed-currencies + decimalPlaces drop)
- **Sorun:** Wizard'da "İzin Verilen Para Birimleri" multi-checkbox + "Ondalık Basamak" dropdown + "TCMB kur dönüşümü V2'de gelecek" disclaimer V1'den kalmıştı; V2-3 spec'i tek currency + otomatik TRY equivalent karşılaştırması istiyor.
- **Schema migration `v2_3_remove_redundant_currency_fields`:** `Tender.allowedCurrencies Currency[]` + `Tender.decimalPlaces Int` DROP COLUMN. `Tender.primaryCurrency` tek belirleyici.
- **Backend temizlik:**
  - `CreateTenderDto` `allowedCurrencies` + `decimalPlaces` field'ları kaldırıldı.
  - `tenant-tenders.service` createDraft + updateDraft + `validateBusinessRules` (allowedCurrencies cross-check) bu field'ları kullanmıyor.
  - `supplier-tenders.service` `findOne` response'undan `allowedCurrencies` + `decimalPlaces` kaldırıldı; `saveOrUpdateBid` artık `bid.currency = tender.primaryCurrency` override ediyor (DTO'dan gelen currency yok sayılıyor — cross-currency bid V2.5'e ertelendi).
  - `CreateOrUpdateBidDto.currency` `@IsOptional()` yapıldı (geriye uyum).
  - **Bid comparison TRY equivalent:** `getBidComparison` her bidsForItem için `unitPriceTry` + `totalPriceTry` + `exchangeRate` + `exchangeRateDate` (snapshot.rate veya 1) ekler. `bestBid` artık TRY equivalent karşılaştırmasına göre seçilir (cross-currency tutarlılık).
- **Frontend temizlik:**
  - `tenderFormSchema` `allowedCurrencies` + `decimalPlaces` field'ları kaldırıldı (ana zod schema + DEFAULT_FORM_VALUES + STEP_FIELDS).
  - `step-1-info.tsx` "İzin Verilen Para Birimleri" Controller bloğu, "Ondalık Basamak" dropdown ve "TCMB kur dönüşümü V2'de gelecek" disclaimer kaldırıldı. Yerine: `primaryCurrency` seçimi sonrası TRY dışı seçimde green info kartı "TCMB Kuru ile Otomatik Karşılaştırma" + tedarikçinin gönderdiği tarihteki kurun snapshot ile sabitlendiği açıklaması.
  - `step-4-review.tsx` "Para Birimi" satırından `(izin: ...)` kaldırıldı; "Ondalık" satırı silindi.
  - `edit-loader.tsx` `tender.allowedCurrencies` + `tender.decimalPlaces` mapping'i kaldırıldı.
  - `general-info-tab.tsx` (tenant + supplier) Para Birimi InfoRow'undan ek currency'ler ve "Ondalık Hassasiyet" satırı kaldırıldı.
  - `teklif-form.tsx` `<CurrencySelector>` kaldırıldı; yerine sabit "Para Birimi" kartı (tender.primaryCurrency rozet + açıklama). `currency-selector.tsx` dosyası silindi.
  - `tenders/types.ts` `TenderDetail`/`SupplierTenderDetail`/`BidComparisonRow.allBids+bestBid` field'ları temizlendi; `unitPriceTry`/`totalPriceTry`/`exchangeRate`/`exchangeRateDate` bid comparison row'larına eklendi.
  - `TenderBidsListItem.exchangeRateSnapshot` typed (zaten Json olarak dönüyordu).
  - `item-based-ranking.tsx` bestBid kartında `currency!=="TRY"` için `≈ ₺X,XXX (kur: 45.27 · 2026-05-08)` ek satırı.
  - `tender-based-ranking.tsx` bid satırında `≈ ₺X,XXX (kur: 45.27)` ek satırı.
- **Seed:** `prisma/seed/tenders.ts` 3 tender'da `allowedCurrencies` + `decimalPlaces` satırları temizlendi.
- **E2E doğrulama:**
  - DB: `tenders` tablosundan kolon DROP, sadece `primaryCurrency` kaldı ✓
  - USD tender create payload `allowedCurrencies`/`decimalPlaces` olmadan → SUPK-2026-0015 OK, DB primaryCurrency=USD ✓
  - typecheck (api+web+admin+email+shared+db) tüm yeşil ✓
  - V2.5 ertelendi: cross-currency bid (tender USD ama tedarikçi EUR teklif) — şu an DTO'da currency optional ama backend tender.primaryCurrency override ediyor.

> **Bilinen tuzaklar**: (1) `tsconfig.tsbuildinfo` bozuksa `tsc` sessizce hiçbir dosya emit etmez — `rm tsconfig.tsbuildinfo && tsc` ile force rebuild. (2) `R2_BUCKET` env'i set edilmezse StorageService bootstrap fail eder — fallback default kaldırıldı, hatalı sessiz bağlanmayı önlemek için. (3) HeadBucket 404 → bucket adı yanlış veya token bu bucket'a scope'lu değil; doğrulama için ListBuckets ile token'ın gördüğü bucket'ları listele. (4) **Bucket CORS**: Browser direkt R2'ye PUT yaptığı için bucket CORS policy şart — yoksa preflight fail, upload sessizce başarısız olur. `StorageService.onModuleInit` artık `ensureCorsPolicy()` çağırıyor: `GetBucketCors` + idempotent `PutBucketCors` (origins = `CORS_ORIGINS` env, methods = PUT/GET/HEAD, ExposeHeaders=ETag, MaxAge=3600). Token'da `PutBucketCors` izni gerekir; yoksa warn'la geçilir (manuel Cloudflare Dashboard fallback). Origin değişirse boot'ta auto-update. Debug: `GET /api/health/storage` → `{ bucket, envPrefix, cors }`. (5) Presigned GET URL'i sadece GET method'u için imzalanır — `curl -I` (HEAD) 403 alır; `<a href download>` veya `curl -L` ile GET çalışır.

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
  - `pnpm test:emails` → 30 şablon enqueue edildi, hepsi Mailpit'e SENT durumunda ulaştı (DB'de `email_logs` `qa-mailpit@rothern-dev.local` query 30 satır SENT). Mailpit UI üzerinden http://localhost:8025'te görsel inceleme yapılabilir.
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
  - A4 page, brand-blue gradient header (`#2563eb→#1e40af`), rothern logo + sub-tagline, sağ üstte sipariş no + status pill.
  - 4 ana bölüm: Sipariş Bilgileri (tarih/ihale ref/title/tahmini teslim) + Teslimat Adresi (snapshot pre-line) + 2 info card (Alıcı/Tedarikçi: VKN/vergi dairesi/adres/iletişim) + Kalemler tablosu (#/Ürün+desc/Miktar/Birim/Birim Fiyat/Toplam) + Totals box (Ara Toplam / KDV %20 / Genel Toplam).
  - Notlar bölümü (varsa Teklif Notu + Teslimat Notu — yellow `#fef3c7` callout).
  - **2 imza kutusu** (Alıcı + Tedarikçi şirket adı + dashed `İmza & Tarih` placeholder).
  - Footer "Bu belge rothern.com üzerinden ... oluşturulmuştur".
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
  - `package.json` script: `pnpm --filter @rothern/db v15-cleanup`.
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
  - Idempotency: zaten admin ise atla. Admin yoksa error log + skip (V2'de support@rothern.com alert).
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

### V2-5 — Tedarikçi Paneli Redesign (modern dashboard stili)
- **Tasarım felsefesi:** Linear/Stripe/Vercel referansı — kart tabanlı, gradient KPI, generous whitespace, sticky sidebar pattern, status visualization (pills/dots/timeline). Backend dokunulmadı — sadece UI/UX. Mevcut hook'lar + data shape'leri korundu.
- **2 yeni shared component** (`components/supplier/`):
  - `panel-card.tsx` — `<PanelCard title? subtitle? action? padding?>` modern kart kaplaması (white + slate-200/80 border + shadow-sm + 2xl radius). Tüm tedarikçi sayfalarında tek tip.
  - `status-badges.tsx` — `<SupplierBidStatusBadge>`, `<SupplierOrderStatusBadge>` (dot + label, 4 state). `deriveSupplierTenderState(tenderStatus, bidStatus)` helper'ı tedarikçi perspektifinden okunabilir state ("Davet Edildi", "Taslak Teklifim", "Teklif Gönderildi", "Değerlendiriliyor", "Kazandın", "Kaybettin", vd.) üretir.
- **Sayfa 1 — `/supplier/dashboard` (komple yeniden yazıldı):**
  - Welcome header (today + supplier company name + "İhaleleri Görüntüle" CTA).
  - Action items banner (sarı): aktif davet sayısı + bekleyen sipariş varsa Link'lerle gösterir.
  - 4 gradient KPI cards (Aktif Davetler blue / Aktif Tekliflerim amber / Kazanılan Award emerald / Aktif Sipariş violet) — ArrowRight icon hover + tıklayınca filtrelenmiş liste'ye yönlendirir.
  - 2-kolon alt grid: sol "Performans" (3'lü gradient mini-KPI: 30 gün teklif/toplam gelir/bağlı alıcı) + "Son Aktiviteler" `ActivityFeed`. Sağ TcmbRatesWidget + "Hızlı Erişim" link listesi.
  - Eski `kpi-grid.tsx`/`empty-panels.tsx`/`greeting.tsx`/`onboarding-card.tsx` silindi.
- **Sayfa 2 — `/supplier/ihaleler` (komple yeniden yazıldı):**
  - 4'lü mini KPI özeti üstte (aktif davet/verilen teklif/kazanılan/devam eden sipariş).
  - 12-col grid: sol `lg:col-span-3` filter sidebar (PanelCard sticky) — search input + 3 status filter button (Aktif/Geçmiş/Tümü, count badge'li) + sıralama dropdown.
  - Sağ `lg:col-span-9` 2-kolon (`md:grid-cols-2`) `<TenderCard>` grid.
  - `tender-card.tsx`: tenderNumber + line-clamp title + `deriveSupplierTenderState` rozet (sağ üst), Building2 buyer adı, CurrencyBadge + kalem sayısı, footer'da deadline (urgency renkleri: ≤1 gün rose, ≤3 gün amber, default emerald) + "X gün kaldı".
  - `tenders-table.tsx` silindi.
- **Sayfa 3 — `/supplier/ihaleler/[id]/teklif-ver` (header polish):**
  - Mevcut sticky 2/3 + 1/3 layout zaten modern (V2-2 R2 attachment + V2-3 currency göstergeleri ile entegre); büyük rewrite yapılmadı — sadece header'a `<DeadlineMiniPanel>` eklendi (urgency renkleri + "X gün Y saat kaldı" anlık countdown).
- **Sayfa 4 — `/supplier/siparisler` (komple yeniden yazıldı):**
  - 4'lü mini KPI (toplam/bekleyen/teslimatta/tamamlanan).
  - Sol filter sidebar (search + 5 status filter: Tümü/Bekliyor/Teslimat/Tamamlandı/İptal + sıralama dropdown).
  - Sağ `<OrderCard>` grid: orderNumber + title + `<SupplierOrderStatusBadge>` (sağ üst), Building2 buyer + emerald-600 total amount, **horizontal 3-stage timeline preview** (Onaylandı→Teslimat→Tamamlandı, dot+line emerald-fill done / brand-500 ring-4 active), footer durum açıklaması + currency code + creation date.
- **Sayfa 5 — `/supplier/siparisler/[id]` (3-kolon layout'a refactor):**
  - Breadcrumb + status badge size=lg + creation date.
  - 12-col grid: sol `lg:col-span-3` sticky `<PanelCard "Sipariş Akışı">` + `<OrderTimeline>` (vertical, mevcut component korundu).
  - Orta `lg:col-span-6` Radix Tabs (Kalemler/Dosyalar/Mesajlar): items table (mevcut korundu), `AttachmentUpload + AttachmentList ORDER_INVOICE`, `<MessageThread surface="supplier" context="ORDER" headerInfo>`.
  - Sağ `lg:col-span-3` sticky action sidebar: aksiyon banner'ı (PENDING→Teslimatı Başlat butonu + StartDeliveryModal; IN_DELIVERY/COMPLETED/CANCELLED→bilgi paneli), Tutar `<PanelCard>` (success-700 toplam + kalem oranı), Alıcı kart (Building2 + ad), Bağlı İhale link, Teslimat adresi (varsa MapPin), "Sipariş PDF İndir" button.
- **Manuel doğrulama:**
  - typecheck (api+web+admin+email+shared+db) tümü yeşil ✓
  - 4 supplier page route 200 (browser smoke kullanıcıya bırakıldı)
  - Eski legacy 5 component dosyası silindi (kpi-grid, empty-panels, greeting, onboarding-card, tenders-table) — toplam +1041 / -700 satır
- **`PanelCard` + `SupplierOrderStatusBadge` + `getAvatarProps` 3 shared util** sayfalar arası tutarlılık veriyor.

🎉 **V2 COMPLETE** — V2-1 (Resend webhook) + V2-2 (R2 attachments) + V2-3 (TCMB multi-currency) + V2-4 (1-on-1 messaging) + V2-5 (supplier panel redesign) tamamlandı.

### V2-6 — UNSPSC Kategori Sistemi (foundation)
- **Schema migration `v2_6_categories`:**
  - `Category` self-ref model (`code` UNIQUE, `nameTr`/`nameEn`, `level` 1|2, `parentId` self-ref ON DELETE CASCADE, `segmentLetter`, `sortOrder`, `isActive`). 2 seviye: Segment (level 1, codes 10000000-80000000) → Family (level 2). Indexler: `(parentId, sortOrder)` + `(level, sortOrder)`.
  - `SupplierCategory` junction (`supplierId` + `categoryId` + UNIQUE composite + `categoryId` index).
  - `Tender.categoryId String?` + FK ON DELETE SetNull (V1 backward-compat: legacy ihaleler null).
  - `Supplier.categories` + `Tenant…` reverse relations; `SupplierApplication.categoryIds Json?` (register'da seçilen ID'ler, admin onayında junction'a kopyalanır).
- **Seed `packages/db/src/seeds/categories.json`** — 8 segment (A-H, PratisPro tarzı Türkçe isimler) × 46-57 family = **400 kayıt** Türkçe + İngilizce. `pnpm --filter @rothern/db seed-categories` idempotent upsert (re-run güvenli).
- **Backend `categories` modülü** (`@Global`, `apps/api/src/modules/categories/`):
  - `CategoryService.getTree()` — segment + nested children (1 query + filter).
  - `CategoryService.search(q)` — Family seviyesi case-insensitive `nameTr/nameEn` OR + `breadcrumb` ("A. Segment Adı › Family Adı"). Min 2 char (boş array <2). Top 50.
  - `CategoryService.getByIds(ids)` + `validateIds(ids, requireLevel?)` — service-içi validation (NotFound missing, BadRequest wrong-level).
  - `CategoryController` `GET /api/categories` (Cache-Control 1h, public no-auth) + `GET /api/categories/search?q=`.
- **Backend `supplier-profile` modülü** (`apps/api/src/modules/supplier-profile/`): `GET /supplier-profile/me/categories` + `PATCH /supplier-profile/me/categories` (replace-all transaction, validateIds level 2). SupplierJwtAuthGuard.
- **Backend entegrasyonlar:**
  - `CreateSupplierApplicationDto.categoryIds` (1-20 Family ID'leri, Turkish error messages); `SupplierRegistrationService.create` validate + persist (`Application.categoryIds`'e Json olarak yazar).
  - `AdminSupplierApplicationsService.approve` — yeni Supplier oluşunca `categoryIds` Json'dan SupplierCategory junction'a `createMany` (idempotent skipDuplicates).
  - `SupplierAuthService.getMe` — `categories` array (breadcrumb ile) eklendi.
  - `CreateTenderDto.categoryId` zorunlu (`@IsNotEmpty`); `TenantTendersService.createDraft/updateDraft` validate + persist; `findOne` + list response'larında `category: { id, code, nameTr, level, breadcrumb }` enriched.
  - `SupplierTendersService.list/findOne` — aynı enrichment.
- **Frontend hooks** (`apps/web/src/hooks/`):
  - `use-categories.ts` — `useCategoryTree` (1h staleTime + 24h gcTime) + `useCategorySearch(q)` (5dk staleTime, enabled q≥2).
  - `use-debounced-value.ts` — generic debounce (300ms default).
  - `use-supplier-profile.ts` — `useSupplierCategories` (60sn staleTime) + `useUpdateSupplierCategories` (PATCH + invalidate).
- **Frontend components** (`apps/web/src/components/categories/`):
  - `CategorySelector` — accordion (segment toggle + selected count badge per segment) + search panel (debounced 300ms, breadcrumb visible) + max selection guard (warning auto-clear 3s) + single|multi mode + disabled/error props. max-h-96 + overflow-y scroll. PratisPro tarzı brand-50 selected, slate-50 hover.
  - `CategoryBadge` — Tag icon + segmentLetter mono prefix + nameTr truncate + title tooltip = breadcrumb. sm|md size.
- **Frontend entegrasyonlar:**
  - **Supplier register** (`/register/supplier`) — Stepper artık 4 step (Firma → Yetkili → **Kategoriler** → Tamamlandı). Stepper component'i `steps` prop'u kabul ediyor; buyer akışı default 3 step kalır.
  - **Supplier profile** (`/supplier/profil`) — Yeni `CategoriesCard` (view: chip listesi; edit: CategorySelector + Kaydet/İptal, replace-all PATCH).
  - **Tender wizard Step 1** — En üste "Kategori" section (Tag ikonu + CategorySelector single-mode). Form schema'ya `categoryId` zorunlu eklendi (`STEP_FIELDS[1]`), `DEFAULT_FORM_VALUES`, `buildPayload`, `edit-loader` mapping. Step 4 review'da "Kategori" özet satırı (tree'den breadcrumb resolve).
  - **Tender detail (tenant + supplier)** — `general-info-tab.tsx` "Kategori" InfoRow + breadcrumb.
  - **Tender list (tenant tablosu + supplier card)** — başlık altında küçük `CategoryBadge`. Legacy null-category ihalelerde gizli.
- **Manuel E2E doğrulama:**
  - Migration: `\d categories` + `\d supplier_categories` + `tenders.categoryId` + `supplier_applications.categoryIds` jsonb ✓
  - `pnpm seed-categories` → 8 segment / 392 family / **400 toplam** idempotent ✓
  - GET /api/categories tree shape (segment.children populated) + Cache-Control 1h ✓
  - GET /api/categories/search?q=software → 8 Family (breadcrumb "G. ... › Yazılım lisansı …") ✓
  - GET /api/categories/search?q=k → boş array (min 2 char) ✓
  - Tender create missing categoryId → 400 "Kategori zorunludur" ✓
  - Tender create wrong-level (segment id) → 400 "Sadece level 2 (Family) ..." ✓
  - Tender create invalid id → 404 "Geçersiz kategori ID" ✓
  - Tender create valid Family → SUPK-2026-0016 ✓
  - Tender list/detail response category enrich (breadcrumb dahil) + V1 backward-compat (legacy null) ✓
  - Supplier /me categories field present ✓
  - PATCH /supplier-profile/me/categories replace-all ✓ + boş/21/wrong-level → 400/400/400 + invalid id → 404 ✓
  - Cross-token: tenant token → /supplier-profile/me/categories → 401 ✓
  - Register frontend payload (2 family ID) → SupplierApplication.categoryIds Json'da ✓ → admin approve → SupplierCategory junction'da 2 satır ✓
  - Frontend smoke (200): /register/supplier, /supplier/profil, /dashboard/ihaleler, /dashboard/ihaleler/yeni ✓
  - typecheck (api+web+admin+email+shared+db) **8/8 yeşil** ✓

> **Sapma**: Spec yeni bir wizard step öneriyordu; kategori seçimi kritik bir field olduğu için Step 1'in **en üstüne** entegre edildi (form schema `STEP_FIELDS[1]` içinde). Ek navigasyon adımı yerine, Genel Bilgiler içinde first-class section. Step 1 ileri butonuna basıldığında zaten validate ediliyor (zod min 1 char).

> **V2-6 reset → 4 seviye UNSPSC + modal selector + hiyerarşik search + tedarikçi sadece Segment kuralı**:
> - Schema migration `v2_6_reset_4_level_categories` — eski 2-seviye veri silindi, `nameEn` drop, code lookup index. `Category.level` 1–4 (Segment/Family/Class/Commodity).
> - Seed `categories.txt` (1618 satır) parse → **2213 kategori** (56 Segment / 259 Family / 767 Class / 1131 Commodity). Idempotent `deleteMany` + `create`.
> - Backend `CategoryService` lazy loading: `getRoots` / `getChildren(parentId)` / `getByIds` / `search` (Level 3+4 flat) / `searchHierarchical` (tree). Shared `buildBreadcrumb` helper. `validateIds` artık options bag kabul ediyor (`{ minLevel?, exactLevel? }`); numeric arg geriye uyum (minLevel).
> - Endpoint'ler: `GET /api/categories/{roots,children,search,search-tree,by-ids}` (public, Cache-Control 1h roots/children).
> - **Kategori seçim kuralları**:
>   - **Tender** (`tenant-tenders` create/update): `minLevel: 3` → sadece Class veya Commodity kabul; Segment/Family → 400.
>   - **Tedarikçi** (`supplier-registration`, `supplier-profile`): `exactLevel: 1` → SADECE ana başlık (Segment); Family/Class/Commodity → 400 "Sadece ana başlık (Segment) ...". Max 10 segment.
> - Frontend:
>   - **Tender wizard** Step 1 → `CategorySelectorButton` (boş=dashed CTA, dolu=chip+Değiştir) + `CategorySelectorModal` (PratisPro tarzı full-screen popup, 4-seviye lazy accordion, hiyerarşik `/search-tree` + `HighlightMatch`, draft state).
>   - **Tedarikçi register Step 3 + supplier profil categories-card** → `SegmentOnlySelector` (inline checkbox listesi, max 10, counter + clear all). Modal yok, sade görünüm.
>   - `useRoots` / `useChildren(parentId)` / `useCategoriesByIds(ids)` / `useCategorySearch(q)` / `useCategorySearchTree(q)` hooks; eski `useCategoryTree` kaldırıldı.
> - `categories.json` silindi, `categories.txt` UTF-8 (1618 satır) yeni kaynak.
> - typecheck 6/6 yeşil. Manuel E2E: tender L1/L2 reject + L3/L4 accept + invalid id 404 + backward-compat V1 null-category, supplier L2/L3/L4 reject + L1 accept, `/search-tree?q=monitör` hiyerarşik tree, cross-token izolasyonu.

> **V2-6.5 — RBAC (Role-Based Access Control)**:
> - Schema migration `v2_6_5_rbac_permissions` — `User.permissionsOverride Json?` (null = saf default; `{ added?: string[], removed?: string[] }`).
> - **22 permission / 6 grup** (`apps/api/.../auth/permissions/`): tender (7), bid (2), order (4), approval (2), settings (5), reports (2).
> - **3 default rol** (`ROLE_DEFAULT_PERMISSIONS`):
>   - **COMPANY_ADMIN** → yönetim-only: 5 settings + tüm view + reports (10). İhale **oluşturamaz** default'ta.
>   - **BUYER** → tender CRUD + award/cancel + bid + order + reports:view (14).
>   - **APPROVER** → approval + view (4).
> - Backend: `resolveUserPermissions(role, override)` = role default - removed + added (dedup). `PermissionsGuard` + `@RequirePermissions(...)` decorator AND mantığı. Login + `/auth/me` (DB lookup) + `/tenants/me/users/(me|:id|list)` response'larında `permissions: string[]` + `hasCustomPermissions: boolean`. Guard'lar: tender (create/edit/publish/delete/award/cancel/view + bid:compare/eliminate), order (view/complete/cancel), approval-requests (view/approve). Settings controller'ları `@Roles("COMPANY_ADMIN")` ile korundu (backward compat).
> - User update endpoint `permissionsOverride` kabul eder (added/removed validation ALL_PERMISSIONS whitelist'i karşı; self-update bloklu; null gönderim Prisma.JsonNull ile saf default'a döner). Boş added+removed normalize edilir.
> - Frontend: `lib/permissions.ts` (PERMISSION_GROUPS, ROLE_DEFAULT_PERMISSIONS, computePermissionsOverride). `usePermissions` hook (has/hasAny/hasAll). `<PermissionGuard>` route wrapper. `NavItem.permission` + sidebar filter. `/dashboard/ihaleler/yeni` PermissionGuard ile sarıldı. `EditUserModal` artık rol radio + 6 grup permission checkbox + role değişiminde otomatik default sync + +/− görsel rozet (eklenen/kaldırılan) + "Varsayılana Dön" + "Özelleştirilmiş" warning.
> - Doğrulama: COMPANY_ADMIN POST tender → 403 (default tender:create yok). DB ile override eklendikten sonra → 201. Login response 10 yetki, BUYER 14, APPROVER 4. typecheck 6/6 ✓.

> **Sıradaki major adım**: V2-7 (açık ihale + kategoriye göre kategoriye uygun e-mail bildirim + tedarikçi başvuru) sonra **production hosting** (Coolify + Hetzner, Docker image + Chromium pre-installed PDF + Resend domain verification + webhook secret).

---

