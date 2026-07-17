# Cross-field / Akış Tutarlılığı Denetimi — Bulgular

**Tarih:** 2026-07-17 · **Kapsam:** 4 domain (onay, RFQ, auction, sipariş) uçtan-uca, aşama-aşama · **Yöntem:** 4 named-teammate paralel + adversarial sınır sorgulaması · **Salt-okunur** (kod değişmedi).

**Aranan sınıf:** aynı büyüklüğün birden çok yerde hesaplanıp/saklanıp **sessizce ıraksadığı** hatalar (X5 = iki "fiyatlı kalem" tanımı, X7 = üç "onaylı toplam", FX = dört kur anı). Bu sınıf 500 vermez, testler yeşil kalır, **YANLIŞ SONUÇ** doğurur.

**Format:** her bulgu `kural | dosya:satır | zorlanıyor mu | somut senaryo | sessiz mi?`. Dosya: `apps/api/src/modules/...` (CL = company-listings.service.ts, CO = company-orders.service.ts, CA = company-approvals.service.ts).

---

## 🔴 CANLI IRAKSAMALAR (bugün tetiklenebilir, sessiz, yanlış sonuç)

### X-CF-1 (HEADLINE) — Kalem-bazlı kazandırma FX işleyişi `award`'dan ıraksıyor (INV-FX-1 öncelik-zinciri ihlali)
**İKİ teammate BAĞIMSIZ buldu** (approval-reviewer F1 + rfq-reviewer F1 — farklı uçlardan aynı kök-neden).
- Kural: kazandırma TRY-değeri INV-FX-1 önceliğiyle çevrilmeli: açılış damgası → **teklif damgası (exchangeRateSnapshot)** → null.
- `CL:3900` (`award` → tam): `toTryAmount(bid.amount, bid.currency, bid.exchangeRateSnapshot, snap)` — teklif damgasını ONURLANDIRIR. ✓
- `CL:4476` (`itemAwardTotal` → kalem): `toTryAmount(g.amount, g.currency, **null**, snap)` — bidSnapshot **hardcode null**; üstelik `buildItemGroups` (CL:4362) `exchangeRateSnapshot`'ı **select bile etmez**.
- **Zorlanıyor mu:** KISMEN/ıraksak. **Senaryo:** düz RFQ'da `auctionRateSnapshot` yok (yalnız ENGLISH_AUCTION'da basılır) → yabancı-para grup her zaman `null` → `itemAwardTotal=null` → `forceRequireApproval=true` HER ZAMAN; ayrıca onaylayıcıya `CL:4306` `amount: 0 TRY, currency:"TRY"` gösterilir (tam-award ise `CL:3910` dürüst ham `50.000 USD` gösterir). Onaylayıcı "0 TRY" isteğini onaylar, gerçek milyonluk sipariş commit olur.
- **Sessiz mi:** EVET (500 yok, testler yeşil). Yön **fail-closed** (fazladan onay + yanıltıcı 0) → güvenlik açığı DEĞİL ama INV-FX-1 ihlali + `award`↔`awardByItem` asimetrisi. **Fix yönü:** `buildItemGroups`'tan `exchangeRateSnapshot` geçir (her grup per-firma + firma-başına-tek-teklif → tek damga iyi tanımlı). **İŞ KARARI:** fail-closed olduğu için düzeltilir mi + onaylayıcıya 0 yerine ham foreign gösterilsin mi?

