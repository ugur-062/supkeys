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

## 1. Satın Alma Talebi / Teklif / Kazandırma

- **Kapalı zarf:** tedarikçiler birbirinin teklifini ASLA görmez; sahip her zaman
  görür. `/supplier|company` tekil yanıtı `invitations`/`bids`/`bidStats` içermez —
  yalnız `myInvitation`+`myBid`. `computeAuctionView` kimlik gizler (ALL modunda bile) | 🟡 tasarım
- **Monotonluk AYNI KALEMLER bazında** (kısmi teklif kapsam genişletebilir; fiyatlı
  kalem bırakılamaz; "en iyi" yalnız tam-kapsamlılar) — `placeBid`, `rankAuctionBids` | 🟡 tasarım (BAFO)
- **Tie-break:** eşit TRY-değerinde en erken `submittedAt`, sonra `id` (deterministik) —
  `rankAuctionBids` | ✅ **INV-FX-1 (X6)**, `5502e95`
- **Kapanış sınırı DAHİL kapalı** (`>=`/`lte`): tam `closesAt` anı reddedilir —
  `placeBid`/`buyNow`/cron | ✅ **A5/A6**, `b92bbf6`
- **CLOSED ara durumu yok:** kapanan satın alma talebi doğrudan IN_AWARD; CLOSED yalnız admin
  moderasyon kapatması — cron/"Değerlendirmeye Al" | 🟡 tasarım
- **Açılış embargosu:** `bidsOpenAt` gelecekteyse yalnız sahip görür; İSTİSNA teklifli
  firma (geçerlilik uzatma) görür | 🟡 tasarım
- **A7 — ALIM'da taban/rezerv fiyat YOK:** ters eksiltmede alıcı zaten en düşük fiyatı
  ister; taban koruması yalnız SATIS (satıcı) tarafının ihtiyacı — `buildPaymentPlan`/floor
  yalnız `listing.type === "SATIS"` | ⚫ **KALKTI** — satış ilanı 2026-09-04'te kaldırıldı
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

- **Ödeme kategorileri** (ADVANCE/DEFERRED/OPEN_ACCOUNT/**MAL_MUKABILI**/CHEQUE/SENET/LC/CASH_AGAINST_DOCS/CUSTOM)
  ve zamanlama (BEFORE/AFTER_DELIVERY) plandan türetilir (`derivePaymentTiming`) | 🟡 tasarım
- **Fiyat konvansiyonu — tüm fiyatlar KDV HARİÇ (Fix 6):** platform fatura KESMEZ →
  KDV oranı/hesabı/tevkifat GEREKMEZ; KDV'yi taraflar kendi faturalarında uygular.
  Amaç yalnız **karşılaştırma bazı netliği** — tedarikçiler farklı KDV varsayarsa
  teklifler sessizce kıyaslanamaz hâle gelir (yanlış kazandırma). `KDV_HARIC_NOTE`
  satın alma talebi wizard'ı (Ödeme Şekli), teklif verme (Teklif Tutarı), teklif karşılaştırma
  ve sipariş ödeme kartında gösterilir. Kod-mantığı yok, yalnız metin | ✅ **Fix 6**
- **Teslim-sonrası (AFTER_DELIVERY) 3 kategorinin ayrımı — vade günü davranışı:**
  | Kategori | `paymentDays` | Vade takibi (cron) | Anlam |
  |---|---|---|---|
  | **Mal Mukabili** (`MAL_MUKABILI`) | **opsiyonel** (boş = teslimde muaccel) | evet (girilirse) | malı teslim alınca öde — dış ticaret usulü (ithalatta peşinle yarışan yöntem) |
  | Vadeli (`DEFERRED`) | **zorunlu** | evet | sabit vadeli kredili satış |
  | Açık Hesap (`OPEN_ACCOUNT`) | yok | hayır | vadesiz, güven ilişkisi / periyodik mutabakat |
  Mal mukabili ≠ **vesaik mukabili** (`CASH_AGAINST_DOCS`): vesaik = belge karşılığı,
  teslim **ÖNCESİ** (BEFORE_DELIVERY, `receive()` tam-ödeme kapısı). Mal mukabili =
  mal karşılığı, teslim **SONRASI**. `MAL_MUKABILI` `DUE_DATE_CATEGORIES`'te →
  `paymentDueDate = deliveredAt + paymentDays` (gün yoksa null, hatırlatma sessiz) | ✅ `2c12e489`
