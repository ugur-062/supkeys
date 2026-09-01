# Denetim Bulguları — integrity-reviewer

> **Terminoloji notu (2026-09-01):** Bu rapor yazıldığında ürün dilinde
> "ihale" kullanılıyordu. Sonradan kullanıcı-yüzü dil **"satın alma talebi"**
> (satış tarafında "ilan") olarak değiştirildi. Rapor metni BİLİNÇLİ olarak
> güncellenmedi: o tarihteki kodu ve dizeleri anlatıyor, bugünkü sözcükle
> yeniden yazılırsa okuyucu git geçmişinde başka bir şey bulur. Kod adları
> (`IhaleListView`, `ihaleler-view.tsx` vb.) zaten değişmedi. Bkz. CLAUDE.md
> § Ürün Dili.



Kapsam: webhook fail-closed, presigned-URL sahiplik kapısı, soft-delete kaçağı,
audit kapsam boşluğu, ölü kod, rate-limit tutarsızlığı.
Yöntem: salt-okuma, kod yolu izleme. Referans: `docs/invariants.md`.

Handshake: sent→tenancy-reviewer; received←(bekleniyor, ACK edilecek)

---

## Özet tablo

| # | Severity | Konu | Durum |
|---|----------|------|-------|
| 1 | LOW | Webhook double-wrong-config bypass (denylist NODE_ENV) | Doğrulandı |
| 2 | INFO/DOC | INV-DOC-1 "yalnız 3 list()" kanıtı yanlış — 3 ek presign yolu (hepsi kapılı) | Doğrulandı |
| 3 | HIGH (gap) | INV-AUDIT-1: firma-tarafı para/durum geçişleri iz BIRAKMIYOR | Doğrulandı |
| 4 | LOW | Ölü kod `tender-owner.guard.ts` (eski rol modeli, 0 çağrı) | Doğrulandı |
| 5 | LOW | admin change-password sıkı `@Throttle` taşımıyor | Doğrulandı (INV-RL-1 notu) |
| — | CLEAN | INV-SD-1 soft-delete kaçağı — kaçak YOK | Doğrulandı |
| — | CLEAN | INV-SM-6 webhook imza + idempotency — sağlam | Doğrulandı |

---

## 1. [LOW] Webhook double-wrong-config bypass — denylist yerine allowlist gerekli

`modules/resend-webhook/guards/webhook-signature.guard.ts:36-50`

**Doğrulanan iyi davranış:** İmza `svix.Webhook.verify` ile HAM gövde
(`request.rawBody.toString("utf8")`) üzerinden doğrulanıyor. Raw body `main.ts:80-90`
verify-hook'unda YALNIZ `/api/webhooks/resend` için saklanıyor; başka route rawBody
taşımaz. Secret varsa ve imza geçersizse 401. `request.rawBody` yoksa 401 (fail-closed).
Secret yoksa ve prod'da → 401. Buraya kadar sağlam.

**Bulgu:** Bypass koşulu denylist mantığı kullanıyor:
```
const isProduction = nodeEnv === "production";
if (!isProduction && allowInsecure) return true;   // imza atlanır
```
`nodeEnv` `config.get("NODE_ENV") ?? "development"` — yani **NODE_ENV set edilmezse
"development" varsayılır**. SOMUT senaryo: prod deploy'da (a) `NODE_ENV` set edilmeyi
unutulur + (b) `ALLOW_INSECURE_WEBHOOK=true` kalır + (c) `RESEND_WEBHOOK_SECRET` yok →
`!isProduction` true olur, guard imzayı ATLAR. Bu durumda saldırgan `POST /api/webhooks/resend`
ile imzasız forged event atabilir: örn. bir kurbanın `email_id`'si için `email.bounced`
göndererek o EmailLog'u `BOUNCED`'a çeker (`resend-event.service.ts:195-203`), veya
sahte `EmailEvent` kayıtları yazdırır.

**Etki:** Düşük — yalnız e-posta delivery-tracking verisi bozulur; para/durum/tenant
verisine dokunmaz. Üç eşzamanlı yanlış-config gerektirir. Ancak aynı `NODE_ENV`-unset
deliği `main.ts:45,51` JWT-placeholder kontrolünü de sessizce atlatır — yani
"NODE_ENV unset = güvenli varsay" yanlış varsayımı birden çok yerde risk taşır.

**Minimal düzeltme:** Bypass'ı allowlist yap — yalnız açıkça dev/test:
`const bypassable = nodeEnv === "development" || nodeEnv === "test";`
`if (bypassable && allowInsecure) return true;`. Böylece bilinmeyen/unset NODE_ENV
default-secure olur. INV-SM-6.

