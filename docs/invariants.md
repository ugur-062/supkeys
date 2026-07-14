# Rothern — Invariant'lar (ne yapması gerektiği)

Bu dosya kodun *ne yaptığını* değil, HER ZAMAN doğru olması gerekeni tanımlar.
Her invariant tek cümledir ve ihlali aranabilir olmalıdır. İhlal = bug.
Kapsam: `apps/api` (NestJS + Prisma). Son güncelleme referansı: `company-listings.service.ts`, `company-orders.service.ts`, `schema.prisma`.

---

## 1. Multi-tenancy

- **INV-MT-1** — Kullanıcı verisine dokunan her sorgu `companyId` ile scope'lanır; tenant id daima kimliği doğrulanmış bağlamdan (`@CurrentCompanyUser().companyId`) gelir, ASLA request `body`/`query`/`param`/`header`'dan alınmaz.
- **INV-MT-2** — Bir kaydı `id` ile getiren her erişim `{ id, companyId }` ile scope'lanır ya da getirdikten hemen sonra `record.companyId === user.companyId` doğrular (IDOR yok).
  - *İstisna:* Admin realm (`AdminJwtAuthGuard`) tasarım gereği cross-tenant'tır; izolasyon `@RequireAdminRole` ile sağlanır.
  - *İstisna:* Public okuma yüzeyleri (`public-profile`, `categories`, maskeli `PUBLIC` ilan görünümü) tenant-scope'suz ama yalnız açıkça herkese-açık alanları döndürür.
- **INV-MT-3** — Aktörün `roles` / `tier` / `isOwner` bilgisi her istekte DB'den taze okunur (`company-jwt.strategy.ts`), JWT payload'ından türetilmez; JWT yalnız `userId` taşır + `tokenVersion` ile iptal edilir.
- **INV-MT-4** — Hiçbir DTO'da `companyId` / `tenantId` alanı bulunmaz. (Hedef firmayı *aramak* için kullanılan public kod `rothernId` bir istisnadır; aktörü scope'lamak için ASLA kullanılmaz.)
- **INV-MT-5 (YAPISAL HEDEF — henüz sağlanmıyor)** — Tenant scope'lama merkezi bir katmanla (Prisma middleware veya Postgres RLS) zorunlu kılınmalıdır. Bugün scope'lama YALNIZCA servis-katmanı disiplinine dayanır; scope'suz yazılan tek bir sorguyu yakalayacak güvenlik ağı YOKTUR. Bu kapatılana dek her yeni sorgu manuel denetime tabidir.

---

## 2. Durum makineleri & onay akışı

### İlan (`ListingStatus`)
Durumlar: `DRAFT → IN_APPROVAL* → OPEN → IN_AWARD → IN_AWARD_APPROVAL* → AWARDED`; yan durumlar `CLOSED_NO_AWARD`, `CANCELLED`, `CLOSED`. (`schema.prisma:980`)

Geçişler ve tetikleyen (tümü firma-içi yetki kapısına tabidir — bkz. Bölüm 4):
- `DRAFT → OPEN` — `publishListing` (yayın onayı kaldırıldı; onay yalnız kazandırmada).
- `OPEN → IN_AWARD` — `startEvaluation` (sahip) VEYA süre dolumu (cron). Normal kapanış doğrudan `IN_AWARD`'a gider.
- `OPEN → CANCELLED` — `cancel` (sahip).
- `OPEN/CLOSED/IN_AWARD → AWARDED` — `award` / `awardByItem`; onay akışı varsa önce `IN_AWARD_APPROVAL`, `onAwardApproved` ile `AWARDED`.
- `OPEN/CLOSED/IN_AWARD → CLOSED_NO_AWARD` — `closeNoAward` (sahip).
- `CLOSED` — YALNIZ admin moderasyon kapatması; admin reopen ile açılır (`schema.prisma:984`).
- Yeni tur — `createNextRound` aynı ilanı in-place yeniden açar (round++), teklifleri taşıma moduna göre düzenler.

- **INV-SM-1** — İlan durum geçişleri koşullu atomik yazımla korunur: geçiş yalnız kaynak durum hâlâ geçerliyken uygulanır (`updateMany({ where: { id, status: { in: [...] } } })`, ör. `company-listings.service.ts`). Aynı geçişin eşzamanlı iki tetiklenmesi tek etki yaratır (F1: çift-kazandırma → tek sipariş).