- **Kısmi peşin (advancePercent<100) kalan bakiyeye vade — ZATEN VAR:** wizard
  "Kalan İçin Vade (gün)" alanı **opsiyonel** (boş = kalan teslimde/açık); `ADVANCE`
  `DUE_DATE_CATEGORIES`'te → `paymentDueDate` hesaplanır, sipariş kartında gösterilir,
  cron alıcıya vade hatırlatması gönderir. Opsiyonel bırakıldı (bilinçli: "%X peşin +
  kalan teslimde nakit" senaryosu ifade edilebilsin) | ✅ mevcut
- **Sipariş ↔ ödeme yaşam döngüsü AYRIMI:** sipariş durumu (operasyonel: mal geldi/kabul
  edildi mi) ile ödeme (finansal: borç kapandı mı) farklı şeyler. Eskiden vadeli sipariş,
  alıcı borcu TAM kapatana kadar DELIVERED'da kalıyordu (90 gün vadeli iş bitmiş ama sistem
  "tamamlanmadı" gösteriyor → KPI/raporlama bozuk). Artık **`complete()` = alıcının malı
  KABULÜ, ödemeden bağımsız**; ödeme→durum oto-tamamlama kaplini kaldırıldı (`receive` hep
  DELIVERED; ödeme onayı durumu değiştirmez). **COMPLETED = operasyonel bitiş**, borç ayrı
  izlenir (`paymentSettled` türetilir — yeni alan yok). Vade cron DELIVERED+COMPLETED izler
  (DISPUTED hariç). KPI "Ödeme Bekleyen" = `paymentSettled=false` (status değil). İSTİSNA:
  vesaik mukabili teslim kapısı (`receive` tam-ödeme şartı) korunur — o teslim kapısı,
  tamamlama değil | ✅ **yaşam-döngüsü**
- **Muayene/kabul + ayıp ihbarı (TTK 23):** tacirler arası satışta alıcı teslim alınca
  malı inceleyip ayıbı süresinde ihbar etmezse **seçimlik haklarını kaybeder** (dönme/
  bedel indirimi/onarım/değişim/tazminat). Sistemde muayene/ayıp yolu yoktu ("Teslim
  Aldım" tek tıkla kabul). Eklendi: alıcı **teslimden 8 gün** içinde **Ayıp İhbarı**
  açar (gerekçe min 10) → DISPUTED. Tek pencere (2/8 açık/gizli ayrımı hukuki
  nitelendirme, buton değil); DELIVERED **ve** COMPLETED'da açık (TTK ödemeye bakmaz →
  COMPLETED non-terminal). 8 gün dolunca buton kapanır — **otomatik kabul/damga YOK**
  (hak-kaybı yasal sonuç, platform damgası değil). Çıkış: alıcı ihbarı geri çeker →
  önceki durum; satıcının on-platform aksiyonu yok (çözüm taraflar arasında). Platform
  icra etmez/hakem değildir — ihbarı KAYDEDER (audit = delil). A1 (satıcı iptal talebi)
  DISPUTED'ından `defectNotifiedAt` ile ayrılır; A1 çıkışları (sevk/iptal-onay) ayıp-
  DISPUTED'ta kapalı | ✅ **TTK-23**, `a28d4871`
