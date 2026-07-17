# İş Kuralları Envanteri

Koddan çıkarılan iş mantığı — **denetim değil envanter**. Yorumlara değil ifadelere
dayanır. Format: `kural — konum | DURUM`. DURUM:

- ✅ **kapandı** — düzeltildi (commit/INV referansıyla)
- 🟡 **bilinçli** — tasarım kararı, "eksik" değil (dokunulmaz)
- 🔴 **açık** — düzeltilmemiş şüpheli / yapılacak

İlgili değişmezler (invariant) `docs/invariants.md`'de INV-* olarak; bu dosya
kuralların koddaki YERİNİ ve GEÇMİŞİNİ tutar. Satır numaraları zamanla kayar —
sembol adları (fonksiyon/DTO) daha kalıcı referanstır.

> Tarihçe: bu envanter 7 domain'de çıkarıldı (2026-07-16). Grup 1/A/B/C/2/3/4
> düzeltmeleri işaretlendi. Kalan açık kalemler en altta toplu listelenir.

---

## 1. İhale / Teklif / Kazandırma

- **Kapalı zarf:** tedarikçiler birbirinin teklifini ASLA görmez; sahip her zaman
  görür. `/supplier|company` tekil yanıtı `invitations`/`bids`/`bidStats` içermez —
  yalnız `myInvitation`+`myBid`. `computeAuctionView` kimlik gizler (ALL modunda bile) | 🟡 tasarım
- **Monotonluk AYNI KALEMLER bazında** (kısmi teklif kapsam genişletebilir; fiyatlı
  kalem bırakılamaz; "en iyi" yalnız tam-kapsamlılar) — `placeBid`, `rankAuctionBids` | 🟡 tasarım (BAFO)
- **Tie-break:** eşit TRY-değerinde en erken `submittedAt`, sonra `id` (deterministik) —
  `rankAuctionBids` | ✅ **INV-FX-1 (X6)**, `5502e95`
- **Kapanış sınırı DAHİL kapalı** (`>=`/`lte`): tam `closesAt` anı reddedilir —
  `placeBid`/`buyNow`/cron | ✅ **A5/A6**, `b92bbf6`
- **CLOSED ara durumu yok:** kapanan ihale doğrudan IN_AWARD; CLOSED yalnız admin
  moderasyon kapatması — cron/"Değerlendirmeye Al" | 🟡 tasarım
- **Açılış embargosu:** `bidsOpenAt` gelecekteyse yalnız sahip görür; İSTİSNA teklifli
  firma (geçerlilik uzatma) görür | 🟡 tasarım