### Teklif (`ListingBidStatus`)
- `DRAFT → SUBMITTED` — `placeBid`. `SUBMITTED → WON | AWARDED_PARTIAL | LOST` — `award`/`awardByItem`. `SUBMITTED → LOST` — `eliminate`.
- **INV-SM-2** — Gönderilmiş (`SUBMITTED`) teklif editlenemez ve geri çekilemez; tek değişim yolu alıcının elemesi (`LOST`) sonrası yeniden teklif (version++). `WITHDRAWN` yalnız legacy kayıtlarda bulunur.

### Sipariş (`CompanyOrderStatus`) — award ile `PENDING` doğar
- `PENDING → ACCEPTED` (satıcı) / `REJECTED` (satıcı) → `ACCEPTED → IN_DELIVERY` (satıcı ship) → `DELIVERED` (alıcı receive) → `COMPLETED` (alıcı complete) · yan: `CANCELLED`.
- Ödeme (`CompanyOrderPaymentStatus`): `AWAITING_CONFIRMATION` (alıcı kaydeder) → `CONFIRMED | REJECTED` (satıcı).
- Revizyon (`OrderRevisionStatus`): satıcı `ACCEPTED` siparişte `PENDING` önerir → `APPROVED | REJECTED` (alıcı) / `CANCELLED` (satıcı); ayrı kayıt — sipariş state machine'i tek yönlü kalır.
- **INV-SM-3** — Her sipariş/ödeme geçişi aktörün tarafını doğrular: `assertOrderRole(user, "seller"|"buyer")` (`company-orders.service.ts:1045`). Satıcı: accept/reject/ship/ödeme-onayı; alıcı: receive/complete/cancel/ödeme-kaydı.
- **INV-SM-4** — Bir sipariş `COMPLETED` olabilmesi için bekleyen (`AWAITING_CONFIRMATION`) ödeme kalmamalı ve ödeme tam onaylanmış olmalıdır (`complete()`).

### Idempotency & webhook
- **INV-SM-5** — Para/durum geçişleri idempotenttir: koşullu atomik yazım veya unique kısıt ile aynı geçiş iki kez tetiklenirse tek etki oluşur.
- **INV-SM-6** — Webhook'lar imza doğrular (svix HMAC, ham gövde üzerinden), imza/secret yoksa fail-closed davranır ve idempotenttir (dedupe referansı: `EmailEvent.eventId @unique`, `schema.prisma:132`).

---

## 3. Paket / entitlement

- **INV-ENT-1** — Pakete (`CompanyTier`: `STANDARD` | `PAKET`) veya izne bağlı HER yetenek sunucu tarafında (guard/servis/veri katmanı) zorunlu kılınır; frontend gizlemesi TEK BAŞINA yeterli değildir.
- **INV-ENT-2** — Yeni ilan işi (ilan aç/yayınla/yeni tur/davet) `PAKET` üyelik gerektirir; kontrol `assertPaidForNewListingWork` (`company-listings.service.ts`) veya `CompanyPaidTierGuard` ile yapılır. `STANDARD` üye yalnız mevcut ihalelerine teklif verebilir.
- **INV-ENT-3** — İzin kontrolü `hasCompanyPermission(roles, isOwner, permission, override)` üzerinden yapılır ve kişi-bazlı override'a (`added`/`removed`) saygı gösterir; owner-only izinler (`billing:manage`, `company:delete`, `ownership:transfer`) override kataloğunda yer almaz.

---

## 4. Authz — ilan yönetim & kazandırma aksiyonları

- **INV-AZ-1** — Şu ilan yönetim/kazandırma aksiyonları için izin ANCAK VE ANCAK: **(a)** ilanın tarafına göre `buy:listing:manage` (ALIM) VEYA `sell:listing:manage` (SATIS) izni VAR, VE **(b)** `createdById === user.userId` VEYA `user.isOwner` (SAHİP emniyet supabı). Kapsanan metotlar: `updateListing`, `deleteListing`, `publishListing`, `createNextRound`, `addInvitations`, `eliminate`, `cancel`, `startEvaluation`, `closeNoAward`, `updateInternalNotes`, `changeClosingTime`, **`award`, `awardByItem`**. Kontrol `assertListingManageRole` (`company-listings.service.ts`) veya `ownerOpenListing` ile yapılır; gereken taraf ilanın `type`'ından türetilir (yanlış-taraf yapısal olarak imkânsız).
- **INV-AZ-2** — Firma-sahipliği (`companyId`) kapısı korunur ama TEK BAŞINA yetmez; her yönetim/kazandırma aksiyonu ayrıca INV-AZ-1'i uygular. `award`/`awardByItem` için mevcut atomik status guard (F1 çift-kazandırma) da korunur.
- **INV-AZ-3** — Kazandırma kapısı yalnız aksiyonu BAŞLATAN aktörü kısıtlar; onay-zinciri/sistem-tetikli finalizasyon (`onAwardApproved → runFullAward`/`runItemAward`) bundan etkilenmez.
- **INV-AZ-4** — `extendBidValidity` bir TEKLİFVEREN aksiyonudur, ilan yönetimi DEĞİL; `bid.bidderCompanyId === user.companyId` (birleşik anahtar) ile scope'lanır ve INV-AZ-1 ona UYGULANMAZ.
- **INV-AZ-5** — `ONAYLAYICI` rolü ve `buy:/sell:listing:manage` izni olmayan roller ilan yönetim/kazandırma aksiyonlarından reddedilir.

