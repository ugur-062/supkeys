# Denetim 2026-08-23 — Parça 3: Sipariş & Para (company-orders, ödeme, kur, tier)

> **Terminoloji notu (2026-09-01):** Bu rapor yazıldığında ürün dilinde
> "ihale" kullanılıyordu. Sonradan kullanıcı-yüzü dil **"satın alma talebi"**
> (satış tarafında "ilan") olarak değiştirildi. Rapor metni BİLİNÇLİ olarak
> güncellenmedi: o tarihteki kodu ve dizeleri anlatıyor, bugünkü sözcükle
> yeniden yazılırsa okuyucu git geçmişinde başka bir şey bulur. Kod adları
> (`IhaleListView`, `ihaleler-view.tsx` vb.) zaten değişmedi. Bkz. CLAUDE.md
> § Ürün Dili.



Yöntem: 7 mercek paralel bulgu toplama (49 ham bulgu) → tekilleştirme → MED
adayları için bağımsız çürütme turu (11 denetçi; doğruluk + etki + tasarım
kararı birlikte) → LOW/INFO elle. Bilinçli kabul edilmiş maddeler yeniden
açılmadı (sipariş belge yükleme kaldırıldı, platform para tutmaz/hakem değil,
iade akışı yok, A1/TTK-23 kararları, kısmi peşin yalnız yurtiçi, CAD ship-gate
yok, vade `setDate()` tz, liste take:200, print HTML, un-award yok).

## DOĞRULANAN (çürütme turunu geçen)