- **Satıcı iptal talebi + DISPUTED (A1):** satıcının ACCEPTED sonrası çıkışı yoktu
  (mal bulunamıyor → sipariş sonsuza dek "Onaylandı"da yalan söylüyordu). Satıcı yalnız
  **ACCEPTED**'te iptal TALEP eder (gerekçe min 10); alıcı **onaylar → CANCELLED** ya da
  **reddeder → DISPUTED** (ACCEPTED'a dönmez). DISPUTED = dürüst etiket: saat durur
  (vade cron/revizyon pasif), iki-yönlü çıkış açık (satıcı sevk / alıcı onay) — bu
  yüzden **ödeme kaydı ve LC açıldı/kabul adımları A1-DISPUTED'ta AÇIK kalır**
  (sevkin ön koşulu); ayıp-DISPUTED'ta kapalı. Otomatik onay YOK. CONFIRMED ödemede alıcı onayı ENGELLENMEZ ama iade uyarısı
  gösterilir (platform para tutmaz — iade taraflar arası). Alıcının KENDİ `/cancel`'ı
  CONFIRMED'de engelli kalır (CO cancel guard, değişmez). Ayrı tablo yok — kanıt izi
  `audit_logs` (platform hakem değil, KAYDEDER) | ✅ **A1**, `752ad978`
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

- **VERIFIED gate:** para-taahhüdü aksiyonları (placeBid SUBMIT [taslak hariç], buyNow,
  extendBidValidity "revive" [DRAFT→SUBMITTED], award, awardByItem, publishListing) firma
  KYC ister; `assertVerified`; JWT'den taze okunur.
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

**Yapısal tek-kaynak drift-riskleri (S1-S8) — ✅ HEPSİ TEK-KAYNAĞA İNDİRİLDİ**
(2026-07-19, 8 ayrı commit). Her büyüklük saf helper'a çıkarıldı (`common/company/`),
tekrarlı hatlar helper'ı çağırır; üçüncü tanım yaratılmadı. Her biri kendi testiyle:

| # | Büyüklük | Helper (common/company) | Commit |
|---|----------|--------------------------|--------|
| ✅ S1 | fiyatlı kalem `unitPrice>0` | `bid-items.PRICED_ITEM_WHERE` (4 site) | `2ca8a821` |
| ✅ S2 | tam-kapsam kıyas filtresi | `bid-items.bidCoversAllItems` (owner+public; rankAuctionBids impure→serviste) | `35f8c99b` |
| ✅ S3 | CONFIRMED gösterim toplamı | `order-payments.sumPaymentsByStatus` (getOne; karar-yolu `confirmedPaymentSum` agg query AYRI) | `f34c0f24` |
| ✅ S4 | committed (AWAITING+CONFIRMED) | aynı `sumPaymentsByStatus` (recordPayment cap + getOne remaining) | `450b0fbd` |
| ✅ S5 | order-total magnitude | `bid-items.lineTotal`/`sumLineTotals` (placeBid+buildItemGroups) **+ runFullAward FAIL-CLOSED nöbetçi** (bid.amount≡Σ değilse tx öncesi 400) | `736e3248` |
| ✅ S6 | closesAt-dahil sınır | `listing-timing.isListingClosedAt` (placeBid+buyNow; cron `lte` Prisma aynası yorumla senkron) | `e17b8ebd` |
| ✅ S7 | bid-validity expiry | `listing-timing.bidValidUntilMs` (createNextRound+extendBidValidity) | `cd937cc8` |
| ✅ S8 | order kalem precision | `buildItemGroups` ham Decimal (runFullAward ile hizalı; `Number()` kalktı) | `1777447e` |

Not: S5 nöbetçisi doc'un istediği "kilit statü-filtreli olursa sessiz ıraksama" senaryosunu
makineyle yakalar (invariant kırılırsa award fail-closed, yanlış tutarlı sipariş yazılmaz).

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
- ✅ **Fire-and-forget `void this.notifyX(...)` sweep** (kapandı) — tüm 32 `void this.*`
  çağrısı tarandı. Korumasız (iç try/catch YOK + çağrı-yeri `.catch` YOK) yalnız İKİSİ:
  `notifyListingInvitees` (CL:561 + listing.scheduler:145) ve `notifyCompany`'nin `findUnique`
  bacağı (admin, 8 çağrı yeri). Düzeltildi: notifyListingInvitees çağrı-yerlerine `.catch`
  (CL konvansiyonu), notifyCompany'ye iç try/catch (kardeş notify helper'larıyla simetri).
  `audit.log` (11×, iç fail-safe), notifyApprover/notifyRequester/emailCompany/emailNewMessage/
  bootSeed zaten iç try/catch'li → dokunulmadı. Kanıt: `notify-fire-and-forget.spec.ts`.