---

## 2. [INFO/DOC] INV-DOC-1 kanıtı eksik — presigned-GET 3 değil 6 yolda üretiliyor (hepsi kapılı)

INV-DOC-1 kanıtı: *"Presigned-GET yalnız bu üç `list()`'te üretilir."* Bu **olgusal
olarak yanlış.** `getSignedUrl`/`presignStoredObject`/`resolveImageUrl` tüm çağrıları
tarandı; presigned URL üreten 6 yol var:

| Yol | Dosya:satır | Kapı | Sonuç |
|-----|-------------|------|-------|
| İlan belge list | `company-listing-documents.service.ts:235` | `assertCanView` + owner | ✓ kapılı (belgelenen) |
| Teklif belge list | `company-bid-documents.service.ts:147` | non-owner `bidderCompanyId` filtresi | ✓ kapılı, kapalı-zarf (belgelenen) |
| Sipariş belge list | `company-order-documents.service.ts:112` | `requireParty` | ✓ kapılı (belgelenen) |
| **KYC self-view** | `company-docs.service.ts:113` | `CompanyJwtAuthGuard`+`company:manage`, `companyId` auth'tan | ✓ kapılı (BELGELENMEMİŞ) |
| **KYC admin-view** | `admin-companies.service.ts:375-380` | `AdminJwtAuthGuard`+`@RequireAdminRole(SUPER_ADMIN,SALES)` (SUPPORT dışı) | ✓ kapılı (BELGELENMEMİŞ) |
| Profil logo/kapak | `company-profile.service.ts:103` (`resolveImageUrl`) | prefix `buildTenantProfilePrefix(companyId)` guard | ✓ public görsel, hassas değil (BELGELENMEMİŞ) |