- **A7 — ALIM'da taban/rezerv fiyat YOK:** ters eksiltmede alıcı zaten en düşük fiyatı
  ister; taban koruması yalnız SATIS (satıcı) tarafının ihtiyacı — `buildPaymentPlan`/floor
  yalnız `listing.type === "SATIS"` | 🟡 **bilinçli** (Grup 4'te teyit; bug değil)
- **priceDecrement\* (Type/Value/Basis) DEAD:** hiçbir kuralda enforce edilmiyor,
  frontend göstermiyor (BAFO/minimum-pay kaldırma kalıntısı). Ölü `placeBid` select
  kaldırıldı; kolonlar `schema.prisma`'da DEAD işaretli, batched drop migration'a
  bırakıldı (Supplier.sectors ile) | ✅ **işaretlendi** `a0a6591` · 🔴 kolon-drop açık

## 2. Para / Kur / Yuvarlama

- **Karar sınırı Decimal, epsilon yok:** para karşılaştırma/kapı `Prisma.Decimal`;
  tolerans/epsilon kullanılmaz (tam eşit geçer, 1 kuruş yakalanır). Gösterim sınırı
  `.toFixed(2)`/`.toString()` (API şekli değişmez) | ✅ **INV-MONEY-1**, `8095851`
- **TEK yetkili kur bazı:** `auctionTryValue` (açılış damgası → teklif damgası → null);
  sıralama+ekran+onay eşiği+taban aynı kaynak. Damga Decimal-string saklanır | ✅ **INV-FX-1 (X2)**, `592300b`/`7615aa0`/`9efdcbe`
- **X3 fail-closed:** kur bilinmiyorsa onay eşiği ATLANMAZ (`forceRequireApproval`);
  ham-tutar fallback kaldırıldı. `getCurrentRate`/`getRateOnDate` sessiz bayat-fallback
  döndüğünden para kararında kullanılmaz (yalnız `getFreshRate` strict) | ✅ **INV-FX-1 (X3)**
- **Yuvarlama:** para hesabı `Decimal … ROUND_HALF_UP` (Decimal(18,2)); kural
  (`advancePercentFor`) shared'da, hesap API'de | ✅ INV-MONEY-1

## 3. Sipariş / Ödeme

- **Ödeme kategorileri** (ADVANCE/DEFERRED/OPEN_ACCOUNT/CHEQUE/SENET/LC/CASH_AGAINST_DOCS/CUSTOM)
  ve zamanlama (BEFORE/AFTER_DELIVERY) plandan türetilir (`derivePaymentTiming`) | 🟡 tasarım
- **advancePercent ZORUNLU (ADVANCE):** eski sessiz `?? 100` yazma varsayımı kalktı;
  `create-listing.dto` `@ValidateIf(ADVANCE)` + `buildPaymentPlan` throw. Runtime
  `advancePercentFor` `?? 100` backstop KORUNDU (fail-closed — stray/legacy null en
  katı kapıya düşer; kaldırmak `advanceDueDecimal` null→Decimal(0) fail-open'ı açardı) | ✅ **Grup 4**, `172dbff`
- **Kısmi peşin (advancePercent<100) YALNIZ yurtiçi:** `buildPaymentPlan` (create+edit)
  `advancePercent < 100 && isInternational` → throw. "Yurtiçi" = `!isInternational` | ✅ **zaten enforce** (Grup 4 premise düzeltmesi: "serviste uygulanmıyor" tespiti yanlıştı)
- **CASH_AGAINST_DOCS ship-gate YOK (doğru):** vesaik mukabilinde satıcı önce gönderir,
  belgeleri bankaya verir. EKSİK olan kapatıldı: alıcı ÖDEMEDEN TESLİM ALAMAZ —
  `receive()` CAD'de `isFullyPaid` şartı; değilse reddeder | ✅ **C1 / Grup 4**, `a40b39f`
- **Teslim şekli merdiveni** (yurtiçi 4'lü: DELIVERED/PICKUP/CARRIER_COLLECT/ON_VEHICLE;
  uluslararası Incoterm) — kapsamla uyumlu olmalı (`buildPaymentPlan`/deliveryTerm guard) | 🟡 tasarım
- **Teminat mektubu (`requireGuaranteeLetter`) OPSİYONEL bayrak:** sahip seçer;
  BEFORE_DELIVERY'de sistem önerir; award'da siparişe snapshot | 🟡 tasarım
- **Banka hesabı accept'te zorunlu;** complete() tam-ödeme-onayı şart | 🟡 tasarım
- **Ödeme-red gerekçesi min 10 karakter** (iptal gerekçesiyle simetri) —
  `RejectPaymentReasonDto @MinLength(10)` | ✅ **Grup 4**, `d3bb0c1`
- **Parasal taşma koruması (Decimal(18,2) ~1e16):** `qty × unitPrice` çarpımı VE
  satır toplamlarının GENEL TOPLAMI `MAX_MONEY`(1e15)'i aşarsa **400** (Postgres 500
  yerine). ASIL koruma SERVİS katmanında (`amount.gt(MAX_MONEY)`): teklif
  (`company-listings.service.ts:3211`), buyNow (`:3745`), revizyon
  (`company-orders.service.ts:662`). DTO `@Max` (unitPrice/amount/price alanları)
  yalnız erken eleme — **per-alan tavan çarpımların TOPLAMINI ifade edemez**.
  Award/order transitif kapalı (`awardedQty ≤ fullQty` → bid guard'ı kapsar) | ✅ `e1047bf`
- **CASH → accept guard, atomik geçişler, due-reminder cron** | 🟡 tasarım (INV-SM-*)

## 4. Miktar / Birim

- **quantity `Decimal(18,3)`, `@Min(0.001)` `@Max(1_000_000_000)`** (Decimal taşma
  koruması) — `create-listing.dto` ListingItemDto | ✅ **Grup 4**, `d3bb0c1`
- **unitPrice/amount/price** — DTO `@Max(MAX_MONEY=1e15)` + servis toplam-guard'ı
  (bkz. §3 parasal taşma) | ✅ `e1047bf`
- **closesAt üst sınır** `now + 2 yıl` (`MAX_LISTING_HORIZON_MS`) — yoksa `closesAt=9999`
  auto-close cron'unu hiç tetiklemez; create/next-round/changeClosingTime | ✅ `e1047bf`
- **Sınırsız dizi DoS** — `subCategoryIds` çift-sınırsızdı → `@ArrayMaxSize`+`@MaxLength`;
  permission/rol dizileri `@ArrayMaxSize` | ✅ `e1047bf`

## 5. Onay Akışları

- **Görev ayrılığı:** başlatan ≠ onaylayıcı; `decide()` self-onay reddeder;
  `requestApproval` initiator-approver'ı anında ikame, uygun yoksa award reddedilir;
  fallback havuzu +ONAYLAYICI ∖{initiator}, uygun yoksa REJECTED (sessiz PENDING yok) | ✅ **INV-APPR-1**, `e5cc1df`
- **Eşik Decimal** (`amountDec.lt(minDec)`); kur bilinmiyorsa `forceRequireApproval`
  (hiçbir adım SKIPPED değil) | ✅ INV-MONEY-1 + INV-FX-1
- **Tek açık istek/ilan/tip** (mükerrer kazandırma yarışı engeli) — kısmi unique index
  `(listingId,type) WHERE PENDING`; findFirst ön-kontrol + create P2002→Conflict | ✅ **X-CF-3** `46d9b74`
- **SAHIP muaf DEĞİL:** `findMatchingFlow` SAHIP'i operasyonel rolle (ALIM→SATIN_ALMACI,
  SATIS→SATISCI) genişletir → rol-kapsamlı akış SAHIP'e de uygulanır (eski: hiçbir
  initiatorRoles'e girmediğinden onaysız kazandırma). Deadlock yok (Grup C ikame/reddet) | ✅ **BK-1** `0645dfd`

## 6. Kayıt / KYC / Onboarding

- **VERIFIED gate:** para-taahhüdü aksiyonları (placeBid SUBMIT [taslak hariç], award,
  awardByItem, publishListing) firma KYC ister; `assertVerified`; JWT'den taze okunur.
  Gezinme/keşif/davet/taslak/sipariş-akışı serbest | ✅ **INV-KYC-1**, `a5da85f`
- **Buyer self-register YOK:** yalnız admin daveti + manuel onay. Tedarikçi self-register
  VAR (admin onayı); kayıtlı tedarikçinin yeni davet kabulü → direkt ACTIVE | 🟡 tasarım
- **Yarım-kayıt reaper YOK:** e-posta doğrulanmamış Company+CompanyUser+Supabase satırları
  temizlenmiyor (Y6) | 🔴 **açık**

## 7. Premium / Membership

- **effectiveTier tek kaynak:** `effectiveTier(tier, membershipEndAt)` → JWT +
  serializeCompany(/me) + profil + bağlantı filtresi; ham `Company.tier` yetki/gösterimde
  kullanılmaz | ✅ **INV-TIER-1**, `c6251d9`
- **Self-upgrade feature flag'li** (`PREMIUM_SELF_UPGRADE_ENABLED`, default false→403;
  ödeme gelince açılır); admin grant dokunulmadı (Y2 para kaçağı) | ✅ INV-TIER-1