- 🟡 **`changeClosingTime` (CL:5827)** koşulsuz `listing.update` — state-geçişi değil,
  düşük risk ama kardeşleriyle (updateMany) asimetrik.
- Bildirim-helper gövdeleri (CL:89-512 + 5109-5172), `sellerTenders` 1750-1989, `serialize`
  6235+ tam okunmadı (owner-scoped/sızıntı yüzeyi düşük görünüyor).

## Bağlantı/davet/görünürlük denetimi (2026-07-17)

Domain uçtan uca denetlendi (davet ID/e-posta/toplu/referral → kabul/red → ACTIVE →
görünürlük → blok → disconnect). Kapananlar:

| # | Kural | Durum |
|---|-------|-------|
| ✅ | **F-CONN-1** getProfile PRIVATE satın alma talebi sızıntısı → tek-kaynak görünürlük helper (`listing-visibility.ts`); bağlı-davetsiz firma PRIVATE görmez (getOne birebir) | `f31439e` |
| ✅ | **BK-CONN-1** referral signup yalnız KULLANILAN token'ı ACTIVE bağlar; diğerleri PENDING istek (rıza tek davet için) | `95c786c` |
| ✅ | **DOC-CONN-1** connectedCompanyIds bayat/öksüz doc-comment silindi (gerçek: inviter-only effectiveTier) | `370dd18` |

**KONTROL VAR (temiz — bu turda doğrulandı):** blok ÇİFT YÖNLÜ (`blockedCompanyIds` = ben-engelledim VEYA beni-engelledi; `block()` bağlantıyı iki yönde atomik siler); accept/reject/disconnect ATOMİK (count guard, INV-INV-1); disconnect simetrik; davet kapıları simetrik (invite ID/e-posta/batch → aynı `createRequest` + tier gate); mükerrer/self/ters-yön engeli; discover/search tier-gated + block-excluded + company-card-only (ilan sızıntısı yok); e-posta davet throttle'lı (10/dk tekil, 3/dk batch × 50).

