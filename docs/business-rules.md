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
- **unitPrice üst sınırı YOK:** `quantity` `@Max` kondu ama birim fiyatın tavanı yok →
  `qty × unitPrice` Decimal(18,2) taşması TAM kapanmadı. unitPrice'a da makul `@Max`
  eklenmeli | 🔴 **açık** (bu turda kapsam dışı — kaybolmasın)
- **CASH → accept guard, atomik geçişler, due-reminder cron** | 🟡 tasarım (INV-SM-*)

## 4. Miktar / Birim

- **quantity `Decimal(18,3)`, `@Min(0.001)` `@Max(1_000_000_000)`** (Decimal taşma
  koruması) — `create-listing.dto` ListingItemDto | ✅ **Grup 4**, `d3bb0c1`
- **unitPrice** — sınır yok → bkz. §3 açık kalem | 🔴 **açık**

## 5. Onay Akışları

- **Görev ayrılığı:** başlatan ≠ onaylayıcı; `decide()` self-onay reddeder;
  `requestApproval` initiator-approver'ı anında ikame, uygun yoksa award reddedilir;
  fallback havuzu +ONAYLAYICI ∖{initiator}, uygun yoksa REJECTED (sessiz PENDING yok) | ✅ **INV-APPR-1**, `e5cc1df`
- **Eşik Decimal** (`amountDec.lt(minDec)`); kur bilinmiyorsa `forceRequireApproval`
  (hiçbir adım SKIPPED değil) | ✅ INV-MONEY-1 + INV-FX-1
- **Tek açık istek/ilan/tip** (mükerrer kazandırma yarışı engeli) | 🟡 tasarım (INV-SM)

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
| 🔴 | **unitPrice `@Max` yok** | create-listing.dto | qty×price Decimal(18,2) taşması tam kapanmadı (quantity @Max kondu) |
| 🔴 | **priceDecrement\* kolon-drop** | schema.prisma | DEAD işaretli; Supplier.sectors ile batched drop migration'a bırakıldı |
| 🔴 | **vade `setDate()` server-local tz** | ödeme vade hesabı | timezone-farkında olmalı (küçük) |
| 🔴 | **`Supplier.sectors` deprecated kolon** | schema.prisma | migration ile kaldırılmalı |

> **NOT (bilinçli, açık DEĞİL):** `advancePercentFor` runtime `?? 100` backstop KORUNDU —
> yazma kapısı sıkı (ADVANCE'ta zorunlu), backstop yalnız stray/legacy null için
> fail-closed savunma; kaldırmak fail-open olurdu (bkz. §3).