- **Expire → `membershipEndAt = null`** (Y3) | ✅ INV-TIER-1
- **STANDARD maskeli PUBLIC + premium yönlendirme** (2 katman: rol+tier) | 🟡 tasarım

---

## Açık kalemler (kural değil — yapılacak/şüpheli)

| # | Kalem | Konum | Not |
|---|-------|-------|-----|
| 🔴 | **Y6 yarım-kayıt reaper** | kayıt akışı | doğrulanmamış Company/CompanyUser/Supabase temizliği yok |
| ✅ | ~~unitPrice `@Max` / qty×price taşma~~ | — | KAPANDI `e1047bf`: servis toplam-guard'ı (MAX_MONEY) + DTO @Max (bkz. §3) |
| 🔴 | **priceDecrement\* kolon-drop** | schema.prisma | DEAD işaretli; Supplier.sectors ile batched drop migration'a bırakıldı |
| 🔴 | **vade `setDate()` server-local tz** | ödeme vade hesabı | timezone-farkında olmalı (küçük) |
| 🔴 | **`Supplier.sectors` deprecated kolon** | schema.prisma | migration ile kaldırılmalı |

> **NOT (bilinçli, açık DEĞİL):** `advancePercentFor` runtime `?? 100` backstop KORUNDU —
> yazma kapısı sıkı (ADVANCE'ta zorunlu), backstop yalnız stray/legacy null için
> fail-closed savunma; kaldırmak fail-open olurdu (bkz. §3).

---

## Cross-field denetimi (2026-07-17) — kapanan + yapısal drift-riskleri

Ayrıntılı bulgular: `docs/audit-findings-crossfield.md`. Kapanan canlı ıraksamalar:

| # | Kural | Durum |
|---|-------|-------|
| ✅ | **X-CF-1** kalem-award eşiği teklif kur DAMGASINI kullanır (`itemAwardTotal` artık `buildItemGroups` `exchangeRateSnapshot`'ını taşır, `null` hardcode DEĞİL — full-award ile birebir) | `a7cb413` |
| ✅ | **X-CF-2** açık eksiltme kur damgası `getFreshRate` (taze TCMB yoksa publish 400, ilan DRAFT kalır — fail-OPEN'a düşmez; gate publishListing'de SENKRON) | `886ddfb` |
| ✅ | **BK-2** revizyon `unitPrice @Min(0.01)` (0-fiyatlı sipariş sıfır-ödemeyle COMPLETED olamaz) | `3ff0e75` |

**Yapısal tek-kaynak drift-riskleri (S1-S8)** — bugün İHLAL YOK, ama aynı büyüklüğü 2+
yerde hesaplayan hatlar; regresyon nöbetçisi olarak izlenmeli (sonraki tur denetimi):

| # | Büyüklük | Not / nöbetçi |
|---|----------|---------------|
| 🟡 | **S5** order-total türetme | runFullAward `=bid.amount` vs runItemAward `=Σ yeniden hesap`; eşit ÇÜNKÜ placeBid bid.amount'u listing-qty ile hesaplar (teklif DTO'sunda `quantity` YOK) + `updateListing` bidCount kilidi status-FİLTRESİZ. **Nöbetçi:** kilit status-filtreli count'a çevrilirse S5 sessiz para-ıraksamasına döner |
| 🟡 | **S8** order kalem precision | `buildItemGroups Number(unitPrice)` vs runFullAward ham Decimal; MAX_MONEY-ölçek fiyatta fidelity farkı (edge) |
| 🟢 | **S1-S4, S6-S7** | tutarlı (fiyatlı-kalem tanımı, comparable teklif, confirmedPaymentSum karar-yolu tek-kaynak/display re-derive, committed cap, closesAt `>=`/`lte` sınırı, bid-validity formülü) — tek-kaynak korundu |

**Kör noktalar (bu turda OKUNMADI → sonraki tur):** CL `create` 961-1175 (create-anı
`minPrice`/`buyNowUnitPrice` doğrulaması placeBid floor-check'iyle tutarlı mı?);
`resolveBidDeliveryAddress`/`orderDeliverySnapshot` 2716-2824 (teslimat snapshot bid→order);
`eliminate`/`cancel`/`startEvaluation`/`closeNoAward` yaşam-döngüsü geçişleri (eleme
in-flight award ile yarışır mı — runFullAward status re-check muhtemelen güvenli, eleme
tarafı denetlenmedi).

## CL kör-nokta denetimi (2026-07-17) — kör bölgeler okundu

Yukarıdaki kör noktalar tarandı. Kapananlar:

| # | Kural | Durum |
|---|-------|-------|
| ✅ | **B1** eleme↔kazandırma yarışı koşullu-atomik (eliminate + runFullAward:4082 + runItemAward winner count guard; kazanan LOST'a ezilmez / elenmiş bid'e sipariş yazılmaz) | `504dc9b` |
| ✅ | **B2** adres silme guard'ı SUBMITTED teklifleri de kilitler (silinen adres → bid adressiz → order adressiz kök nedeni) | `e87d39f` |
| ✅ | **BK-A** `create(asDraft:false)` VERIFIED kapısına tabi (publishListing kardeş-yol KYC asimetrisi) | `a027c92` |
| ✅ | **BK-B** maskeli PUBLIC teaser'da `paymentNote` gizli (serbest-metin sızıntısı) | `0748e4e` |

**KONTROL VAR / temiz (bu turda doğrulandı):** create-anı SATIS pricing (min/buyNow/
minUnitPrice/buyNowUnitPrice) `validateSatisPricing` (buyNow>min) ile placeBid floor-check
tüketimiyle tutarlı; ALIM'da priceScope=null → per-item min/buyNow kasıtlı düşürülür.
`cancel`/`startEvaluation`/`closeNoAward` zaten atomik (updateMany+count). `detail`
kapalı-zarf: bids/invitations/bidStats içermez, maskeli yol fiyat/PII/auctionView null'lar.
`orderDeliverySnapshot` award SONRASI order'ı sabitler (kusur yalnız bid↔award arası = B2).

**Kalan kör noktalar (sonraki tur):**
- 🔴 **`void this.notifyListingInvitees(...)` (CL:561) `.catch` YOK** — kardeşi (CL:563
  `notifyCategoryMatchedCompanies`) `.catch`'li. Bildirim reddi (DB flake vb.) UNHANDLED
  rejection → prod'da Node süreç çökmesi riski. Somut bulgu (bildirim-helper kör bölgesi).
- 🟡 **`changeClosingTime` (CL:5827)** koşulsuz `listing.update` — state-geçişi değil,
  düşük risk ama kardeşleriyle (updateMany) asimetrik.
- Bildirim-helper gövdeleri (CL:89-512 + 5109-5172), `sellerTenders` 1750-1989, `serialize`
  6235+ tam okunmadı (owner-scoped/sızıntı yüzeyi düşük görünüyor).