| # | Şiddet | Bulgu | Kanıt | Düzeltme |
|---|--------|-------|-------|----------|
| 1 | **MED** | **Akreditif borcu arayüzden kapatılamıyor:** `receive()` IN_DELIVERY→**COMPLETED** atlıyor (Madde 17 oto-tamamlama) ve `lcMarkPaid` API'si COMPLETED'ı AÇIKÇA kabul ediyor, ama web `lc-step-panel` COMPLETED'da `return null` → satıcının "Ödeme Bankadan Alındı" adımı ulaşılamaz. LC'de manuel ödeme kaydı da yapısal kapalı (`isPaymentOpen`=false, `recordPayment` reddediyor) → borç kalıcı açık, `paymentSettled` sonsuza dek false, "Ödeme Bekleyen" KPI'ı yanlış. Kök: panel guard'ı 8777392d (2026-07-13), oto-tamamlama 6b352af0 (2026-08-02) — backend uyarlandı, panel güncellenmedi | `lc-step-panel.tsx:33-40, 98-121`; servis `receive() 409-441`, `lcMarkPaid 1040-1070`, `isPaymentOpen 1438-1445`; sözleşme `order-workflow.spec.ts:1120-1157` (receive→COMPLETED→lcMarkPaid) | panelden COMPLETED'ı çıkar, ödeme dalına COMPLETED ekle; `page.tsx` COMPLETED+ödenmemiş metnine LC istisnası |
| 2 | LOW | **A1-DISPUTED'ta satıcının "sevk" çıkışı ön-koşul sağlanmamışsa kapalı:** peşin eşiği ödenmemiş ADVANCE veya LC damgası yoksa — `isPaymentOpen` DISPUTED'ı kapsamıyor (alıcı ödeme kaydedemez), `lcMarkOpened/Accepted` yalnız ACCEPTED, `withdrawCancelRequest` yalnız ACCEPTED → tek çıkış alıcının iptali onaylaması. `docs/invariants.md:62` iki-yönlü çıkışı koşulsuz vaat ediyor; UI ise "alıcı ödemeyi bildirsin" diyor ama alıcının butonu gizli (imkânsız talimat) | servis `isPaymentOpen 1438-1456`, `ship 309-352`, `lcMarkOpened/Accepted 971-1002`, `withdrawCancelRequest`, `rejectCancelRequest 757-780` | A1-DISPUTED'ı (defectNotifiedAt=null) ödeme/LC penceresinde ACCEPTED gibi say (durum geri alınmaz); ayıp-DISPUTED kapalı kalır + doküman |
| 3 | LOW | **Admin sipariş detayı payload'ı gereksiz PII taşıyor:** `orderDetail()` `...o` spread'i `bankIban`, `bankAccountHolder`, `deliveryAddress` (contactName/phone/addressLine) döndürüyor; uç bilinçli olarak SUPPORT dahil tüm rollere açık (yorum + `admin-route-authz-wiring.spec.ts:83-93` sözleşmesi) → **kapı doğru, payload fazla**. Kardeş uç `admin-company-users.service.ts:55` aynı gerekçeyle `phone`u projeksiyondan çıkarıyor; admin FE bu alanları hiç render etmiyor | `admin-inspection.service.ts:311-366`; `admin-inspection.controller.ts:33-66` | `include` yerine açık `select` (üç PII alanı dışarıda); rol kapısına dokunma |
| 4 | LOW | **`lcMarkPaid` audit izi yok:** siparişin kalanı kadar doğrudan `status:"CONFIRMED"` ödeme satırı üretip audit'li `paymentDecision` yolunu atlıyor → "her CONFIRMED ödemenin `payment_confirmed` izi vardır" simetrisi kırık (INV-AUDIT-1). `lcMarkOpened/Accepted` beyan damgaları da izsiz (bilinçli BEYAN kararı — ikincil) | servis `lcMarkPaid 1033-1102`, audit'li `paymentDecision 1642` | commit sonrası `company.order.payment_confirmed` (`source: "letter_of_credit"`) + LC beyan izleri |
| 5 | LOW | **UI↔API kilit paritesi (2 nokta):** (a) ayıp ihbarlı DISPUTED'ta satıcıya birincil "Siparişi Tamamla" (ship) butonu görünüyor — modal fatura no aldıktan sonra API 400; (b) vesaik mukabilinde (CAD) alıcıya tam ödeme onayı olmadan "Teslim Aldım" görünüyor, bekleme ipucu yok | `siparis/[id]/page.tsx:164-193, 337-342`; servis `ship 305-355`, `receive 410-441` | `next`/`nextStepHint` dallarına `defectDisputed` ve `cadGate` filtreleri |
| 6 | LOW | **"Ödeme tamamlandı" sinyali çelişkili:** detay `paymentTotals.remaining` bekleyen (AWAITING) ödemeyi de düşer (**bilinçli** S4/Madde 16: "kalan bildirilebilir tutar"), ama web `orderFullyPaid` bunu "borç kapandı" sanıyor → detay "Ödeme tamamlandı / Kalan 0" derken liste "Ödeme bekliyor" diyor; `payment-status.ts` JSDoc'u backend formülünü yanlış aktarıyor | servis `serialize 1820-1867` (detay) vs `list 1765-1782` (paymentSettled); web `payment-status.ts:10-24` | detay yanıtına `paymentSettled` ekle (liste ile aynı helper), web onu kullansın; JSDoc düzelt; "onay bekleniyor" ara durumu |
| 7 | LOW | **Vade hatırlatma cron'u tek hatada iki şey kaybediyor:** idempotensi damgası bildirimden önce basılıyor (bilinçli at-most-once) **ama** çıplak `await` ve try/catch yok → bildirim hatasında o siparişin hatırlatması kalıcı kaybolur ve hata taramanın kalanını iptal eder | servis `sendDuePaymentReminders 1186-1210` | per-sipariş try/catch + hata halinde damga geri alma (await korunur — spec'ler senkron sayıyor) |

## ÇÜRÜTÜLEN / BİLİNÇLİ TASARIM (düzeltme yok)

- **`changeClosingTime` paket kapısı yok** → DESIGN_DECISION: uç "mevcut ihaleyi tamamlama" grubunda (INV-AZ-1/INV-ENT-2, `tier-visibility.spec.ts:212` sözleşmesi); ayrıca SATIS ilanı zaten süresiz, ALIM yayın anında 2 yıla açılabiliyor — kapı eklemek zararı kapatmaz.
- **Koltuk limiti "atlatılabilir"** → DESIGN_DECISION: Faz K kararı ("aşkın durum türetilir, zorla silme yok" + `applySeatSelection`); ayrıca self-upgrade kapalı, BRONZ/SILVER yalnız admin eliyle.
- **Web Satınalma portalı <SILVER kilidi settle'ı engelliyor** → REFUTED: PortalGuard yalnız `/company/satinalma/*` segmentinde; ihale sonuçlandırma `/company/ilan/[id]` ve sipariş detayı `/company/siparis/[id]` segment DIŞINDA, tier referansı yok → düşen firma askıdaki işini bitirebiliyor.
- **Kur bayatlığı para yolunu kilitliyor** → DESIGN_DECISION (INV-FX-1 fail-closed yazılı ve testli). Kalan çekirdek: eşik kalibrasyonu — kod yorumu "4 güne kadar boşluk meşrudur" derken TR'de bayram+hafta sonu 9 güne çıkabiliyor (LOW, Dalga B).

