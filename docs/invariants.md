# Rothern — Invariant'lar (ne yapması gerektiği)

Bu dosya kodun *ne yaptığını* değil, HER ZAMAN doğru olması gerekeni tanımlar.
Her invariant tek cümledir ve ihlali aranabilir olmalıdır. İhlal = bug.
Kapsam: `apps/api` (NestJS + Prisma). Son güncelleme referansı: `company-listings.service.ts`, `company-orders.service.ts`, `schema.prisma`. 2026-07-14 denetim hizalaması; kapatılan bulgular için bkz. dosya sonundaki "Denetim geçmişi".

---

## 1. Multi-tenancy

- **INV-MT-1** — Kullanıcı verisine dokunan her sorgu `companyId` ile scope'lanır; tenant id daima kimliği doğrulanmış bağlamdan (`@CurrentCompanyUser().companyId`) gelir, ASLA request `body`/`query`/`param`/`header`'dan alınmaz.
- **INV-MT-2** — Bir kaydı `id` ile getiren her erişim `{ id, companyId }` ile scope'lanır ya da getirdikten hemen sonra `record.companyId === user.companyId` doğrular (IDOR yok).
  - *İstisna:* Admin realm (`AdminJwtAuthGuard`) tasarım gereği cross-tenant'tır; izolasyon `@RequireAdminRole` ile sağlanır.
  - *İstisna:* Public okuma yüzeyleri (`public-profile`, `categories`, maskeli `PUBLIC` ilan görünümü) tenant-scope'suz ama yalnız açıkça herkese-açık alanları döndürür.
- **INV-MT-3** — Aktörün `roles` / `tier` / `isOwner` bilgisi her istekte DB'den taze okunur (`company-jwt.strategy.ts`), JWT payload'ından türetilmez; JWT yalnız `userId` taşır + `tokenVersion` ile iptal edilir.
  - *Kapsam (WS, 2026-07-14):* Realtime handshake de aynı taze-DB kapısını uygular: `realtime.gateway.ts:96-102` bağlantı/yeniden-bağlantıda `isActive`/`deletedAt`/`company.isActive`/`company.isBlocked`/`tokenVersion` DB'den doğrular, başarısızsa soket reddedilir (iptal-bypass kapandı). Ayrıca token `exp` dolunca soket exp-timer ile kendini kapatır (`:114-121`, cleanup `:131`) — süresiz-soket önlemi. Periyodik DB-yeniden-doğrulama (tam polling) ölçek maliyeti için ERTELENDİ.
