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
- Storage: MinIO (V2 — şu an base64 data URL)
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
| Supplier | localhost:3000/supplier/login | (seed'den) | (seed'den) |
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

---

## Bekleyen — V1.5 / V2 / V3

### V1.5 (kısa vadeli)
- Sipariş status workflow (Kabul/Reddet/Üretim/Teslim/Tamamla)
- Sipariş PDF export
- Sipariş üzerinde mesajlaşma
- Sipariş listesi gelişmiş filtreleme/arama
- Admin dashboard KPI'ları (demo + buyer + supplier stats agregasyonu)

### V2 (orta vadeli)
- TCMB API + döviz kuru dönüşümü (çoklu para birimi karşılaştırması)
- MinIO presigned URL (vergi levhası + tender/bid attachment) — V1'de base64 data URL
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
