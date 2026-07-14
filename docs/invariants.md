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
  - *Kapsam (2026-07-14 sonrası):* `award`/`awardByItem`/`closeNoAward`/`startEvaluation`'a EK olarak `publishListing`, `cancel` ve `createNextRound` de artık bu deseni kullanır. Bu üçü önceden koşulsuz `listing.update` ile durumu KOŞULSUZ eziyordu (Tur-3 denetimi #11/#5/#1, INV-SM-1 ihlali) — düzeltildi: her biri `updateMany` + `count === 1` guard'ı, aksi halde `ConflictException` + tx rollback; yan etki (bildirim/duyuru/sipariş) yalnız kazanan çağrıda tetiklenir. `createNextRound` ayrıca `where`'ine `currentRound: <okunan>` eşitlik guard'ı ekler: eşzamanlı çift-tur açılışı ikinci çağrıda `count = 0` alır → tur bir kez artar (self-race'te +2 değil). Kanıt/regresyon: `test/integration/listing-state-race.spec.ts`.

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

## 5. Erişim kontrolü, veri sızıntısı, kimlik & üyelik

- **INV-DOC-1** — Her belge okuma/indirme ve presigned-GET üretimi, veriyi döndürmeden/URL üretmeden ÖNCE sahiplik veya taraf-üyeliği doğrular; teklifveren yalnız KENDİ firmasının belgelerini presign edebilir (kapalı zarf).
  - *Kanıt:* Presigned-GET üreten **6 yol** var, hepsi sahiplik/üyelik/rol kapılı:
    1. **İlan belgeleri** — `assertCanView` (`company-listing-documents.service.ts:222` → presign `:235`) + upload/register/remove'da `requireOwner`.
    2. **Teklif belgeleri** — non-owner sorgusu `bidderCompanyId` ile filtreli, kapalı zarf (`company-bid-documents.service.ts:131-133` → presign `:147`).
    3. **Sipariş belgeleri** — `requireParty` (`company-order-documents.service.ts:100` → presign `:112`).
    4. **KYC self-view** — firma kendi belgelerini görür; controller `@RequireCompanyPermission("company:manage")` (`company-docs.controller.ts:39`) + kendi `companyId` scope, presign `company-docs.service.ts:113`. Düşük-yetkili operasyon rolleri firmanın KYC PII'sini çekemez.
    5. **KYC admin-view** — `@RequireAdminRole("SUPER_ADMIN","SALES")` (`admin-companies.controller.ts:301`), salt-okuma SUPPORT rolüne kapalı; presign `admin-companies.service.ts:375-380`.
    6. **Profil logo** — yükleme sonrası key→URL çözümü IDOR-kapılı: key yalnız KENDİ firmanın `buildTenantProfilePrefix(companyId)` öneki altında olabilir (`company-profile.service.ts:98` → `resolveImageUrl` presign `:103`); logo bilinçli-public vitrin görselidir, presign yalnız `R2_PUBLIC_BASE_URL` set değilken fallback.

- **INV-BID-1** — Teklifveren (non-owner) yüzüne dönen ilan detay response'u `bids`/`invitations`/`bidStats` içermez; bu alanlar yalnız `getOne`'ın sahip dalında sorgulanıp döndürülür.
  - *Kanıt:* `company-listings.service.ts` owner dalı `:2057` (bids/invitations yalnız burada), non-owner return `:2315` (bu alanlar yok); `listTenders` yalnız `_count` (`:1639-1640`); `sellerTenders` yalnız kendi teklifi (`:1789-1792`).
  - *İstisna:* İngiliz-usulü açık en-iyi-fiyat görünümü (`english`/`auctionView`) non-owner'a `bidVisibility` moduna göre gösterilir — kapalı-zarf teklif verisi değil, tasarımca açık-eksiltme özelliği.

- **INV-RL-1** — Kimlik/parola/kod-doğrulama endpoint'leri (login, kayıt, e-posta doğrula, kod-yeniden-gönder, parola-sıfırla) sıkı per-route `@Throttle` ile rate-limitlidir; global `ThrottlerGuard` (APP_GUARD) altında hiçbiri gevşek default'a düşmez.
  - *Kanıt:* `app.module.ts:161` global guard; `company-auth.controller.ts` login `:87-88`(10)/signup `:62-63`(5)/verify `:73-74`(10)/resend `:80-81`(3)/forgot `:55-56`(5); `admin-auth.controller.ts` login(10) + hesap-güvenlik mutasyonları change-password/2fa-setup/2fa-enable/2fa-disable her biri `@Throttle({ auth: { limit: 5, ttl: 60_000 } })`; `password-reset.controller.ts:14-15`(5).
  - *Not:* #10 — admin parola/2FA mutasyonları artık sıkı `@Throttle` taşır (eskiden default 100/60s'e düşüyorlardı; kimlik-doğrulanmış olsa da brute-force yüzeyi). Wiring kanıtı: `test/unit/admin-auth-throttle-wiring.spec.ts`.

- **INV-SD-1** — `deletedAt` işaretli `CompanyUser` kimlik doğrulayamaz ve iş akışına (üye/alıcı/onaylayıcı/bildirim) giremez; `CompanyUser` sistemdeki TEK soft-delete edilebilen modeldir ve ona dokunan sorgular `deletedAt: null` filtreler.
  - *Kanıt:* `company-jwt.strategy.ts:66`, `company-auth.service.ts:554`; `deletedAt` yalnız `CompanyUser`'da (`schema.prisma:1357`); filtreler `membership.scheduler.ts:73`, `notification.service.ts:89-93/143`, `approvals` `:863-877`, `orders` `:72`, `listings` `:109/155/414`, `company-users` `:56/611/726`.
  - *Kapsam düzeltmesi:* Önceki taslaktaki "tüm kayıt yüzeyleri" fazla genişti — Listing/Order/Notification soft-delete taşımaz (`isActive`/`status` kullanır).

- **INV-CRON-1** — Katılımcı bildirimi gönderen zamanlanmış görevler (kapanış hatırlatması, vade/ödeme hatırlatması, değerlendirme-geçerlilik hatırlatması) alıcıları YALNIZ ilgili kaydın taraflarından çözer (ilan: davetli+teklifçi+sahip; sipariş: alıcı/satıcı); fan-out primitifi `pushToCompanies` alıcıyı verilen id kümesine kısıtlar.
  - *Kanıt:* `notifyListingClosed` (`company-listings.service.ts:246-261,302`), `notifyListingInvitees` (`:565-568`), `notifyEvaluationValidityReminder` (`:5288,5302`), `sendDuePaymentReminders`→`notifyOrderParty` (`company-orders.service.ts:955-961,97-105`), `pushToCompanies` (`notification.service.ts:139-149`).
  - *İstisna (meşru, tasarım):* `announceOpened` cron'u (`listing.scheduler.ts:156` → `notifyCategoryMatchedCompanies:345-414`) PUBLIC ilanları kategori-eşleşen PAKET firmalara tenant-ötesi duyurur — keşif yayını, `visibility === "PUBLIC"` kapılı (`:362`), özel/tenant verisi taşımaz.

- **INV-INV-1** — Bağlantı davet accept/reject/disconnect atomik koşullu yazımla yapılır (`updateMany`/`deleteMany` status=PENDING, `count===0`→Conflict); firma-kullanıcı daveti `@unique` token'lıdır, tek kullanımlıktır ve `CompanyUser` hesabı YALNIZ accept transaction'ında oluşturulur (davet anında değil).
  - *Kanıt:* connections accept `:802-822`/reject `:859-865`/disconnect `:876-884`; invitation token `@unique` (`schema.prisma:1396`), atomik consume `company-users.service.ts:247-255`, `requireUsableInvitation:294-300` (ACCEPTED/CANCELLED/EXPIRED + süre reddi), hesap yalnız accept tx'inde `:256-276`.

---

## Karşılanmamış hedefler (henüz sağlanmıyor — kural DEĞİL)

- **INV-AUDIT-1 (HEDEF)** — Ayrıcalıklı/admin işlemleri ve para/durum geçişleri append-only bir audit trail'e kaydedilmelidir. Bugün `audit_logs` populate akışı eksik (CLAUDE.md); yalnız `admin_notes`/`membership_events` gibi kısmi kayıtlar var, kapsamlı iz YOK. Bu kapatılana dek denetim izi eksiktir.
- **INV-MT-5 (HEDEF)** — Merkezi tenant-scope zorlaması (Prisma middleware / Postgres RLS) henüz yok; bölüm 1'e bakınız.

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