**Açık kalem:**
- 🟡 **BK-CONN-2 referral e-posta hacim sınırı** — batch 50-cap + rate-limit (3/dk) VAR ama **toplam/günlük bekleyen referral cap YOK** → PAKET firma sürekli çağırıp keyfi adreslere referral e-postası püskürtebilir (throttle burst'ü sınırlar, toplam hacmi değil). Launch sonrası e-posta kötüye-kullanım turunda **per-email cooldown + bounce bildirimi + günlük referral cap** ile birlikte ele alınacak.

## Frontend iş mantığı denetimi (2026-07-17)

apps/web + apps/admin hesaplama/gösterim/durum/validation mantığı backend sınırıyla
denetlendi (A2 sınıfı: ekran ham float sıralarken backend Decimal+TRY-normalize).
**A2 tekrarı YOK** — karar-yollarında TRY-normalize öğrenilmiş (getOne owner-detay
rankAuctionBids; my-bids amountTry). Kapananlar:

| # | Kural | Durum |
|---|-------|-------|
| ✅ | **F1** sipariş tam-ödeme/peşin epsilon kaldırıldı (INV-MONEY-1 frontend); backend `remaining ≤ 0` okur, `orderFullyPaid`/`isAdvanceMet` helper | `2f4b83f` |
| ✅ | **F5** admin onaylı-ödeme toplamı backend Decimal `paymentConfirmed`'den (float re-sum kaldırıldı, X7 kardeşi) | `01af040` |
| ✅ | **F2/F3/F4** frontend validation backend DTO ile hizalandı; sabitler `@rothern/shared`'a taşındı (tek kaynak, yeni dep YOK); `closesAtError`/`moneyInputError`/`maxDecimals` helper | `3dbed3e` |
| ✅ | **F7** kazandır/ele butonu izin-kapısı (`canManageListing`, assertListingManageRole birebir); backend getOne'a createdById | `16633fb` |

**KONTROL VAR (temiz — doğrulandı):** effectiveTier istemcide İHLAL EDİLEMEZ
(`membershipEndAt` frontend'e hiç gelmez, yalnız backend efektif tier tüketilir);
INV-BID-1 kapalı-zarf korunuyor (rakip teklif verisi `isOwner` ayrı dalında, auction
live-card server-driven); tarih/TZ temiz (epoch-ms countdown, closesAt inclusive
birebir); kritik para yolu `distribute.ts` exact BigInt; cache invalidation mükemmel
(WS→invalidation köprüsü, çekirdek akışlar doğru).

**Açık kalemler (kozmetik/backend-bloklu):**
- 🟡 **F6 orders-list tutar-sıralaması** karışık kurda ham `Number(amount)` (TRY-normalize
  yok) — backend orders'ta `amountTry` DÖNMÜYOR; düzeltmek backend alan eklemek demek.
  Liste-sırası, KARAR yolu değil (my-bids-list normalize ediyor → kardeş asimetri).
- 🟢 **F8** advisory tasarruf-% float (karar-desteği gösterim); **F9** dashboard KPI'ları
  mutasyon/sinyalle invalidate edilmiyor (bayat aggregate); **F10** realtime `onListing`
  `company-listings/mine` prefix'ini atlıyor. Hepsi düşük/kozmetik.
- 🟡 **F12 (bilinçli)** `useHasCompanyPermission` fail-open (permissions bayatsa
  YONETICI/SAHİP varsayımı) DEĞİŞTİRİLMEDİ — 13 çağrı yeri, backend zaten bloklu,
  fail-closed yaparsak yükleme anında yönetim butonları kaybolur (kötü UX). F11
  (persisted tier snapshot ≤60s) + F13 (CLOSED'da kazandır gizli, nadir) benzer.

## WebSocket (realtime) denetimi (2026-07-17)

Gelen mesajlar (client→server) ilk kez denetlendi. 2 handler (subscribe/unsubscribe),
ikisi de sinyal-only (state değiştirmez, DB yazmaz). Kapananlar:

| # | Kural | Durum |
|---|-------|-------|
| ✅ | **F-WS-1** WS subscribe rate-limit (30/10sn, soket başına, DB sorgusundan ÖNCE → amplifikasyon kesilir); REST ThrottlerGuard'ın WS kardeş-yolu | `7897b58` |
| ✅ | **F-WS-3** unsubscribe tip/uzunluk kontrolü (subscribe ile simetri) | `7897b58` |
| ✅ | **F-WS-4** `maxHttpBufferSize: 16KB` (1MB default 64x kısıldı) | `7897b58` |
| ✅ | **Framework kapsam boşluğu** — @SubscribeMessage throw → süreç çökmez, 'exception' emit; gerçek WS e2e ile TEST edildi (kod-okuma varsayımı değil) | `cd60de6` |

**KONTROL VAR (temiz — doğrulandı):** emit payload'ları KATI id-only (INV-BID-1
payload-temiz); subscribe erişim-kontrolü (canSubscribeOrder buyer/seller, canSubscribeListing
owner/bidder/invited/connected — tenant-scoped, companyId handshake JWT'sinden); manuel payload
validation (kind whitelist + id string ≤60); injection yok (Prisma parametrize, oda adı
kısıtlı); handshake DB-taze iptal kapısı (INV-MT-3) + exp-timer (INV-SD-1).

**Açık kalem (bilinçli kabul):**
- 🟡 **F-WS-2 K1 zamanlama-residual** — `pingListing` DAİMA `listing:{id}` odasına yayar
  ("detay izleyicileri görsün"); rakip teklifçi (canSubscribeListing bidder'a izin verir) o
  odaya abone → her teklifte id-only `listing.updated` ping'i alır = **zamanlama/sayı
  yan-kanalı** (tutar/kimlik DEĞİL). **Bilinçli KABUL:** ping tüm değişikliklerde çıkar
  (gürültülü, yalnız teklifte değil), id-only, ve alan kişi zaten TARAF (bidder). Sahip-odasına
  daraltmak davetli/bağlı MEŞRU izleyicilerin canlı güncellemesini kırar → UX kaybı > marjinal
  güvenlik kazancı. Gateway yorumu (realtime.gateway.ts:22-23) K1'i zaten belgeliyor.

## Form validation denetimi (2026-07-17) — admin rol-kapısı + kimlik kökü

apps/admin (TAM) + apps/web'de bakılmamış formlar F1–F7 merceğiyle denetlendi. İki
sınıf bulundu: (A) admin buton görünürlüğü tek eksende (`role !== "SUPPORT"`) → SALES
ile SUPER_ADMIN ayrılmıyordu; (B) web kimlik alanları backend'den kopmuş gevşek
kurallarla doğruluyordu. Kapananlar:

| # | Kural | Durum |
|---|-------|-------|
| ✅ | **A** admin gerçek rol-kapısı — `canAdminDo(role, action)` matrisi backend `@RequireAdminRole`'ü yansıtır (F7 deseni); 6 kapı yeniden bağlandı (tier/suspend/deleteNote SUPER; resolve/notify/extend KYC; personel manageStaff sayfa-guard). apps/admin `@rothern/shared`'a bağlı olmadığından matris yerel | `d831a82` |
| ✅ | **A-DRIFT** matris ıraksama nöbetçisi — `admin-action-roles-drift.spec` her aksiyonun backend handler metadata'sını okuyup karşılaştırır → decorator değişince kırılır (admin-route-authz-wiring deseni). Paketler ayrı → iki kopya + çapraz-ref | 17 test |
| ✅ | **B** web kimlik doğrulama kök-neden — `@rothern/shared` saf yardımcıları: onboarding `isValidTaxIdForCountry`+`isValidTckn`; profil+banka IBAN `isValidIbanTr` (TR mod-97, eski `/^TR\d{24}$/` checksum'sızdı); profil MERSİS `isValidMersis`, KEP backend regex inline; onay eşiği `moneyInputError` (MAX_MONEY+2 ondalık) | `af75aef` |
| ✅ | **maxLength hizalama** — admin edit-profile (15 alan) + notify/note/reason/add-user/add-staff + PromptDialog max/maxLength prop'u; web signup/parola/akış-adı/adım-sayısı(@ArrayMaxSize 10) hepsi backend @MaxLength/@Max birebir | `6997416` |
| ✅ | **#9 / INV-APPR-1** onay akışında kendini onaycı seçince UYARI (engelleme YOK — Grup C kararı korunur); runtime devir/reddi anlatılır | `2616c5f` |
| ✅ | **Adres FATURA gevşetildi** — vergi dairesi/no zorunluluğu + TR VKN/TCKN format bloğu KALDIRILDI; backend `company-address.dto` bu alanları `@IsOptional` tutup format doğrulamıyor → frontend backend'den katı olmamalı (backend otorite) | `6997416` |

**Kalan form yüzeyi (🟡 sonraki tur — düşük öncelik):** admin docs/complaints/connections/
summary/orders/listings/audit sekme gövdeleri + duyuru formu tek tek F1–F7 merceğinden
GEÇİRİLMEDİ; web public-profile sayfa alanları, category-selector cap ve PhoneInput↔backend
regex birebirliği doğrulanmadı. Ayrıca signup e-posta ve admin doc-reject reason backend'de
cap'sız (`@IsEmail`/`@IsObject` yalnız) — sınır eklenip eklenmeyeceği ürün kararı.
