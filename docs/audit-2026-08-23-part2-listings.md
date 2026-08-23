# Denetim 2026-08-23 — Parça 2: İhale Çekirdeği (company-listings)

Yöntem: 6 mercek paralel bulgu toplama (61 ham) → tekilleştirme → HIGH/MED
adaylar için bağımsız çürütme (18 denetçi; doğruluk + etki + tasarım/kabul
birlikte) → LOW/INFO ve kapasite dışı kalan adaylar elle. Kapatılmış/bilinçli
kabul edilmiş maddeler yeniden açılmadı (auction step-race, placeBid time-window,
ship/receive CAS dışı ödeme kapısı, G-M3 presigned boyut, CC-1 ürün kararı, W1
UI, un-award yok, 403/404 tutarlılığı).

## DOĞRULANAN (18/18 çürütme turunu geçti — hiçbiri çürütülemedi)

| # | Şiddet | Bulgu | Kanıt | Düzeltme taslağı |
|---|---|---|---|---|
| 1 | **HIGH** | **S5 nöbetçisi kalemsiz teklifi kazandırılamaz kılıyor**: `runFullAward` `Σ(kalem)≡bid.amount` kontrolünü koşulsuz uyguluyor; TOPLU Hemen-Al teklifi (kalem satırı yazılmaz) ve kalemsiz ilan teklifleri için Σ=0 ≠ amount → **award HER ZAMAN 400** → Hemen-Al uçtan uca ölü, ilan IN_AWARD'da takılır | service.ts:4305-4354, :4364 (ölü "tek grup" dalı), buyNow :4096-4114 | nöbetçiyi yalnız `bid.items.length>0` iken uygula; kalemsiz → tek-tutar sipariş dalı; test: TOPLU buy-now award |
| 2 | **HIGH** | **`extendBidValidity` "revive" yolu** DRAFT teklifi placeBid'in TÜM gönderim kapılarını (KYC, requireAllItems, taban/hemen-al, zorunlu soru, belge, teslim, kapanış) atlayarak SUBMITTED'a çeviriyor — elenen teklifçi taban-altı/eksik teklifi "canlandırır", kapanıştan sonra bile | :5764-5797; placeBid taslak güncellemesi eski `submittedAt`'ı koruyor (:3706-3720) | taslak güncellemesinde `submittedAt:null`; revive yalnız LAZY-taşıma taslağı (`round===currentRound && !içerik değişti`) için ve placeBid doğrulamalarından geçerek; test |
| 3 | **HIGH** | **`buyNow` INV-KYC-1'i atlıyor** (UNVERIFIED/PENDING firma bağlayıcı SUBMITTED Hemen-Al teklifi) + hiç audit izi yok (placeBid'de `company.bid.submitted` var) | :3834-4128; assertVerified çağrıları yalnız create/publish/placeBid/award/awardByItem | rol kapısından sonra `assertVerified(user,"teklif veremezsiniz")` + `company.bid.submitted {isBuyNow:true}` audit; kyc-gate.spec +2; INV-KYC-1 listesine buyNow |
| 4 | **HIGH** | **XLSX zip bombası** — ExcelJS.load öncesi açılmış boyut tavanı yok (3 yol) | listing-item-import :216, bid-import :221, ai-extract-router | ✅ **KAPATILDI** `67d9cb05` (zip-inspect.ts, 3 yol + test) |
| 5 | MED | **Admin moderasyon kapatması (CLOSED) sahibe kapalı değil**: `createNextRound` CLOSED→OPEN açar, `award/awardByItem/eliminate/closeNoAward` CLOSED'da serbest (UI gizliyor, API izin veriyor) | :5389/:5449, :4152, :4633, :6000, :6465; admin-inspection.service.ts:134-148 | CLOSED'ı sahip aksiyon setlerinden çıkar (tek çıkış admin reopen); test |
| 6 | MED | **`updateListing` TOCTOU**: "teklif var mı" tx dışında, `tx.listing.update` koşulsuz, kalemler sil-yaz → eşzamanlı placeBid'in kalemleri cascade silinir (teklif sessizce bozulur) | :1281-1289, :1365, :1427; schema ListingBidItem cascade | ilan satırını FOR UPDATE + tx içinde bid count; placeBid tx'inde ilan durum/tur koşullu dokunuş |
| 7 | MED | **Dış ihale daveti ilan-yönetim kapısını (INV-AZ-1) atlıyor**: `connections:manage` izinli YONETICI, yönetemediği (hatta PRIVATE) ihale için dış davet → kayıt sonrası ListingInvitation | connections.service.ts:197-214 vs addInvitations (listings :5832) | `listingManageDenial` + audit denial (addInvitations ile birebir); test |
| 8 | MED | **Faz O dar-bağlam kapısı kardeş uçlarda yok**: ONAYLAYICI-only/rolsüz üye `roundHistory` (teklifçi adı+tutar) ve `bid-documents` (presigned URL) okuyabiliyor | listings :5948-5977; company-bid-documents.service.ts:160-171 | `assertOwnerReadContext` iki uca da; test |
| 9 | MED | **`getProfile` açık-ihale listesi embargo + ülke kapsamını uygulamıyor** (bidsOpenAt gelecekteki ihalenin başlığı/no/kapanışı profil sayfasından sızıyor) | connections.service.ts:939-960 vs getOne :2480-2506, sellerTenders :1949 | where'e embargo OR (`bidsOpenAt null | lte now | kendi teklifi var`) + ülke kapsamı; NOT(gt) NULL tuzağı |
| 10 | MED | **RFQ teklif kur damgası `getCurrentRate`** (hardcoded fallback / >7 gün bayat) ile basılıyor → sahip sıralaması + kazandırma onay eşiği bayat kurla, onay sessizce atlanabilir (INV-FX-1 ruhuna aykırı) | :3478-3490, :4056-4061; exchange-rate.service.ts:69-92 | `getFreshRate` (null→damga yok, mevcut test uyumlu) |
| 11 | MED | **awardByItem: TRY teklif + yabancı para kalem** → grup kur damgası null → onay isteği **0 TRY** + zorunlu onay (award ile asimetri) | :4944-4953, :5019, :4694 | `baseToTry = bid.currency==="TRY"?1:snapshot` ile türet |
| 12 | MED | **Kalem-bazlı kazandırmada kaybedenlere bildirim yok** (`runFullAward` gönderiyor, `runItemAward` göndermiyor) | :5249-5303 vs :4555-4591 | tx öncesi losingBidderIds yakala; `bid_lost` e-posta/in-app |
| 13 | LOW | `createNextRound`↔`placeBid` yarışı: teklif kümesi tx dışında okunuyor; geç teklif eski turda kalır, NONE/AUTO taşıması ıskalar, eliminateNonBidders gerçek teklifçinin davetini siler | :5422-5433, :5509-5548 | #6'daki FOR UPDATE/koşullu dokunuş deseniyle birlikte |
| 14 | LOW | Referral opt-out yalnız dış-ihale yolunda; `inviteByEmail`/batch opt-out'u yok sayıp her çağrıda yeniden e-posta | connections.service.ts:103-176 | opt-out kontrolü + upsert'te yeniden gönderme yerine cooldown |