- **INV-MT-4** — Hiçbir DTO'da `companyId` / `tenantId` alanı bulunmaz. (Hedef firmayı *aramak* için kullanılan public kod `rothernId` bir istisnadır; aktörü scope'lamak için ASLA kullanılmaz.)
- **INV-MT-5 (GÜVENLİK AĞI HEDEFİ — henüz sağlanmıyor)** — Postgres RLS bir **güvenlik ağı (backstop)** olarak eklenmelidir: servis katmanında scope'suz yazılmış tek bir sorguyu DB'de yakalar. **RLS servis disiplinini İKAME ETMEZ** — birincil tenant kapısı INV-MT-1..4 (servis katmanı) olarak KALIR. Bugün scope'lama YALNIZCA servis disiplinine dayanır; scope'suz sorguyu yakalayacak ağ YOKTUR, bu kapatılana dek her yeni sorgu manuel denetime tabidir. Bu turlardaki durum-yarışları (INV-SM-1: #1/#5/#11) ve fail-open admin authz (#12) hep bu ağ eksikliğinin belirtileriydi — nokta-atışı kapatıldı ama hedef DURUYOR.
  - **RLS'in yapısal SINIRI:** RLS satır-seviyesidir, **kolon-maskeleme yapamaz** → kapalı zarf (INV-BID-1: sahip tüm teklifleri görür, tedarikçi yalnız kendi teklifini) RLS ile ifade EDİLEMEZ; servis katmanında kalır. RLS burada tam ikame değil, yalnız satır-görünürlük yedeğidir.
  - **Bugün RLS tamamen inert:** Prisma, tabloların **sahibi** olan `postgres` rolüyle bağlanır (`DATABASE_URL`); tablo sahibi RLS'i baypas eder (rol `BYPASSRLS` ise `FORCE ROW LEVEL SECURITY` bile bağlamaz). → Policy yazmak TEK BAŞINA hiçbir şey yapmaz.
  - **Ön koşullar:** (a) ayrı **kısıtlı runtime rolü** — tablo sahibi DEĞİL, `BYPASSRLS` DEĞİL, yalnız DML grant'li (migration'lar `postgres`/sahiple devam eder); (b) **`SET LOCAL app.current_company_id`-in-transaction plumbing** (Prisma Client extension) + policy `current_setting('app.current_company_id', true)` okur. **6543 transaction pooler'da `SET LOCAL` GÜVENLİ** (transaction-scope, COMMIT'te ölür); düz `SET` TEHLİKELİ (session'da kalır → sonraki client'a sızar). Supabase kendi `auth.uid()` modeli BİZE UYMAZ (PostgREST/`authenticated` rolü değil, kendi JWT'miz + doğrudan Prisma bağlantısı).
  - **Bedel:** her sorgu ekstra `BEGIN/COMMIT` round-trip'i; `connection_limit=1` ile serialize/latency riski.
  - **Aşamalı yol:** plumbing → permissive no-op (`ENABLE RLS` + `USING (true)`, davranış değişmez, plumbing kanıtı) → 13 doğrudan `companyId` tablosu → transitif tablolar (ebeveynden scope; `companyId` denormalize kolonu veya subquery policy) → cross-company/kapalı-zarf **en son**. Admin (cross-tenant), public katalog (`publicEnabled`) ve cron/sistem işleri için bypass GUC/policy gerekir. Yazma (`WITH CHECK`) okuma (`USING`) filtresinden SONRA.
  - **Efor:** ~3-4 hafta tam kapsam; **en yüksek getiri ilk 13 doğrudan tabloda (~1 hafta)**. **Launch-blocker DEĞİL** — launch sonrası aşamalı. Fizibilite detayı için bu denetim turunun raporuna bakınız.

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
  - *Kapsam (2026-07-17, B1 kör-nokta):* `eliminate` de artık koşullu (`updateMany({id,status:SUBMITTED})`+`count===1`→throw, bildirimden önce) — eski koşulsuz `update`, award-then-eliminate yarışında kazananı LOST'a ezip yanıltıcı bildirim yolluyordu. Simetrik olarak award-winner yazımı da sertleşti: `runFullAward` winner update `update`→koşullu `updateMany`+count (eskiden koşulsuzdu → elenmiş bid'i WON'a ezebiliyordu), `runItemAward` winner `updateMany`'lerine toplam-count guard (elenmiş winner'a WON'suz sipariş sızıntısı). Üçü de mevcut ön-kontrollerin (eliminate:5476, award public+`runFullAward` bid-status, `awardByItem` validBids) TOCTOU backstop'u. Kanıt: `listing-state-race.spec.ts` (B1 describe).
  - *Kapsam (2026-07-17, F2):* `changeClosingTime` de artık koşullu (`updateMany({id,status:"OPEN"})`+`count===1`→`ConflictException`). Eskiden `ownerOpenListing` OPEN okuyup KOŞULSUZ `update` yapıyordu; eşzamanlı cron/startEvaluation/award ilanı OPEN'dan çıkarsa `closesAt` non-OPEN ilana yazılıyordu. Bugün KOZMETİK (`closesAt` status değil; placeBid/auto-close cron status-filtreli → teklif yeniden açılmaz) ama kardeş simetrisi korundu. `ownerOpenListing` ön-kontrol, guard TOCTOU backstop'u. Kanıt: `listing-state-race.spec.ts` (F2 describe).

### Teklif (`ListingBidStatus`)
- `DRAFT → SUBMITTED` — `placeBid`. `SUBMITTED → WON | AWARDED_PARTIAL | LOST` — `award`/`awardByItem`. `SUBMITTED → LOST` — `eliminate`.
- **INV-SM-2** — Gönderilmiş (`SUBMITTED`) teklif editlenemez ve geri çekilemez; tek değişim yolu alıcının elemesi (`LOST`) sonrası yeniden teklif (version++). `WITHDRAWN` yalnız legacy kayıtlarda bulunur.

### Sipariş (`CompanyOrderStatus`) — award ile `PENDING` doğar
- `PENDING → ACCEPTED` (satıcı) / `REJECTED` (satıcı) → `ACCEPTED → IN_DELIVERY` (satıcı ship) → `DELIVERED` (alıcı receive) → `COMPLETED` (alıcı complete) · yan: `CANCELLED`.
- Ödeme (`CompanyOrderPaymentStatus`): `AWAITING_CONFIRMATION` (alıcı kaydeder) → `CONFIRMED | REJECTED` (satıcı).
- Revizyon (`OrderRevisionStatus`): satıcı `ACCEPTED` siparişte `PENDING` önerir → `APPROVED | REJECTED` (alıcı) / `CANCELLED` (satıcı); ayrı kayıt — sipariş state machine'i tek yönlü kalır.
- **A1 — Satıcı iptal talebi + `DISPUTED`:** satıcı yalnız `ACCEPTED`'te iptal TALEP eder (order alanı `cancelRequestedAt`, durum değişmez); alıcı onaylar → `CANCELLED` ya da reddeder → `DISPUTED` (ACCEPTED'a DÖNMEZ). `DISPUTED` iki-yönlü çıkış: satıcı `ship` (→`IN_DELIVERY`) VEYA alıcı onay (→`CANCELLED`). **Otomatik onay YOK.** Ayrı tablo yok — tek gerekçe + sonucu order statüsü; tam kanıt `audit_logs`'ta (platform hakem değil, kaydeder). Açık talep = `status===ACCEPTED && cancelRequestedAt!=null`. Yan etki: `DISPUTED`'da vade cron (DELIVERED-filtreli) çalışmaz, `isPaymentOpen`=false, revizyon reddedilir.
- **TTK 23 — Ayıp ihbarı + `DISPUTED` (A1 ile AYNI durum, farklı origin):** alıcı teslimden (`deliveredAt`) itibaren **8 gün** içinde ayıp ihbar eder → `DISPUTED` (order alanları `defectNotifiedAt`/`defectReason`/`disputePrevStatus`). Pencere `DELIVERED` **ve** `COMPLETED`'da açık (TTK ödemeye bakmaz → COMPLETED non-terminal); süre dolunca buton kapanır, **otomatik kabul/damga YOK** (scheduler yok — TTK'nın hak-kaybı yasal sonuç, platform damgası değil). Tek pencere (2/8 açık/gizli ayrımı hukuki nitelendirme). Çıkış: alıcı `withdrawDefectNotice` → `disputePrevStatus`'a döner; satıcının on-platform aksiyonu YOK (çözüm dışarıda). **Ayrım:** ayıp-DISPUTED ⟺ `defectNotifiedAt!=null`; A1-DISPUTED ⟺ `cancelRequestedAt` (defect yok). Bu yüzden A1 çıkışları ayıp-DISPUTED'ta KAPALI: `ship()` `defectNotifiedAt` guard'ı + `approveCancelRequest` DISPUTED WHERE'inde `defectNotifiedAt:null`. Atomik `updateMany+count===1`. Kanıt `audit_logs` (`defect_notified`/`defect_notice_withdrawn`).
- **INV-SM-3** — Her sipariş/ödeme geçişi aktörün tarafını doğrular: `assertOrderRole(user, "seller"|"buyer")` (`company-orders.service.ts:1045`). Satıcı: accept/reject/ship/ödeme-onayı/**iptal-talebi-aç/geri-çek**; alıcı: receive/complete/cancel/ödeme-kaydı/**iptal-talebi-onay/red**. İptal talebi geçişleri de koşullu atomik (`updateMany` + `count===1`, flag-koşullu — INV-SM-1 sınıfı korunur).
- **INV-SM-4** — Bir sipariş `COMPLETED` olabilmesi için bekleyen (`AWAITING_CONFIRMATION`) ödeme kalmamalı ve ödeme tam onaylanmış olmalıdır (`complete()`).

### Para (Decimal, epsilon yok)
- **INV-MONEY-1** — Para karşılaştırmaları ve KAPI kontrolleri **`Prisma.Decimal`** ile yapılır; KARAR sınırında `Number()`'a düşürülmez. **Tolerans/epsilon KULLANILMAZ** — eşitlik geçer (`confirmed.gte(total)` = tam ödendi; `recorded+amount ≤ cap` = kabul), 1 kuruş eksik/fazla tam olarak yakalanır. Kapsanan kapılar (`company-orders.service.ts`): `isFullyPaid`, ship/advance eşiği, `recordPayment` cap, `receive`/`complete`/`paymentDecision` oto-tamamlama, `lcMarkPaid` remaining, due-reminder; onay eşiği (`company-approvals.service.ts` — award/awardByItem Decimal geçer, `amountDec.lt(minDec)`); `confirmedPaymentSum` TEK KAYNAK Decimal döner.
  - **Karar ≠ Gösterim:** GÖSTERİM sınırı (serialize/response, mesaj) `.toFixed(2)`/`.toString()`/`.toNumber().toLocaleString()` ile string/number üretmeye DEVAM eder → API yanıt şekli değişmez. `Number()` yalnız gösterimde geçerlidir, kararda değil.
  - **Yuvarlama:** para hesabı `Decimal ... ROUND_HALF_UP` (Decimal(18,2) kolon hassasiyeti; eski `Math.round` half-up davranışını korur). Kural (`advancePercentFor`) shared'da, HESAP (`total.mul(pct).div(100)`) API katmanında — shared kural kütüphanesi, para motoru değil.
  - **Taşma tavanı (MAX_MONEY=1e15):** Para toplamları `MAX_MONEY`'i AŞAMAZ — kontrol **SERVİS katmanında** (`amount.gt(MAX_MONEY)` → 400, Postgres 500 yerine): teklif (`company-listings.service.ts:3211`), buyNow (`:3745`), sipariş revizyonu (`company-orders.service.ts:662`). DTO `@Max` yalnız **erken eleme** — taşma çarpımsal VE toplamsal olduğundan **per-alan tavan çarpımların TOPLAMINI ifade EDEMEZ** (her satır ≤1e16 olsa da 500 kalem × ~9e15 > kolon). Award/order ayrı guard İSTEMEZ (`awardedQty ≤ fullQty` → bid guard'ı transitif kapsar). `MAX_MONEY`/`MAX_QUANTITY`: `common/constants/money.ts`. Kanıt: `company-listings.spec` (subtotal>MAX→400) + `order-workflow.spec` (revizyon toplamsal-taşma→400).
  - *Eski gap KAPANDI (INV-FX-1):* `Listing.auctionRateSnapshot` kuru artık Decimal-STRING saklanır (eski JSON float lossy'liği giderildi). Kanıt/regresyon: `test/integration/order-workflow.spec.ts` (tam-eşit geçer, 1 kuruş eksik/fazla sınırları).

### Kur / FX (tek baz)
- **INV-FX-1** — Bir teklifin TRY karşılığı **TEK YETKİLİ BAZ** ile hesaplanır: `auctionTryValue` önceliği = **ilanın açılış damgası** (`Listing.auctionRateSnapshot`, ENGLISH_AUCTION'da tur başına basılır) **→ teklifin kendi damgası** (`ListingBid.exchangeRateSnapshot`, RFQ/legacy) **→ null**. Damga kurları **Decimal-STRING** saklanır (`buildAuctionRateSnapshot`), okuyucu (`snapRateDecimal`) string+legacy-float ikisini de kabul eder. **Format-farkında adalet:** AUCTION = eşzamanlı rekabet → açılış günü ortak baz; RFQ = haftalara yayılan gizli teklif → her teklif kendi submit-anı bazı (açılışta dondurmak geç geleni cezalandırırdı — RFQ'ya ayrı açılış damgası BİLİNÇLİ olarak üretilmez).
  - **Tek kaynağa bağlanan dört an** (`company-listings.service.ts`): (1) **sıralama** `rankAuctionBids`; (2) **ekran** `amountTry` (bidsForCompany + owner-detay, artık sıralamayla AYNI kur — eski "yalnız per-bid damga" ıraksaması kapandı); (3) **onay eşiği** `toTryAmount`/`itemAwardTotal` (eski kazandırma-günü canlı `getCurrentRate` DEĞİL); (4) **taban kontrolü** `placeBid` (ENGLISH_AUCTION açılış damgasından; damgasız birim/RFQ → `getFreshRate` strict, money-safe).
  - **X3 fail-closed:** baz bilinmiyorsa (yabancı para + damga yok + teklif-damgası yok) `toTryAmount` **null** döner → onay **ATLANMAZ, ZORUNLU** kılınır (`requestApproval` `forceRequireApproval` → hiçbir adım SKIPPED olmaz). Eski **ham-tutar fallback'i** (yabancı tutarı çevirmeden eşiğe sokup sessizce atlatan) KALDIRILDI. `getCurrentRate`/`getRateOnDate` sessiz bayat/hardcoded-fallback döndüğünden **para kararında kullanılmaz** (yalnız gösterim-grade); para kararı yalnız damga veya `getFreshRate` (strict null).
  - **X6 tie-break:** eşit TRY-değerinde en erken `submittedAt` üstte (yön bağımsız), eşitse `id` ile deterministik — eski `? 0` keyfi DB/array sırasına bırakıyordu.
  - **Karar geçmişi (bilinçli davranış değişimleri):** ① karışık-kur AUCTION onay eşiği artık **açılış damgasından** (önce kazandırma-günü canlı/fallback) → bazı award'ların onay gerekliliği değişebilir; ② gösterilen `amountTry` auction'da artık **açılış damgasından** (önce per-bid) → sıralamayla tutarlı, değer değişebilir; ③ eşitlikte artık **en erken submittedAt üstte** (önce keyfi DB sırası) → bazı ilanlarda 'en iyi'/üst firma değişebilir; ④ kur bilinmeyen non-TRY award artık **onay zorunlu** (önce fallback-kur eşiği sessizce değerlendirir/atlardı). Kanıt/regresyon: `test/integration/auction-multicurrency.spec.ts` (tek-baz eşik, X3 zorunlu-onay, taban damgadan, tie-break).

### Idempotency & webhook
- **INV-SM-5** — Para/durum geçişleri idempotenttir: koşullu atomik yazım veya unique kısıt ile aynı geçiş iki kez tetiklenirse tek etki oluşur.
- **INV-SM-6** — Webhook'lar imza doğrular (svix HMAC, ham gövde üzerinden), imza/secret yoksa fail-closed davranır ve idempotenttir (dedupe referansı: `EmailEvent.eventId @unique`, `schema.prisma:132`).

### Onay akışı (görev ayrılığı)
- **INV-APPR-1** — Kazandırma onay akışında **başlatan (initiator) ≠ onaylayıcı (approver)** (görev ayrılığı): initiator kendi isteğini onaylayamaz. Zorlanma katmanları (`company-approvals.service.ts`):
  - `decide()`: `user.userId === req.createdById` ise REDDEDİLİR (son savunma).
  - `requestApproval()`: ilk aktif adımın approver'ı == initiator ise **anında ikame** edilir (`findEligibleApprover`); initiator-dışı uygun onaylayıcı yoksa award **ANINDA reddedilir** (doomed PENDING oluşmaz — net mesaj).
  - `fallbackInactiveApprovers()` (dakikalık cron): geçersiz-approver = **inaktif/silinmiş VEYA initiator**; ikame havuzu = aktif **SAHIP/YONETICI/ONAYLAYICI** ∖ {eski approver, initiator} (onaycı-uygun = fallback-uygun; eski yalnız SAHIP/YONETICI tutarsızlığı kapatıldı); uygun kimse yoksa **SESSİZ PENDING DEĞİL** → request REJECTED + initiator bildirimi (`rejectForNoApprover`). Bu, tek-admin firmada deadlock'u tanımlı davranışa çevirir.
  - *Karar (D neden değil):* config-time "en az bir approver ≠ initiator" guard'ı, akış oluşturulduktan sonra tek-admin kalan (admin ayrılan) durumu yakalayamaz; doğru koşul yalnız runtime'da bellidir → ikame-sonra-reddet runtime'da uygulanır. Kanıt/regresyon: `test/integration/approvals.spec.ts`.

---

## 3. Paket / entitlement

- **INV-ENT-1** — Pakete (`CompanyTier`: `STANDARD` | `PAKET`) veya izne bağlı HER yetenek sunucu tarafında (guard/servis/veri katmanı) zorunlu kılınır; frontend gizlemesi TEK BAŞINA yeterli değildir.
- **INV-ENT-2** — Yeni ilan işi (ilan aç/yayınla/yeni tur/davet) `PAKET` üyelik gerektirir; kontrol `assertPaidForNewListingWork` (`company-listings.service.ts`) veya `CompanyPaidTierGuard` ile yapılır. `STANDARD` üye yalnız mevcut ihalelerine teklif verebilir.
- **INV-ENT-3** — İzin kontrolü `hasCompanyPermission(roles, isOwner, permission, override)` üzerinden yapılır ve kişi-bazlı override'a (`added`/`removed`) saygı gösterir; owner-only izinler (`billing:manage`, `company:delete`, `ownership:transfer`) override kataloğunda yer almaz.
- **INV-TIER-1** — Efektif tier TEK KAYNAKTAN (`effectiveTier`, `common/company/effective-tier.ts`) okunur; ham `Company.tier` doğrudan yetki/gösterim kararında KULLANILMAZ. Üyelik süresi (`membershipEndAt`) geçmişse firma DB'de hâlâ `PAKET` görünse de efektif `STANDARD`'dır (lazy — 03:00 downgrade cron'unu beklemez). `effectiveTier` çağıran her yüzey aynı sonucu verir → web/api ıraksaması olmaz. Kanıt: JWT strategy (`company-jwt.strategy.ts`), `/me` `serializeCompany` (`company-auth.service.ts`), profil `get` (`company-profile.service.ts`), bağlantı-geçerlilik filtresi (`company-listings.service.ts` connectedCompanyIds + `company-supplier-templates.service.ts`) hepsi `effectiveTier` çağırır. Expire cron (`membership.scheduler.ts`) kalıcı downgrade + `membershipEndAt = null` uygular; lazy okuma cron'u beklemez.
  - **Not (ödeme seam):** Self-servis premium yükseltme (`upgradeToPremium`) ödeme entegrasyonuna kadar `PREMIUM_SELF_UPGRADE_ENABLED` (default `false`) ile KAPALIDIR (403); flag `getMe.selfUpgradeEnabled` ile frontend'e tek kaynaktan surulur. Premium bugün YALNIZ admin grant (`AdminCompaniesService.setTier`) ile verilir.
  - **DB-filter tek kaynağı — `effectivePaidWhere()`:** `effectiveTier` yalnız in-memory çalıştığından `where: { tier: "PAKET" }` yazan Prisma sorguları süresi-dolmuş (lazy) PAKET'i de dahil ediyordu (tekrarlayan drift: supplier-templates, CL:5988, CL:427). `effectivePaidWhere()` (`common/company/effective-tier.ts`) "tier PAKET VE (`membershipEndAt` null VEYA `gte now`)" fragment'ini tek yerden üretir (sınır `effectiveTier`'ın `< now → expired` ile birebir; OR sibling-OR ile çakışmasın diye AND'e sarılı). Kanıt: `test/unit/effective-tier.spec.ts` (fragment + sınır nöbetçisi).
  - **Sistematik tarama (2026-07-17) — kapatılan ham-tier siteleri:** kod tabanı `.tier`/`tier:"PAKET"` için tarandı; başka-firma ham tier'ı ile karar veren 8 site efektif'e çevrildi: `notifyCategoryMatchedCompanies` (`company-listings.service.ts:427`, `effectivePaidWhere`), bağlantı-liste aktif-filtresi + tier rozeti (`company-connections.service.ts` `list()`, `effectiveTier` — CL `connectedCompanyIds` ile birebir; eskiden IRAKSIYORDU), keşif + dizin arama where'leri (`discover`/`search`, `effectivePaidWhere`), public profil görünürlük kapısı (`getProfile`), public SEO profil + sitemap (`public-profile.service.ts:49/77`), `upgradeToPremium` idempotency (`company-auth.service.ts:709`). **Doğru şekilde ham kalan (dokunulmadı):** `user.tier` (JWT zaten efektif taşır), admin yüzeyleri (DB gerçeği), `membership.scheduler` (downgrade mekanizmasının kendisi), yazma/seed. Kanıt: `category-match.spec.ts` (F1), `connections.spec.ts` (T2), `public-profile.spec.ts` (T7).
- **INV-KYC-1** — Para-taahhüdü doğuran aksiyonlar firma KYC doğrulaması (`companyVerificationStatus === "VERIFIED"`) ister: teklif SUBMIT (`placeBid`, **taslak HARİÇ**), `award`, `awardByItem`, `publishListing`, **`create(asDraft:false)`** (doğrudan-OPEN yayın = `publishListing` kardeşi; 2026-07-17 BK-A ile kapandı — taslak `create(asDraft:true)` SERBEST). Kontrol `assertVerified` (`company-listings.service.ts`, `assertPaidForNewListingWork` simetriği; `user.companyVerificationStatus` JWT'den her istekte TAZE okunur → doğrulanır doğrulanmaz açılır). Gezinme, keşif, davet kabul, TASLAK kaydetme ve sipariş-akışı SERBEST (funnel kırılmaz). Onay-zinciri finalizasyonu (`onAwardApproved`) gated DEĞİL — initiator zaten `award`/`awardByItem` çağrısında kapıdan geçti (INV-AZ-3 deseni). Kanıt/regresyon: `test/integration/kyc-gate.spec.ts`.
  - **YALNIZ VERIFIED — PENDING YETMEZ:** teklif bağlayıcıdır (INV-SM-2, geri çekilemez); PENDING (6/6 belge yüklü ama admin incelemesi bekliyor) teklifçi kazanıp sonra REJECTED olursa reddedilmiş karşı taraflı **canlı sipariş** kalırdı — bloklamaktan kötü.
  - **KAÇIŞ KAPISI (bugün UYGULANMIYOR — karar geçmişi kaybolmasın):** İleride admin-onay gecikmesi funnel'ı kırarsa `placeBid` PENDING'e açılabilir AMA `award`/`awardByItem` VERIFIED KALMALI — para asıl award'da commit olur (sipariş orada doğar), kazanan orada süzülür. Bugün gerekmiyor (PENDING=0, prod yayın-öncesi); doğru zaman geldiğinde bu ayrımı ekle.

---

## 4. Authz — ilan yönetim & kazandırma aksiyonları

- **INV-AZ-1** — Şu ilan yönetim/kazandırma aksiyonları için izin ANCAK VE ANCAK: **(a)** ilanın tarafına göre `buy:listing:manage` (ALIM) VEYA `sell:listing:manage` (SATIS) izni VAR, VE **(b)** `createdById === user.userId` VEYA `user.isOwner` (SAHİP emniyet supabı). Kapsanan metotlar: `updateListing`, `deleteListing`, `publishListing`, `createNextRound`, `addInvitations`, `eliminate`, `cancel`, `startEvaluation`, `closeNoAward`, `updateInternalNotes`, `changeClosingTime`, **`award`, `awardByItem`**. Kontrol `assertListingManageRole` (`company-listings.service.ts`) veya `ownerOpenListing` ile yapılır; gereken taraf ilanın `type`'ından türetilir (yanlış-taraf yapısal olarak imkânsız).
- **INV-AZ-2** — Firma-sahipliği (`companyId`) kapısı korunur ama TEK BAŞINA yetmez; her yönetim/kazandırma aksiyonu ayrıca INV-AZ-1'i uygular. `award`/`awardByItem` için mevcut atomik status guard (F1 çift-kazandırma) da korunur.
- **INV-AZ-3** — Kazandırma kapısı yalnız aksiyonu BAŞLATAN aktörü kısıtlar; onay-zinciri/sistem-tetikli finalizasyon (`onAwardApproved → runFullAward`/`runItemAward`) bundan etkilenmez.
- **INV-AZ-4** — `extendBidValidity` bir TEKLİFVEREN aksiyonudur, ilan yönetimi DEĞİL; `bid.bidderCompanyId === user.companyId` (birleşik anahtar) ile scope'lanır ve INV-AZ-1 ona UYGULANMAZ.
- **INV-AZ-5** — `ONAYLAYICI` rolü ve `buy:/sell:listing:manage` izni olmayan roller ilan yönetim/kazandırma aksiyonlarından reddedilir.

---

## 5. Erişim kontrolü, veri sızıntısı, kimlik & üyelik

- **INV-ADMIN-1** — Admin realm route'ları GÜVENLİ-VARSAYILANDIR (fail-closed): `AdminRolesGuard` zincirinde, `@RequireAdminRole(...)` VEYA `@AllowAnyAdminRole()` ile AÇIKÇA işaretlenmemiş her admin ucu REDDEDİLİR. JWT taşıyan her admin handler `AdminRolesGuard`'ı da taşımalıdır — aksi halde konan rol işareti sessizce no-op olur.
  - *Kanıt:* `admin-roles.guard.ts` (işaretsiz → Forbidden); wiring `test/unit/admin-route-authz-wiring.spec.ts` — "JWT taşıyan her handler RolesGuard da taşır" invariant testi + sensitif uçların rol işareti.
  - *Geçmiş:* #12 olarak kapatıldı (kök fail-open: admin-auth/health uçları RolesGuard zincirinde DEĞİLDİ → oraya konan `@RequireAdminRole` no-op oluyordu; #4 companies list + #7 dahili notlar asimetrisi de aynı turda kapandı).

- **INV-AUDIT-1 (KISMEN SAĞLANIYOR)** — Ayrıcalıklı/para/yetki geçişleri append-only audit trail'e (`AuditLog`, `audit.service.ts`) yazılır.
  - *Sağlanan (1. dalga — kritik):* kazandırma `company.listing.awarded` (`company-listings.service.ts:3911,4423`); ödeme onay/red `company.order.payment_{confirmed,rejected}` (`company-orders.service.ts:1328`); yetki geçişleri `company.user.{roles_changed,permissions_overridden,active_changed,removed}` (`company-users.service.ts:408/477/595/526/646`); admin eylemleri (`admin.staff.created`, `admin.listing.{closed,extended,reopened}`, `admin.order.cancelled`, `admin.*_invite.revoked`); auth (`signup/login/login_failed/2fa_*/password_changed`). Kritik izler `critical: true` + tx-SONRASI fail-safe yazılır; başlatan ≠ onaylayan ayrımı korunur.
  - *Sağlanan (2. dalga — 2026-07-16, `2ea40d8`):* aynı desen (tx-SONRASI, awaited, fail-safe, `actorType:"company"`, PII yok).
    - **Sipariş yaşam-döngüsü** — `company.order.{accepted,rejected,shipped,received,completed,cancelled}` (`company-orders.service.ts`), `critical:true`, before/after `from`/`to`.
    - **Onay kararları** — `company.approval.{rejected,step_approved,approved}` (`company-approvals.service.ts` decide), `critical:true`. Son adım (`approved`) YALNIZ kazandırma `emitAsync` başarısında yazılır: fail/rollback ederse iz DÜŞMEZ (catch rethrow'dan sonraki satır → o noktaya yalnız başarıda ulaşılır). `AuditService` bu servise enjekte edildi.
    - **İlan durum geçişleri** — `company.listing.{published,evaluation_started,cancelled,closed_no_award,next_round_created}` (`company-listings.service.ts`), `critical:true`.
    - **DENIAL AUDIT (yeni sınıf)** — engellenmiş yetki eylemi iz bırakır (state değişmez, sinyal): `company.listing.manage_denied` (`assertListingManageRole`), `company.user.role_change_denied` (`assertCanModifyAdminTarget`), `company.user.last_admin_denied` (`assertNotLastAdmin` → `LastActiveAdminError` sentinel'i tx-abort SONRASI yakalanır). **Denial izleri `critical:false`** — Sentry'e kritik-kayıp marker'ı GÖNDERMEZ (bir insider sistemi zorlayınca denial seli alarm gürültüsü yaratmasın; yalnız state-değiştiren geçişler `critical:true`).
    - *Sözleşme:* `test/integration/company-audit-trail.spec.ts` (30 test: 11 dalga-1 + 19 dalga-2, rollback→iz-yok dahil).
  - *GAP (3. dalga — henüz izsiz):* `placeBid`; bağlantı accept/reject/disconnect; sipariş revizyon müzakeresi (propose/approve/reject/cancel-revision).

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

- **INV-VIS-1 (görünürlük tek kaynak)** — "Bir izleyici bir firmanın açık ihalesini görür mü?" kuralı TEK KAYNAKTAN gelir: **PUBLIC herkese; CONNECTIONS yalnız AKTİF bağlıya; PRIVATE yalnız o ilana DAVETLİYE** (davet her görünürlüğü aşar). "Bağlı olmak ≠ davetli olmak" — bağlı firma PRIVATE (davet-only) ihaleyi GÖRMEZ. Helper: `common/company/listing-visibility.ts` — `isListingVisibleToViewer` (tekil/boolean, `getOne` 3 çağrı yeri) + `visibleOwnerListingWhere` (tek-firma findMany `where`, `getProfile`). `sellerTenders` çok-firma+ülke bileşik varyantı (aynı çekirdek).
  - *Geçmiş (F-CONN-1, 2026-07-17):* `getProfile` bağlı firmaya `connected ? {}` (görünürlük filtresi YOK) uyguluyordu → PRIVATE ihalelerin varlığı+başlığı bağlı-ama-davetsiz firmaya sızıyordu (getOne 404 verirken). Kardeş-yol tek-helper'a bağlandı. Kanıt: `connections.spec.ts` (F-CONN-1), `visibility-matrix.spec.ts` (getOne).

- **INV-RL-1** — Kimlik/parola/kod-doğrulama endpoint'leri (login, kayıt, e-posta doğrula, kod-yeniden-gönder, parola-sıfırla) sıkı per-route `@Throttle` ile rate-limitlidir; global `ThrottlerGuard` (APP_GUARD) altında hiçbiri gevşek default'a düşmez.
  - *Kanıt:* `app.module.ts:161` global guard; `company-auth.controller.ts` login `:87-88`(10)/signup `:62-63`(5)/verify `:73-74`(10)/resend `:80-81`(3)/forgot `:55-56`(5); `admin-auth.controller.ts` login(10) + hesap-güvenlik mutasyonları change-password/2fa-setup/2fa-enable/2fa-disable her biri `@Throttle({ auth: { limit: 5, ttl: 60_000 } })`; `password-reset.controller.ts:14-15`(5).
  - *Not:* #10 — admin parola/2FA mutasyonları artık sıkı `@Throttle` taşır (eskiden default 100/60s'e düşüyorlardı; kimlik-doğrulanmış olsa da brute-force yüzeyi). Wiring kanıtı: `test/unit/admin-auth-throttle-wiring.spec.ts`.
  - *Kapsam (WS, 2026-07-17, F-WS-1):* `ThrottlerGuard` (APP_GUARD) yalnız HTTP bağlamında çalışır — WS `@SubscribeMessage`'a UYGULANMAZ. Realtime gateway `subscribe`/`unsubscribe` bu yüzden **soket başına kayan-pencere rate-limit** taşır (`realtime.gateway.ts` `rateOk`, 30/10sn); DB sorgusundan ÖNCE uygulanır → `canSubscribe*` amplifikasyonu kesilir (yalnız mesaj reddedilmez). Payload cap `maxHttpBufferSize: 16KB`. Kanıt: `test/integration/realtime-gateway.spec.ts` (F-WS-1: LIMIT+1 sonrası `findUnique` çağrılmaz).

- **INV-SD-1** — `deletedAt` işaretli `CompanyUser` kimlik doğrulayamaz ve iş akışına (üye/alıcı/onaylayıcı/bildirim) giremez; `CompanyUser` sistemdeki TEK soft-delete edilebilen modeldir ve ona dokunan sorgular `deletedAt: null` filtreler.
  - *Kanıt:* `company-jwt.strategy.ts:66`, `company-auth.service.ts:554`, `realtime.gateway.ts:96` (WS handshake `deletedAt`/`isActive` kapısı); `deletedAt` yalnız `CompanyUser`'da (`schema.prisma:1357`); filtreler `membership.scheduler.ts:73`, `notification.service.ts:89-93/143`, `approvals` `:863-877`, `orders` `:72`, `listings` `:109/155/414`, `company-users` `:56/611/726`.
  - *Kapsam düzeltmesi:* Önceki taslaktaki "tüm kayıt yüzeyleri" fazla genişti — Listing/Order/Notification soft-delete taşımaz (`isActive`/`status` kullanır).

- **INV-CRON-1** — Katılımcı bildirimi gönderen zamanlanmış görevler (kapanış hatırlatması, vade/ödeme hatırlatması, değerlendirme-geçerlilik hatırlatması) alıcıları YALNIZ ilgili kaydın taraflarından çözer (ilan: davetli+teklifçi+sahip; sipariş: alıcı/satıcı); fan-out primitifi `pushToCompanies` alıcıyı verilen id kümesine kısıtlar.
  - *Kanıt:* `notifyListingClosed` (`company-listings.service.ts:246-261,302`), `notifyListingInvitees` (`:565-568`), `notifyEvaluationValidityReminder` (`:5288,5302`), `sendDuePaymentReminders`→`notifyOrderParty` (`company-orders.service.ts:955-961,97-105`), `pushToCompanies` (`notification.service.ts:139-149`).
  - *İstisna (meşru, tasarım):* `announceOpened` cron'u (`listing.scheduler.ts:156` → `notifyCategoryMatchedCompanies:345-414`) PUBLIC ilanları kategori-eşleşen PAKET firmalara tenant-ötesi duyurur — keşif yayını, `visibility === "PUBLIC"` kapılı (`:362`), özel/tenant verisi taşımaz.

- **INV-INV-1** — Bağlantı davet accept/reject/disconnect atomik koşullu yazımla yapılır (`updateMany`/`deleteMany` status=PENDING, `count===0`→Conflict); firma-kullanıcı daveti `@unique` token'lıdır, tek kullanımlıktır ve `CompanyUser` hesabı YALNIZ accept transaction'ında oluşturulur (davet anında değil).
  - *Kanıt:* connections accept `:802-822`/reject `:859-865`/disconnect `:876-884`; invitation token `@unique` (`schema.prisma:1396`), atomik consume `company-users.service.ts:247-255`, `requireUsableInvitation:294-300` (ACCEPTED/CANCELLED/EXPIRED + süre reddi), hesap yalnız accept tx'inde `:256-276`.

---

## 6. Depolama (R2 bucket ayrımı)

- **INV-STORAGE-1** — Kalıcı public URL YALNIZ `{env}/tenant-profile/` prefix'li (profil görseli) anahtarlara uygulanabilir; diğer HER anahtar private'tır ve public URL'e ÇEVRİLEMEZ (fail-closed). Somut: `StorageService.getPublicUrl`/`resolveImageUrl`, `classifyKey(key) !== "public"` için daima `null` döner (`storage.service.ts`). Bu, KYC (`company-docs/`), ihale (`listing-docs/`), teklif (`listing-bids/` — kapalı zarf) ve sipariş (`company-orders/`) belgelerinin imzasız ifşasının kalıcı kilididir.
  - *Zorlama (savunma-derinliği):* public erişim R2'da BUCKET seviyesindedir → hassas belgeler PUBLIC bucket'a hiç yazılmaz. Her PUT/GET/delete/checkExists çağrısı açık `BucketKind` alır ve `assertKeyBucket` ile anahtar-sınıfıyla uyumu doğrulanır: KYC anahtarını public bucket'a yazma denemesi runtime'da fırlatır. Tek kaynak `classifyKey` (`storage.service.ts`); allowlist yalnız `{env}/tenant-profile/`.
  - *Kanıt/regresyon:* `test/unit/storage.service.spec.ts` — `getPublicUrl(company-docs/…)` → `null`; her prefix için `classifyKey` doğru bucket; doc anahtarıyla public PUT → throw.
  - *Presigned baypas riski:* presigned URL key'i path'te taşır; bucket public olsaydı query atılınca kalıcı imzasız erişim kalırdı (TTL etkisiz). Ayrım tam da bunu keser. Bkz. `docs/r2-bucket-split.md`.

---

## Karşılanmamış hedefler (henüz sağlanmıyor — kural DEĞİL)

- **INV-MT-5 (HEDEF)** — Postgres RLS bir **güvenlik ağı** olarak henüz yok (servis disiplinini İKAME ETMEZ, yedekler); bugün RLS inert (Prisma tablo-sahibi rolle bağlanıyor). Ön koşullar + aşamalı yol + efor için bölüm 1'e bakınız.
- **INV-AUDIT-1 üçüncü dalga (HEDEF)** — 1. + 2. dalga tamamlandı (sipariş yaşam-döngüsü, onay kararları, ilan durum geçişleri, denial audit izli). KALAN: `placeBid`, bağlantı işlemleri ve sipariş revizyon müzakeresi hâlâ izsiz; ayrıntı için bölüm 5'teki INV-AUDIT-1 "GAP" alt-maddesine bakınız.

---

## Denetlenmemiş alanlar ("temiz" DEĞİL, "bilinmiyor")
- İki büyük servisin (`company-listings` ~5600 st., `company-orders` ~1600 st.) satır-satır okunmamış kısımları
- Admin rol granülaritesinin SEMANTİK denetimi (fail-closed wiring INV-ADMIN-1 ile kanıtlı; hangi rolün hangi veriyi görmesi GEREKTİĞİ iş-kuralı ayrıca denetlenmedi)
- Admin arama `list.q` `contains`-filtresinin ReDoS/injection yüzeyi
- `.env`/deploy konfigürasyonu, git-history, secrets rotasyonu

## Bilinen küçük hijyen kalemleri
- `password-reset.service.ts` / `supabase-auth.service.ts`: log'da PII (e-posta/authId)
- `seed.ts` demo parolası prod seed'inden uzak tutulmalı

---

## Denetim geçmişi (kapatılan bulgular → invariant)

| Invariant | Bulgu | Ne düzeltildi | Commit |
|-----------|-------|---------------|--------|
| INV-SM-1 (kapsam genişledi) | #1/#5/#11 | publishListing/cancel/createNextRound → koşullu-atomik guard | `1061dc0` |
| INV-AUDIT-1 (1. dalga, kısmen) | kritik dalga | award/ödeme/rol-izin-aktif-çıkış audit izi | `c037733` |
| INV-AUDIT-1 (2. dalga) | state geçişleri + denial | sipariş yaşam-döngüsü + onay kararları + ilan geçişleri + denial audit (critical:false) | `2ea40d8` |
| INV-TIER-1 (yeni) | Y2/Y3/Y7/#4 | self-upgrade flag (403, para kaçağı), expire→membershipEndAt null, effectiveTier tek kaynak (/me+JWT+profil+bağlantı filtresi) | `c6251d9`, `fed282b`, `096f088`, `bf90cd7` |
| INV-KYC-1 (yeni) | Y1 | VERIFIED gate: placeBid-submit/award/awardByItem/publishListing (taslak+funnel serbest); assertVerified | `a5da85f`, `50b94ee` |
| INV-APPR-1 (yeni) | Y4/Y5 | onay görev-ayrılığı: self-onay red + initiator-approver ikame; fallback havuzu +ONAYLAYICI ∖{initiator}; uygun yoksa REJECTED (sessiz PENDING yok) | `e5cc1df`, `8bf6719`, `5c99e92` |
| INV-MONEY-1 (yeni) | X1/epsilon | para kapıları Decimal'e taşındı (karar≠gösterim), 0.01 epsilon kaldırıldı (tam-eşit geçer); advanceDueAmount kural/hesap ayrımı | `8095851`, `61d8541` |
| INV-FX-1 (yeni) | X2/X3/X6/FX-storage | tek yetkili kur bazı (auctionTryValue: açılış damgası→teklif damgası) sıralama+ekran+eşik+taban; damga Decimal-string; X3 fail-closed onay-zorunlu (ham fallback yok); X6 tie-break erken submittedAt→id | `592300b`, `7615aa0`, `9efdcbe`, `5502e95` |
| INV-MONEY-1 (taşma tavanı) | input-validation A/B/C | servis toplam-guard MAX_MONEY (çarpım+toplam, DTO @Max erken-eleme); DoS dizi cap'leri; closesAt now+2yıl tavanı | `e1047bf` |
| INV-ADMIN-1 (yeni) | #12 (+#4/#7) | admin authz fail-open → fail-closed + guard-chain tuzağı | `1592f51`, `9e48902` |
| INV-TIER-1 (tek-kaynak tarama) | F1 + T2-T8 + auth:709 | ham `Company.tier` → efektif: `effectivePaidWhere` helper (DB-filter) + `effectiveTier` (in-memory); kategori-duyuru/bağlantı-liste/keşif/dizin/public-profil/sitemap/upgrade | `c2e78f5`, `4a551fd`, `d0722b6` |
| INV-SM-1 (kapsam: eliminate + changeClosingTime) | B1 + F2 kör-nokta | eleme↔award koşullu-atomik (3 site) + changeClosingTime updateMany+count | `504dc9b`, `74d671d` |
| INV-MT-3 + INV-SD-1 (WS) | WS iptal-bypass | realtime handshake taze-DB kapısı + süresiz-soket exp-timer | `5ff3524` |
| INV-DOC-1, INV-RL-1 + hijyen | #6/#8/#9/#10/#13 | env-bypass allowlist (ALLOW_INSECURE_WEBHOOK dahil), admin throttle, ölü guard silme, 6-presign doc, admin-demote guard | `bc22b7b` |