### X-CF-2 (INTEGRITY) — Auction'ın "tek yetkili FX bazı" fail-OPEN kaynaktan tohumlanıyor
- Kural: INV-FX-1 — para kararı YALNIZ damga veya `getFreshRate` (strict) kullanmalı; `getCurrentRate` **sessiz bayat/hardcoded-fallback** döndüğünden para kararında kullanılmaz.
- `CL:2488` (`buildAuctionRateSnapshot`): snapshot'ı **`getCurrentRate` ile kuruyor**. Kur tablosu boş/bayatsa `exchange-rate.service.ts:76-82` **POZİTİF hardcoded `FALLBACK_RATES[cur]`** döner. Guard (`CL:2490`) yalnız `null || <=0` reddeder → pozitif fallback GEÇER ve auction'ın ömür-boyu yetkili bazı olarak DONAR.
- **Zorlanıyor mu:** KISMEN (tüm read-site'lar aynı bazı kullanır = tutarlı, ama BAZ yanlış). **Senaryo:** TCMB cron çalışmamış → satıcı USD-izinli auction açar → snapshot USD=fallback donar → her sıralama/taban/onay-eşiği yanlış kurda → gerçekten-en-iyi yabancı teklif yanlış sıralanabilir, en-iyi/kazanan değişebilir.
- **Sınır çözümü (Faz 2):** order.amount teklifin KENDİ para biriminde saklanır (TRY-normalize DEĞİL — order-reviewer §3 + CL:4074/4619) → **order TOPLAMI etkilenmez**; yalnız **HANGİ teklifin kazandığı (sıralama)** + **onay eşiği (TRY-normalize)** etkilenir.
- **Sessiz mi:** EVET (yalnız warn-log). **Tutarsızlık:** taban'ın fallback bacağı (`CL:3251` placeBid `floorRate`) DOĞRU şekilde strict `getFreshRate` kullanır — yalnız snapshot BUILDER'ı fail-open. **İŞ KARARI:** snapshot'ı `getFreshRate` ile kur + taze kur yoksa auction'ı AÇMA (fail-closed, INV-FX-1 ile hizalı) mı?

### X-CF-3 (RACE) — Mükerrer onay-isteği dedup'ı atomik değil → yetim PENDING
- Kural: bir ilan için aynı tipte tek açık onay isteği.
- `CA:506-518` (findFirst) + `CA:525` (create) = **check-then-act**; şemada `(listingId, type, status=PENDING)` unique YOK (`schema.prisma:1557` yalnız `(companyId, requestNo)`).
- **Zorlanıyor mu:** KISMEN. **Senaryo:** iki eşzamanlı `award()` ikisi de `existingPending==null` geçer → iki PENDING `ApprovalRequest` create eder. Listing→IN_AWARD_APPROVAL status-guard'ı (`CL:3919`) yalnız birine izin verir; kaybeden `ConflictException` atar AMA request'i zaten commit oldu → **yetim PENDING** (kazanan finalize edince, yetim asla finalize olamaz `CA:777-796` → sonsuza dek kuyrukta, 3-günlük hatırlatma maili çeker).
- **Sessiz mi:** EVET (çift-sipariş YOK — fail-closed — ama kalıcı takılı PENDING). **Fix:** DB `@@unique([listingId, type], where status=PENDING)` (kısmi unique index).

---

## 🟡 İŞ KARARI GEREKTİREN (kullanıcı karar verecek — bug değil, tasarım sorusu)

### BK-1 — SAHIP (kurucu) rol-kapsamlı onay akışını TÜMÜYLE baypas ediyor
`CA:566-574` (`initiatorRoles hasSome user.roles`) + DTO `approval.dto.ts:34-39` (SAHIP enum'da YOK) + award authz `CL:3851-3856` (SAHIP tek başına yeterli). Yalnız-SAHIP kullanıcı award eder → `findMatchingFlow` null → `{approved:true}` → **ONAYSIZ kazandırma**. Görev-ayrılığının tüm amacı (büyük tutarı kendine kazandıran sahip) sahip için çökertiliyor. **Sessiz.** Kasıt mı? — kullanıcı kararı.

### BK-2 — Sipariş revizyonu `unitPrice @Min(0)` → sıfırlama mümkün
`order-action.dto ReviseOrderItemDto unitPrice @Min(0)` (placeBid `>0` ister, `CL:3137`). Satıcı öner + alıcı onayla → tüm kalemler 0 → `order.amount=0` → `isFullyPaid(0,·)` true (`CO:1163`) → sıfır ödemeyle COMPLETED. Alıcı onaylıyor (niyet olabilir) ama bid kurallarıyla asimetrik. **Görünür** (sessiz değil).

---

## 🟢 YAPISAL RİSK (bugün TUTARLI, tek-kaynak yok → düzenlemede yeniden-ıraksayabilir)

Tekrarlanan-tanım/tekrarlanan-hesap yerleri (X5 sınıfı, şu an senkron):

| # | Büyüklük | Yerler | Durum |
|---|----------|--------|-------|
| S1 | "fiyatlı kalem = unitPrice>0" | `CL:2887, 2642, 2025, 4559` (~5 site) | tutarlı (bir kez birleştirilmiş; `CL:4556` yorumu eski ıraksamayı belgeliyor) |
| S2 | "tam kapsam/comparable teklif" | owner `CL:2071` + public `CL:2651` | tutarlı (owner currentBest ↔ public bestTotal) |
| S3 | `confirmedPaymentSum` (onaylı toplam) | tek-kaynak `CO:1173` (TÜM karar kapıları) vs `getOne` inline `CO:1694` (yalnız GÖSTERİM) | karar-yolu birleşik; **display re-derive** ediyor |
| S4 | "committed" (AWAITING+CONFIRMED) | recordPayment cap `CO:1381` vs getOne remaining `CO:1700` | tutarlı, bağımsız hesap |
| S5 | order-total türetme STRATEJİSİ | runFullAward `=bid.amount` `CL:4073` vs runItemAward `=Σ yeniden hesap` `CL:4432` | eşit ÇÜNKÜ placeBid bid.amount'u listing-qty ile hesaplar + kalem edit-kilidi (aşağıda ✓) |
| S6 | closesAt-dahil sınır | placeBid `>=` `CL:2957`, buyNow `>=` `CL:3632`, cron `lte` scheduler:67 | tutarlı, 3 site |
| S7 | bid-validity expiry | createNextRound `CL:4882` vs extendBidValidity `CL:5228` | tutarlı, aynı formül |
| S8 | order kalem precision | `buildItemGroups Number(unitPrice)` `CL:4428` vs runFullAward ham Decimal `CL:4019` | edge: MAX_MONEY-ölçek fiyatta fidelity farkı |

**Sayısal özet (requirement b):** rfq N=5 (1 aktif=X-CF-1), auction N=3 (**residual FX-normalize ıraksaması = 0** — INV-FX-1 sağlam), order N=3 (+1 precision), approval N=2 (1 aktif=X-CF-1). **Toplam ~13 tekrarlı-büyüklük sitesi; CANLI ıraksama = 2** (X-CF-1 kalem-award FX + X-CF-2 fail-open baz); gerisi bugün-tutarlı/drift-riski. **Auction'da residual dört-kur-anı kalıntısı SIFIR** (INV-FX-1 tüm 5 TRY-site'ını `auctionTryValue`→`snapRateDecimal` tek-helper'ına bağladı, doğrulandı).

---

## ✅ KONTROL YOK / İHLAL YOK (doğrulandı — bakılıp temiz bulundu)

- **order.amount ≡ Σ(orderItem.unitPrice × listing.qty) her iki award yolunda** — rfq-reviewer file:line ile DOĞRULADI: placeBid bid.amount'u LISTING quantity ile hesaplar (`CL:3114-3150`; teklif DTO'sunda `quantity` alanı YOK → teklif miktar veremez); `updateListing` bidCount>0 kilidi TÜM statüleri sayar (`CL:1207-1214`, status filtresi yok → taslak/eleme/geri-çekilen bypass etmez). S5 ıraksaması bu kilitle CANLI DEĞİL. **Regresyon nöbetçisi:** kilit status-filtreli count'a çevrilirse S5 anında sessiz para-ıraksamasına döner.
- **Kapalı zarf sızıntısı YOK** — non-owner getOne (`CL:2417`) yalnız myBid+maskeli auctionView; bids/invitations/bidStats YOK; computeAuctionView ALL modunda bile kimlik gizli; bid-docs party-gated private bucket.
- **Sipariş durum↔alan** — her COMPLETED completedAt set, her DELIVERED deliveredAt; PENDING ödeme fully-confirmed order ile coexist edemez (cap mantığı); revizyon ödeme sonrası BLOKE (`CO:599` + FOR UPDATE `CO:718`); LC çift-sayım yok; award→order snapshot alanları iki yolda SİMETRİK (`CL:4078` ↔ `CL:4620`); currency = bid.currency.
- **Onay eşik-vs-sipariş değeri** — korumalı: bekleme boyunca ilan IN_AWARD_APPROVAL'da donuk (updateListing/placeBid/eliminate hepsi dışlar) + finalize bid.status!=="SUBMITTED" → throw → fail-closed rollback; kalem-award hem eşik hem sipariş için AYNI `buildItemGroups`.
- **Taşma** — kalem-award transitif MAX_MONEY-sınırlı (g.amount ≤ bid subtotal, placeBid'de cap'li; awardedQty≤fullQty).
- **buyNow config** — `buyNow>min` strict `>` hem TOPLU (`CL:738`) hem KALEM (`CL:721`), `validateSatisPricing` create+update ortak.
- **Tur geçişi** — snapshot REBUILT (`CL:4850`) + open-day re-stamp; allowedCurrencies/primaryCurrency KORUNUR; activeBidRound kasıtlı dokunulmaz (taşınan teklifle bir taze gönderim hakkı).

---

## ❓ KAPSAM ENVANTERİ + KÖR NOKTALAR (requirement c)

- **CA (company-approvals.service.ts, 1-1323):** TAM okundu.
- **CO (company-orders.service.ts, 1-1858):** TAM okundu.
- **CL (company-listings.service.ts, 6228 satır):** okunan birleşimi ≈ `512-854, 1175-1690, 1989-2715, 2824-4790, 4799-5305, 5745-5814`.

**HİÇBİR reviewer'ın OKUMADIĞI CL bölgeleri (kör noktalar — sonraki tur):**
1. **`create` 961-1175** (+ `validateListingBusinessRules 861`, `buildPaymentPlan 755`, `assertVerified 953`) — **rfq kör noktası:** create-anında `minPrice`/`buyNowUnitPrice` doğrulaması, placeBid floor-check'inin TÜKETTİĞİ değerlerle tutarlı mı bilinmiyor. (validateSatisPricing okundu ama create gövdesi değil.)
2. **`sellerTenders` kuyruğu 1750-1989** — tedarikçi ihale listesi (kapalı-zarf ilişkili).
3. **`resolveBidDeliveryAddress`/`orderDeliverySnapshot` 2716-2824** — teslimat-adresi snapshot'ı bid→order sınırında (denetlenmedi).
4. **`eliminate` 5404, `cancel` 5490, `startEvaluation` 5639, `closeNoAward` 5853** — yaşam-döngüsü geçişleri. **rfq kör noktası:** eleme in-flight award ile yarışır mı (runFullAward `CL:4003` status re-check muhtemelen güvenli ama eleme tarafı denetlenmedi).
5. **`detail` 6028, `serialize` 6197** — yanıt serileştirme (sızıntı yüzeyi; non-owner getOne yolu kontrol edildi ama tam serialize değil).
6. **Bildirim helperları 89-512, `notifyListingParticipants` 5570, `notifyEvaluationValidityReminder` 5709** — e-posta/bildirim plumbing (cross-field riski düşük).
7. **`updateInternalNotes` 5827, `addInvitations` kuyruk 5257, `roundHistory` 5373.**

**Diğer belirsizlikler:**
- `emitAsync('listing.award.approved')` TEK dinleyici mi? (approval-reviewer bu serviste yalnız `onAwardApproved` gördü; başka modülde ikinci dinleyici çift-çalıştırabilir — diğer modüller grep'lenmedi.)
- X-CF-1'in per-firma-tek-teklif varsayımı: RFQ'da bir firma bir ilana birden çok teklif verebilir mi? (create/bid uniqueness kör noktada.)
- F-AUC-1 (X-CF-2) stale-snapshot'ın approval eşiğine kesin etkisi: teammate cevabı türetildi (eşik FX-normalize → etkilenir) ama approval-reviewer'ın açık eşik-yolu teyidi alınamadı (idle plain-text).

---

## Öncelik (kullanıcı önceliklendirecek)
1. 🔴 **X-CF-1** — kalem-award FX ıraksaması (INV-FX-1 ihlali + onaylayıcıya 0 gösterimi). Tek dosya fix (`buildItemGroups` exchangeRateSnapshot geçir).
2. 🔴 **X-CF-2** — auction snapshot fail-open baz (getFreshRate + fail-closed açılış).
3. 🔴 **X-CF-3** — mükerrer-istek yetim PENDING (kısmi-unique index).
4. 🟡 **BK-1** (SAHIP onay baypası) + **BK-2** (revizyon 0'lama) — iş kararı.
5. 🟢 S1-S8 yapısal tek-kaynak birleştirme (drift önleme) + kör nokta bölgelerinin (create/eliminate/delivery-snapshot) sonraki turda denetimi.