---

## ÖNERİLEN EK INVARIANT'LAR (öneri — karar bekliyor, kural DEĞİL)

- **P1 — Belge/upload erişim kontrolü.** Her belge okuma/indirme sahiplik veya taraf kontrolüyle yetkilendirilir ve kapalı-zarfı korur: ilan belgeleri `requireOwner`/`assertCanView` (`company-listing-documents.service.ts:105/40`), sipariş belgeleri `requireParty` (`company-order-documents.service.ts:153`). Öneri: presigned URL üretimi de aynı yetkiye tabidir; teklifveren rakip belgesine erişemez.
- **P2 — Response'ta kapalı-zarf sızıntısı.** Teklifveren yüzüne dönen response `invitations`/`bids`/`bidStats` içermez; `getOne` non-owner için bunları soyar (`company-listings.service.ts`; CLAUDE.md #5). Öneri: serialization katmanında bu bir invariant olarak sabitlenmeli.
- **P3 — Rate limiting.** Global `ThrottlerGuard` var (`app.module.ts:161`) + auth endpoint'leri (login/register/password-reset) sıkı `@Throttle` altında. Öneri: kimlik/parola/kod-doğrulama endpoint'lerinin rate-limitli kalması invariant'a bağlansın.
- **P4 — Soft-delete erişilebilirliği.** `deletedAt` işaretli principal'lar kimlik doğrulayamaz ve iş akışına giremez (`company-jwt.strategy.ts:66`, `membership.scheduler.ts:73`). Öneri: soft-delete edilmiş kayıtlar tüm sorgu/bildirim yüzeylerinde filtrelenir.
- **P5 — Cron/scheduled fan-out tenant sınırı.** Zamanlanmış görevler (kapanış hatırlatması, vade cron, değerlendirme hatırlatması) alıcıları yalnız ilgili ilanın firması/taraflarıyla sınırlı çözer; cross-tenant bildirim sızmaz.
- **P6 — Audit log kapsamı.** Ayrıcalıklı/admin işlemleri ve para/durum geçişleri append-only kaydedilir. GAP: CLAUDE.md'ye göre `audit_logs` populate bekliyor — invariant henüz sağlanmıyor.
- **P7 — Davet/üyelik akışı.** Bağlantı davet accept/reject atomiktir; firma-kullanıcı daveti token'lı ve tek-kullanımlıktır, hesap yalnız kabulde açılır.

> **Not:** Önceki taslaktaki "P1 — kazandırmada oluşturan kısıtı asimetrisi" bulgusu, `award`/`awardByItem`'a `assertListingManageRole` eklenerek KAPATILDI (bkz. INV-AZ-1); artık öneri değil, sağlanan bir invariant.

---

## Denetlenmemiş alanlar ("temiz" DEĞİL, "bilinmiyor")
- Realtime event payload'larının tenant sınırını koruyup korumadığı
- Admin rol granülaritesinin route-bazlı tam denetimi
- İki büyük servisin (`company-listings` ~5600 st., `company-orders` ~1600 st.) satır-satır okunmamış kısımları
- `tender-owner.guard.ts`'in bir controller'a bağlı olup olmadığı (ölü kod şüphesi)
- `.env`/deploy konfigürasyonu, git-history, secrets rotasyonu

## Bilinen küçük hijyen kalemleri
- `password-reset.service.ts` / `supabase-auth.service.ts`: log'da PII (e-posta/authId)
- `ALLOW_INSECURE_WEBHOOK` çift-yanlış-config riski (prod'da NODE_ENV unset + flag=true)
- `seed.ts` demo parolası prod seed'inden uzak tutulmalı