## DALGA B (doğrulanan LOW/INFO — düzeltme sırada)

- `order-action.dto` / `order-payment.dto` alanları **trim'siz** doğrulanıyor (boşluklu fatura no zorunluluk kapısını, boşluklu ödeme yöntemi çek-alanı kuralını atlatıyor).
- Sipariş **listesi** Faz O dar-bağlam kapısından muaf (ONAYLAYICI-only üye özetleri görür, detay 404).
- `raiseDefectNotice` `disputePrevStatus` CAS öncesi okumadan damgalanıyor (COMPLETED→geri çekme DELIVERED'a geriler).
- Durum geçişi commit'inden sonra `notifyOrderParty` çıplak `await` → bildirim hatası istemciye 500 (kazandırma yolundaki try/catch deseni yok).
- Banka hesabı: yabancı IBAN'da **mod-97 yok**; `title`/`accountHolder` trim öncesi `MinLength(1)`.
- TCMB cron hatası Sentry'e gitmiyor (yalnız bellek-içi registry + throttled log); parse'ta kur pozitifliği doğrulanmıyor.
- Üyelik: `upgradeToPremium` bayat `membershipEndAt`i temizlemiyor (bayrak açılınca sessiz etkisiz yükseltme); `extendMembership` süresiz üyeliği süreliye çeviriyor; scheduler/admin yazımları atomik değil; admin REVOKE giden bekleyen davetleri iptal etmiyor (scheduler EXPIRE ile asimetri); `/me` `membershipEndAt` vermiyor.
- AI tedarikçi keşfi **ham** `tier` filtresi kullanıyor (INV-TIER-1 drift — süresi dolmuş paketli firma aday çıkıyor).
- Admin sipariş sayfasında "Siparişi İptal Et" SUPPORT'a görünüyor (API SUPER_ADMIN/SALES ister).
- Sipariş listesinde DISPUTED satırı "Onay Bekliyor · 1/5" adım göstergesiyle çiziliyor; iki farklı para-birimi sembol tablosu.
- Doküman driftleri: `business-rules.md:84,124`, `invariants.md:181`, `CLAUDE.md:64`, scheduler JSDoc, teminat "satıcı yükler" metinleri (belge yükleme 2026-08-22'de kaldırıldı).
- Kur bayatlık eşiği kalibrasyonu (yukarıda).

## EK BULGU (kapsam dışı, ikinci turda çıktı — HEMEN KAPATILDI)

| Şiddet | Bulgu | Kanıt | Durum |
|--------|-------|-------|-------|
| **HIGH** | **SSRF — AI profil zenginleştirme:** `profile-enrich` kullanıcı gövdesinden gelen `website` adresini kendi `normalizeUrl`'üyle alıp düz `fetch(redirect:"follow")` ile çekiyordu; repodaki tek kaynak SSRF kapısı (`common/website-import.ts` → `assertPublicHttpUrl`) atlanmıştı. BRONZ+ herhangi bir kullanıcı `http://127.0.0.1:4000/...`, `http://169.254.169.254/...` gibi iç adresleri sunucuya çektirip içeriğin AI özetini (`aboutText`) geri alabiliyordu. Ayrıca `website-import`'un kendi fetch'i de `redirect:"follow"` olduğundan public→private yönlendirmesi ikinci-derece SSRF bırakıyordu | `profile-enrich.service.ts:84,108,202-247`; `website-import.ts:25-54` | ✅ **KAPATILDI**: ortak `fetchPublicUrl` (elle yönlendirme + HER adımda `assertPublicHttpUrl`, en fazla 3 hop) eklendi ve iki yol da ona bağlandı; test `audit-part3-dalga-a.spec.ts` |

| **HIGH** | **Kesirli miktarda toplu kazandırma ÖLÜ:** `sumLineTotals` Σ(unitPrice × qty) değerini yuvarlamadan döndürüyordu; `bid.amount` `Decimal(18,2)` kolonuna yazılırken DB yuvarlıyor (1,5 × 10,33 = **15,495 → 15,50**), S5 nöbetçisi aynı formülü yeniden koşup `15,495 ≠ 15,50` görüyor → `award` her seferinde 400 ("Sipariş tutarı tutarsızlığı"), ilan OPEN/IN_AWARD'da takılı kalıyor, sipariş oluşmuyor. Kalem-bazlı kazandırma aynı girdide çalışıyor (asimetri). Ampirik olarak doğrulandı (geçici spec ile: `STORED 15.5` / `AWARD ERR = tutarsızlık` / `ITEM AWARD ORDERS = ['15.5']`) | `common/company/bid-items.ts:61-66` (sumLineTotals), servis `placeBid 3395`, S5 nöbetçisi `4423`, `buildItemGroups 5050` | ✅ **KAPATILDI**: tek kaynak `roundMoney` (2 basamak, ROUND_HALF_UP = DB davranışı) — `sumLineTotals`/`sumLineTotalsInBase` ve kalem-grup tutarları ondan geçiyor; test `audit-part2-dalga-a.spec.ts` #1b (toplu + kalem-bazlı aynı tutar) |

İlk bulgu AI katmanına (Parça 6) ait ama HIGH olduğu için sıraya bırakılmadı.
İkincisi Parça 2'nin S5 nöbetçisiyle aynı sınıf — denetim ajanlarının repoda
bıraktığı geçici spec'lerden çıktı, doğrulanıp kapatıldı (spec'ler silindi,
yerine kalıcı regresyon testi eklendi).

## DURUM

- **Dalga A UYGULANDI (2026-08-23):** #1-#7 + HIGH SSRF.
  - `lc-step-panel.tsx`: COMPLETED artık paneli gizlemiyor, ödeme dalına COMPLETED eklendi (ödeme alındıysa tamamlanmış siparişte panel yine gizli).
  - `page.tsx`: `defectDisputed`/`cadGate` türetmeleri → ölü birincil butonlar kalktı, iki yeni bekleme ipucu; COMPLETED+ödenmemiş metnine "onay bekleniyor" ve LC istisnası; `fullyPaid` artık `paymentSettled`'dan.
  - `company-orders.service.ts`: `isPaymentOpen(..., defectNotifiedAt)` + `isA1Dispute` (A1-DISPUTED'ta ödeme/LC penceresi açık, ayıp-DISPUTED kapalı); `lcMarkPaid` → `company.order.payment_confirmed` (`source: "letter_of_credit"`), `lc_opened`/`lc_accepted` beyan izleri; vade cron per-sipariş try/catch + damga geri alma; detay yanıtına `paymentSettled`.
  - `admin-inspection.service.ts`: `orderDetail` açık `select` (IBAN/hesap sahibi/teslimat adresi payload'dan çıktı; rol kapısı bilinçli olarak aynı).
  - `payment-status.ts`: `orderFullyPaid(totals, amount, settled)` — sıra `settled` → onaylı toplam → remaining; JSDoc düzeltildi.
  - Doküman: `invariants.md` A1 + INV-SM-4, `business-rules.md` A1 satırı güncellendi.
  - Testler: `audit-part3-dalga-a.spec.ts` (8) + web 336 test yeşil.
- **Açık:** kazandırma→sipariş merceği (award-to-order) iki turda da oturum limiti/bağlantı hatasıyla düştü — Dalga B ile koşulacak.
- **Dalga B:** yukarıdaki liste (DTO trim, liste Faz O, defect CAS, notify 500, IBAN mod-97, TCMB Sentry, üyelik yazımları, AI keşif ham tier, admin UI rol driftı, doküman driftleri, kur eşiği kalibrasyonu).