## ÇÜRÜTME KAPASİTESİ DIŞI KALAN ADAYLAR (MED, elle doğrulanacak / Dalga B)
- RFQ→RFQ "Yeni Tur" AUTO taşıma işlevsiz: taşınan SUBMITTED teklif RFQ kilidine (:3133) takılır, teklifçi yeni fiyat veremez; `validityDays=null` yapılır.
- SATIS pazarlıkta Hemen Al ulaşılamaz: teklif vermiş alıcı buyNow yapamıyor (:3976) ve ≥hemen-al fiyatına teklif veremiyor (:3553); web butonu yine de gösteriyor.
- `publishListing` taslağı eksik yeniden-doğruluyor (closesAt ≤ now+2y ve bidsOpenAt<closesAt yok) → cron'un hiç kapatmayacağı ilan.
- award/awardByItem: onay isteği commit sonrası ilan geçişi count=0 → yetim PENDING istek.
- award OPEN'dan (kapanış gelmeden) çağrılabiliyor; red/iptal IN_AWARD'a düşürüyor, bildirim/audit yok.
- Teklif kur damgası aynı zamanda `amountTry` listelerinde (LOW).

## LOW/INFO (raporlanan, düzeltme Dalga B)
Dosya/satır detayları workflow journal'ında (wf_e2d85464-596). Başlıklar: DTO sınırları vs DB kolonları (varchar), TR ondalık frontend↔backend tutarlılığı, controller-validation kapsamı, şablon IDOR (tenant scope mevcut), listing-documents silme kilitleri, bildirim içerik notları.

## DURUM
- #4 kapatıldı (`67d9cb05`). Diğerleri ONAY sonrası Dalga A (#1-#3, #5-#12) → test + tam suite + push.