**Sonuç:** Kapısı OLMAYAN presign yolu YOK — CRITICAL yok. Teklifveren yalnız kendi
firmasının teklif belgesini presign edebiliyor (kapalı zarf korunuyor). ANCAK INV-DOC-1'in
"yalnız 3 list()" kanıt cümlesi yanlış; "bu 3 yol dışına presign eklenirse kapı düşünülmez"
zihinsel modeli riskli. Kanıt cümlesi 6 yolu kapsayacak şekilde güncellenmeli (özellikle
`presignStoredObject` primitifi KYC PII döndürüyor ve iki ayrı realm'den çağrılıyor).

### 2b. Adversarial takip — presign edilen KEY nereden geliyor? (kayıt-sahipliği vs key-provenance)

Team-lead sorusu: kapı DB kaydının sahipliğini mi doğruluyor yoksa presign edilen R2
object key'inin o kayda ait olduğunu da mı? Yani key **(a)** DB kaydının kendi alanından mı
yoksa **(b)** request'ten gelip kayıtla eşleştirilmeden mi presign ediliyor? 6 yol tek tek:

| # | Yol | Key kaynağı | Sınıf | Not |
|---|-----|-------------|-------|-----|
| 1 | listing-docs `:235` | `d.key`, `listingDocument.findMany({where:{listingId}})` | **(a)** | Key DB kaydından; request'ten key gelmiyor |
| 2 | bid-docs `:147` | `d.key`, `listingBidDocument.findMany` (non-owner `bidderCompanyId` filtreli) | **(a)** | Key DB kaydından, kapalı zarf |
| 3 | order-docs `:112` | `d.key`, `companyOrderDocument.findMany({where:{orderId}})` | **(a)** | Key DB kaydından |
| 4 | KYC self `:113` | `c[DOC_META[k].url]`, `company.findUnique({id:companyId})` (companyId auth'tan) | **(a)** | Key DB kaydından |
| 5 | KYC admin `:375-380` | `c.docTaxPlateUrl` vb., admin `company` kaydından | **(a)** | Key DB kaydından |
| 6 | profil görsel `:103` | `resolveUploadedImage(companyId, key)` — **key REQUEST'ten** | **(b) ama prefix-kapılı** | key `buildTenantProfilePrefix(companyId)` ile başlamak ZORUNDA (`:98`); prefix companyId gömüyor (`storage.service.ts:218-220`) → yalnız KENDİ tenant öneki çözülebilir + döndürülen public logo/kapak (hassas değil) |

**Kesin cevap:** 5/6 yol saf **(a)** — presign edilen key doğrudan DB kaydının alanından
geliyor, request hiçbir key/path taşımıyor, dolayısıyla "sahibi olduğun kaydın kapısını geçip
başka firmanın object key'ini presign etme" senaryosu YAPISAL OLARAK imkânsız. 1/6 yol (profil
görseli) request-supplied key alıyor ama presign ÖNCESİ prefix guard'ı client-key'i çağıranın
kendi `tenant-profile/${companyId}/` önekine hapsediyor VE çıktı hassas değil (public logo).
**Hiçbir (b)-korumasız yol YOK → CRITICAL YOK.** Tek başına "download by key/id" alan ayrı bir
endpoint de yok (generatePresignedGet yalnız 3 list()'te, presignStoredObject yalnız KYC
2 yolunda, resolveImageUrl yalnız profil — grep ile teyitli).

---

## 3. [HIGH — INV-AUDIT-1 gap] Firma-tarafı para/durum geçişleri audit izi BIRAKMIYOR

INV-AUDIT-1 "populate akışı eksik" diyor ama bu **kısmen eskimiş**: admin tarafı iyi
kaplanmış. `AuditService.log` çağrıları (34 çağrı) şu modüllerde VAR:
`admin-auth`, `admin-staff`, `admin-companies` (moderasyon/doğrulama/askıya alma),
`admin-company-users`, `admin-system`, `email/admin-email-logs`, `company-auth`
(login/parola/2FA). Viewer + rol kapısı (`admin-audit.controller.ts`, SUPPORT dışı) mevcut.

**Bulgu — DOĞRULANAN boşluk:** Firma-tarafı para/durum servislerinde `AuditService`
enjeksiyonu ve `audit.log` çağrısı SIFIR (grep ile teyit):
- `company-listings.service.ts` → 0
- `company-orders.service.ts` → 0
- `company-approvals.service.ts` → 0
- `company-users.service.ts` → 0
- `company-connections.service.ts` → 0

İz BIRAKMAYAN somut ayrıcalıklı/para/durum işlemleri:
- **`award` / `awardByItem`** — Order oluşturur (`ORD-YYYY-NNNN`), parasal taahhüt. İz yok.
- **Sipariş yaşam döngüsü** — accept/reject/ship/receive/complete/cancel. İz yok.
- **Ödeme** — buyer ödeme kaydı → seller confirm/reject (`CompanyOrderPaymentStatus`). İz yok.
- **Onay kararları** — award/publish approve/reject (`company-approvals`). İz yok.
- **İlan yaşam döngüsü** — publish/cancel/closeNoAward/startEvaluation/createNextRound. İz yok.
- **Teklif** — placeBid/eliminate. İz yok.
- **Firma-içi yetki** — rol promote/demote, `deactivate`/reactivate, izin override
  (`company-users.service.ts`). Yetki yükseltme izlenmiyor.
- **Bağlantı** — accept/reject/disconnect. İz yok.

**Etki:** Bir iç kullanıcı bir siparişi iptal eder, bir kazandırmayı yönlendirir veya
başka bir kullanıcının rolünü yükseltirse hiçbir append-only kayıt kalmaz; olay-sonrası
inceleme (dispute/insider) imkânsız. INV-AUDIT-1 hedefi para/durum geçişleri için AÇIK.

**Minimal düzeltme:** `AuditModule`'ü company-listings/orders/approvals/users/connections'a
enjekte et; en azından award/awardByItem, sipariş+ödeme geçişleri, onay kararları ve rol
değişikliklerine `actorType:"company"`, `tenantId:companyId`, `entityType/entityId` ile
`audit.log` ekle (log throw etmez, akışı bozmaz — `audit.service.ts:37`).

---

## 4. [LOW] Ölü kod — `common/rbac/tender-owner.guard.ts`

`common/rbac/tender-owner.guard.ts:15` (`assertCanActOnTender`)

Dosya var (892 byte) ama tüm repoda `TenderOwnerGuard`/`tender-owner`/`assertCanActOnTender`
için **0 çağrı/import** (grep, spec hariç). Üstelik bir Guard bile değil — çıplak fonksiyon.
`user.role === "COMPANY_ADMIN"` (tekil `role` string) referansı ESKİ rol modeline ait;
2026-06-26 birleşik-Company pivotundan sonra sistem `roles[]` + `isOwner` +
`hasCompanyPermission` kullanıyor. İşlevi bugün `assertListingManageRole` (INV-AZ-1) tarafından
karşılanıyor. Ölü + yanıltıcı (artık var olmayan rol modelini ima ediyor).

**Minimal düzeltme:** Dosyayı sil.

---

## 5. [LOW] admin change-password sıkı `@Throttle` taşımıyor (INV-RL-1 notu doğrulandı)

`modules/admin-auth/admin-auth.controller.ts:86-92`

`@Post("change-password")` yalnız `@UseGuards(AdminJwtAuthGuard)` taşıyor; per-route
`@Throttle` YOK → global default binding'e (100/60s) düşüyor. Karşılaştırma: aynı
controller `login` `:68` `@Throttle({ auth: { limit: 10 } })` taşıyor. INV-RL-1 notundaki
tespit aynen doğru. Kimlik-doğrulanmış + mevcut parolayı bilmek gerektiği için düşük risk;
yine de current-password brute'una karşı sıkı `@Throttle` eklenmesi tutarlılık için doğru.

**Minimal düzeltme:** `@Throttle({ auth: { limit: 5, ttl: 60_000 } })` ekle (setup2fa/disable2fa
gibi hesap-güvenliği route'ları da aynı boşlukta — aynı anda ele alınabilir).

---

## CLEAN — INV-SD-1 soft-delete kaçağı YOK (doğrulandı)

Tüm `companyUser.find*/update/count` sorguları (grep) ile `deletedAt` filtreleri
çapraz eşlendi. İş-akışına kullanıcı SOKAN yollar `deletedAt: null` filtreliyor:
kimlik doğrulama `company-jwt.strategy.ts:66` + `company-auth.service.ts:554`;
bildirim alıcıları `notification.service.ts:93,143`; ilan davetli çözümü
`company-listings.service.ts:109,155,414`; sipariş rolü `company-orders.service.ts:72`;
onaycı fallback `company-approvals.service.ts:861-877` (pasif/silinmiş onaycıyı aktif
YONETICI'ye yeniden atar, zincir tıkanmaz); son-admin guard `company-users.service.ts:723-726`;
bağlantı `company-connections.service.ts:31,340`.

Filtre TAŞIMAYAN `companyUser.findMany` sorguları (approvals `:268,917,969,1026`,
company-users `:157`, company-listings `:1617`, company-reports `:96`) **yalnız
ad-çözümü** (createdById/approverUserId → "Ad Soyad" etiketi) yapıyor; silinmiş kullanıcıyı
iş akışına SOKMUYOR — en kötü ihtimalle silinmiş bir kullanıcının adı bir listede etiket
olarak görünür. Kaçak değil. INV-SD-1 operasyonel olarak sağlam.

## CLEAN — INV-SM-6 webhook imza + idempotency (doğrulandı)

İmza ham gövde svix HMAC ile doğrulanır (bkz. #1, fail-closed yön doğru).
Idempotency: `resend-event.service.ts:54-60` önce `EmailEvent.findUnique({eventId})`
ile dedupe; asıl garanti `EmailEvent.eventId @unique` (`schema.prisma:132`) — eşzamanlı
iki aynı-eventId create'inde ikincisi P2002 ile transaction'ı geri alır, Resend retry'da
findUnique yakalar → tek etki. Status precedence (`canTransitionTo`) BOUNCED/COMPLAINED'i
geri düşürmez. Sağlam.

---

## CLEAN — storage key IDOR (doğrulandı, kör nokta kapandı)

Client-supplied key ile IDOR yolu (upload/commit) caller-side prefix guard'ı taşıyor VE
primitifin key'e companyId gömdüğü teyit edildi: `buildTenantProfilePrefix(tenantId)` =
`${envPrefix}/tenant-profile/${tenantId}/` (`storage.service.ts:218-220`),
`buildTenantProfileKey` bunu prepend ediyor (`:223-231`). Caller kontrolleri:
`company-profile.resolveUploadedImage:98` (`key.startsWith(buildTenantProfilePrefix(companyId))`),
`company-docs.commit:167` (`key.startsWith('company-docs/${companyId}/')`). Uçtan uca IDOR-on-key
kapalı. Presign-GET yollarında key DB'den geliyor + kayıt zaten companyId/party-scope'lu.

## KALAN KÖR NOKTALAR
- `AuditService` dışı yapısal log (Pino) hangi işlemleri kapsıyor — bakılmadı; #3
  "audit trail" (append-only DB) bağlamında değerlendirildi, uygulama logu ayrı.
- Realtime (`/rt`) event payload'larının tenant sınırı — kapsam dışı (tenancy-reviewer).
- `storage.service.ts` presign TTL değerlerinin (PUT/GET) uygunluğu — okunmadı.
- `company-approvals` request-CREATE anında (fallback cron öncesi) silinmiş kullanıcının
  approver olarak atanabildiği pencere — fallback cron kapatıyor; create-anı validasyonu
  ayrıca var mı okunmadı (operasyonel risk düşük: silinmiş approver auth olamaz).
