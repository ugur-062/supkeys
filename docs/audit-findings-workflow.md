# Uçtan Uca İş Akışı Denetimi — 4 Yüzey (ihale oluşturma + sipariş görünümleri)

**Tarih:** 2026-07-17 · **Yöntem:** 4 named-teammate paralel (alim / satis / orders / sales), ekran-ekran + adversarial kardeş-asimetri sorgulaması; aggregator (ben) 2 kritik backend iddiasını koddan doğruladı · **Salt-okunur** (kod değişmedi).

**Yüzeyler:** (1) ALIM ihale oluşturma, (2) SATIS ihale oluşturma — **aynı wizard, zıt dal** (`isSatis`); (3) Siparişler = firma ALICI, (4) Satışlarım = firma SATICI — **aynı sipariş detayı, zıt `role`**.

**Bilinen-hariç (tekrar raporlanmadı):** muayene/kabul yok, karma-ödeme kalan vade, mal mukabili (artık eklendi), kısmi teslim, teslim-sonrası iade, alıcı revizyon isteyemez.

**GÜVEN ölçeği:** YÜKSEK = koddan kanıtlı (asimetri / iç tutarsızlık / FE↔BE / yasal). ORTA = genel B2B pratiği böyle. DÜŞÜK = sektöre bağlı, ürün sahibi bilir.

---

## ÖZET TABLO — GÜVEN'e göre sıralı (YÜKSEK üstte)

| # | Bulgu | Yüzey | Sınıf | Değer. | GÜVEN |
|---|---|---|---|---|---|
| **CC-1** | **Alıcının "Hedef/İstenen Birim Fiyat"ı teklif verebilen TÜM tedarikçilere gösteriliyor + UI görünürlük etiketi taşımıyor** (kazara ifşa + fiyat çıpalama) | ALIM+SATIS | TERS/EKSİK | 🟡 | **YÜKSEK** (kod-yolu); anchoring yargısı ORTA |
| **A1** | **ACCEPTED-sonrası çıkış asimetrik:** alıcı ACCEPTED'te iptal edebilir, satıcı kabul sonrası çıkamaz (yalnız PENDING'de reddeder) | Orders↔Sales | TERS | 🟡 | **YÜKSEK** (asimetri); çözüm ürün kararı |
| **W1** | **CONNECTIONS ("bağlantılarıma açık") görünürlük modu UI'da YOK, backend destekliyor** (INV-VIS-1) | ALIM (SATIS de) | EKSİK | 🟡 | **YÜKSEK** (FE↔BE tutarsızlık) |
| **W2** | **Teslimat adresi HER ihalede zorunlu** (hizmet/lojistik'te anlamsız); backend `@IsOptional`, zorunluluk yalnız FE | ALIM (SATIS de) | FAZLA/TERS | 🟡 | **YÜKSEK** (FE↔BE); "hizmette gereksiz" ORTA |
| **S2** | **Proforma fatura belge tipi YOK** (LC/peşin akışında satıcı proforma'yı "Diğer"e gömüyor) | Sales | EKSİK | 🟡→🔴 (LC/advance'ta) | tip yokluğu **YÜKSEK**; gereklilik ORTA |
| **W3** | Teklif **geçerlilik süresi** (validity) alanı yok — RFQ standardı | ALIM+SATIS (simetrik) | EKSİK | 🟡 | ORTA |
| **W4** | **KDV dahil/hariç** yapısal alanı yok (yalnız serbest metin) | ALIM+SATIS | EKSİK | 🟡 | ORTA |
| **S1** | Accept'te **banka hesabı LC/vesaik siparişinde de zorunlu** (o hesaba ödeme hiç akmaz) | Sales | FAZLA | 🟡 | ORTA |
| **S3** | **Kısmi sevk bildirimi yok** (çok-kalemli/uzun teslim) | Sales | EKSİK | 🟡 | ORTA |
| **W5** | **Davetsiz PRIVATE + PUBLIC-değil ihale yayınlanabilir** (kimse görmez, uyarı yok) | ALIM | TERS/tuzak | 🟡 | ORTA |
| **O3** | Vadeli (AFTER_DELIVERY) DELIVERED'te "kalanı **ŞİMDİ** kaydedin" mesajı vadeyi yok sayıyor | Orders | TERS | 🟢/🟡 | ORTA |
| **A2 (RESOLVED)** | Alıcı ödeme sonrası iptal → **backend CONFIRMED ödemede iptali ZATEN engelliyor**; kalan yalnız UX (buton görünüp hata veriyor) | Orders | — | 🟢 (para) / 🟡 (UX) | YÜKSEK (koddan doğruladım) |
| **A3 (BİLİNÇLİ)** | Taban/rezerv fiyat SATIS'ta var, ALIM'da yok | Wizard | asimetri | 🟢 | YÜKSEK (A7, iki taraf teyit) |
| **A4 (BİLİNÇLİ)** | Fatura adresi ALIM'da var, SATIS'ta yok | Wizard | asimetri | 🟢 | YÜKSEK (iki taraf teyit) |
| O4 | DELIVERED stepper'ı "Teslim alındı"yı current gösteriyor (kozmetik) | Orders | — | 🟢 | YÜKSEK/etki DÜŞÜK |
| S4 | `advanceRemaining` ön-doldurma epsilon 0.01 (INV-MONEY-1 kozmetik) | Sales | — | 🟢 | YÜKSEK/etkisiz |

Küçük temizlik notları en altta.

---

## KARDEŞ-ASİMETRİ ÇAPRAZ UZLAŞTIRMA (bu projenin tekrar eden hata sınıfı)

### Wizard (alim ↔ satis) — İKİ taraf da teyit etti
- **A3 — Taban/rezerv fiyat:** yalnız SATIS (`minPrice`/`buyNowPrice` + kalem `minUnitPrice`/`buyNowUnitPrice`, `form-schema.ts:159-166`, `tenderItemSchema:126-133`); ALIM'da `mapToInput` undefined geçer (`tender-wizard.tsx:137-163`). **🟢 BİLİNÇLİ** — `business-rules.md` A7 ("ters eksiltmede alıcı zaten en düşük fiyatı ister"). satis-reviewer SATIS'ta render'ı, alim-reviewer ALIM'da yokluğu teyit etti. Simetri tam.
- **A4 — Fatura adresi:** yalnız ALIM (`step-1-info.tsx:1249` `isSatis ? null : ...`; refine `:281-285` SATIS'ı muaf). **🟢 BİLİNÇLİ** — SATIS'ta faturayı satıcı keser. İki taraf teyit.
- **W3/W4 — geçerlilik süresi + KDV:** her iki dalda da EKSİK (asimetri değil, **simetrik boşluk**) → backlog.

### Orders ↔ Sales — bağımsız ÇAKIŞAN bulgu (güçlü sinyal)
- **A1 — ACCEPTED-sonrası çıkış asimetrisi:** orders-reviewer (F2) ve sales-reviewer (K1) **bağımsız** aynı yeri işaretledi. `cancel` yalnız `!isSeller` + PENDING/ACCEPTED/CREATED (`page.tsx:266`); satıcı `reject` yalnız PENDING (`page.tsx:592`). → Satıcı kabul edip hazırlığa başladıktan sonra siparişten çıkamaz; alıcı IN_DELIVERY'ye kadar tek taraflı iptal edebilir. INV-SM-3'te "cancel = alıcı" **doğru** (buton yanlış tarafta değil), ama **dengesizlik ürün kararı**. **Uzlaştırma:** backend CONFIRMED ödemede iptali engelliyor (aşağı A2), yani "satıcı üretti, alıcı parayı da ödedi, sonra kaçtı" kısmen sınırlı — ama ödeme-öncesi ACCEPTED iptal hâlâ tek taraflı.
- **Ödeme taraf dağılımı:** alıcı "Ödemeyi Yaptım" (kaydeder), satıcı "Ödemeyi Aldım/Reddet" — INV-SM-3 ile birebir, iki taraf teyit. **🟢 TEMİZ.**

---

## CC-1 (HEADLINE) — Hedef fiyat ifşası [aggregator koddan doğruladı]

**BULGU:** Alıcının kalem başına girdiği "Hedef/İstenen Birim Fiyat" (`targetUnitPrice` → `targetPrice`), ihaleyi görüp **teklif verebilen herkese** (davetli/bağlı/premium tedarikçi) gösteriliyor. Wizard'da bu alan, yanındaki açıklama/tarih alanlarının aksine **"Tedarikçiye gösterilir" görünürlük etiketi taşımıyor** → kullanıcı dahili bütçe sanabilir.
**KANIT:** `company-listings.service.ts:2166` (`itemsOut` `targetPrice`'ı içerir) + `:2484` (non-owner `masked ? teaser : itemsOut`); maskeleme YALNIZ PUBLIC + bağlı-değil + premium-değil + davetsiz (`:2412`). `teaserItems` (`:2189`) targetPrice'ı null'lar. Wizard alanı `item-detail-modal.tsx:115` — görünürlük hint'i yok. **Aggregator teyidi:** CL:2166/2484 okundu, sızıntı doğrulandı.
**DEĞERLENDİRME:** 🟡 ŞÜPHELİ
**GEREKÇE:** (a) UI↔davranış çelişkisi = kazara ifşa (YÜKSEK, koddan); (b) fiyat çıpalama — hedefi gören tedarikçi gerçek en-iyi yerine hedefin hemen altına teklif verir; çoğu e-tedarikte "tahmini bedel" dahilidir (ORTA/sektörel). SATIS'ta taban/hemen-al zaten alıcıya açık (kabul edilebilir); **ALIM'da hedef-fiyat ifşası daha keskin**.
**ÖNERİ:** (a) `targetPrice`'ı non-owner'dan maskele (teaser gibi) — dahili bütçe yap; VEYA (b) bilinçliyse modale "Bu fiyat tedarikçiye gösterilir" uyarısı ekle. Mevcut hâl (ne maskeli ne uyarılı) en riskli.
**GÜVEN:** kod-yolu **YÜKSEK**; anchoring yargısı ORTA.

---

## Yüzey 1 — ALIM ihale oluşturma (alim-reviewer)

**Ekran özeti:** 5 adım (Tür&Kapsam → Genel Bilgi → Kalemler → Tedarikçiler → Özet). Tür sabit RFQ (auction'a geçiş yalnız "Yeni Tur", bilinçli). Zorunlular: kapsam, ihale adı, ≥1 kategori, ≥1 para birimi + ana birim, teslim şekli, teslimat adresi, kapanış tarihi, ≥1 kalem (ad+miktar+birim), ödeme şekli. Davet **zorunlu değil**.

- **W1 — CONNECTIONS görünürlük modu yok:** `VISIBILITY_VALUES=["PRIVATE","PUBLIC"]` (`form-schema.ts:34`) ama backend `ListingVisibilityDto` PUBLIC/**CONNECTIONS**/PRIVATE (`create-listing.dto.ts:28-32`) + INV-VIS-1 tanımlı. Alıcı "tüm bağlantılarım görsün, tek tek davet etmeyeyim" diyemiyor. 🟡 **YÜKSEK** (FE↔BE). → 3. mod eklensin mi, yoksa backend enum daraltılsın mı.
- **W2 — Teslimat adresi her zaman zorunlu:** `form-schema.ts:186` koşulsuz `.min(1)`; backend `@IsOptional` (`create-listing.dto.ts:295`). Lojistik ihalede rota ayrıca toplanıyor (çift adres); hizmet/yazılım aliminda fiziksel adres yok. 🟡 FE↔BE **YÜKSEK** + pratik ORTA. → lojistik/hizmette gevşet, backend ile hizala.
- **W3 — Teklif geçerlilik süresi yok**, **W4 — KDV dahil/hariç yok:** 🟡 ORTA (genel RFQ pratiği; ikisi de SATIS ile simetrik boşluk).
- **W5 — Davetsiz PRIVATE yayınlanabilir:** `invitedSupplierIds` zorunlu değil (`form-schema.ts:269`); Step4 "sonra davet edebilirsin" (`step-4-review.tsx:203`) ile yayına izin. Sayaç işler, kimse görmez. 🟡 ORTA → publish-confirm'de yumuşak uyarı.
- Küçük: `invitedSupplierIds` FE max50 vs BE ArrayMaxSize(200) asimetri (zararsız); `customQuestion` alanı tanımlı ama render/map edilmiyor (ölü); RFQ'da `autoExtend*` gönderiliyor (backend yok sayar).

## Yüzey 2 — SATIS ihale oluşturma (satis-reviewer)

**CANLI SATIS-özel bug: 0.** Fiyat/kur/asimetri yolları temiz. Doğrulanan 🟢: kur çevrimi taban karşılaştırmasında fail-closed (INV-FX-1); `buyNow > taban` FE↔BE birebir; A7 (taban ALIM'da yok) + A4 (fatura adresi gizli) teyit; ADVANCE teminat yön-doğru (satıcı yükler). Açık kalem: **CC-1** (hedef/örtüşen fiyat kavramları) + W3/W4 simetrik boşluk.

## Yüzey 3 — Siparişler / ALICI (orders-reviewer)

**Butonlar:** İptal Et (PENDING/ACCEPTED/CREATED, gerekçe≥10) · Teslim Aldım (IN_DELIVERY) · Tamamla (DELIVERED && tam-ödeme && bekleyen-ödeme-yok) · Ödemeyi Yaptım (paymentOpen) · Akreditif Açıldı (LC && ACCEPTED). Alıcı satıcı bankasını/faturayı/tüm belgeleri/vadeyi görür.

- **A2 (RESOLVED) — ödeme sonrası iptal:** orders-F1 "para gitti, iade yok" öncülü **koddan çürütüldü**: `cancel()` `confirmedPayments > 0` ise engelliyor (`company-orders.service.ts:544-551`, "iade için destek ekibiyle"). AWAITING engel değil (para henüz onaysız — güvenli). **Kalan:** buton ACCEPTED'te CONFIRMED ödeme varken de görünüyor → tıklanınca 400. 🟢 (para) / 🟡 (UX: butonu grayle veya uyarı). GÜVEN YÜKSEK.
- **O3 — vadeli "şimdi öde" mesajı:** `page.tsx:670-674` DELIVERED && !fullyPaid → "kalanı kaydedin"; vade gelecekte olsa da erken-ödemeye itiyor (vade `payments-card:156`'da ayrıca gösteriliyor). 🟢/🟡 ORTA → "Vade: {tarih}" varyantı.
- **O4 — stepper kozmetik:** DELIVERED'te "Teslim alındı" current gösteriliyor, rozet "Ödeme bekleniyor". 🟢 etki DÜŞÜK.

## Yüzey 4 — Satışlarım / SATICI (sales-reviewer)

**Butonlar:** Kabul Et/Reddet (PENDING) · Gönder/Teslime Hazırla (ACCEPTED, ship-kilidi: LC-kabul + peşin-eşik + bekleyen-ödeme-yok, fatura no zorunlu) · Akreditifi Kabul/Ödeme Bankadan Alındı (LC) · Ödemeyi Aldım/Reddet (AWAITING) · Revizyon Öner/Geri Çek (ACCEPTED && ödeme-yok && LC-açılmamış). Taraf dağılımı INV-SM-3'e uyuyor, buton yanlış tarafta değil.

- **S1 — banka hesabı LC/vesaikte gereksiz zorunlu:** `order-action-modals.tsx:49-56` koşulsuz; LC'de `paymentOpen=false` (alıcı o IBAN'a havale yapmaz). 🟡 FAZLA ORTA → LC'de opsiyonelleştir.
- **S2 — Proforma yok:** `OrderDocType` = DELIVERY|PAYMENT|TEMINAT|LC|INVOICE|OTHER (`use-order-documents.ts:6-12`), PROFORMA yok. LC/peşin akışında alıcının proforma'ya ihtiyacı var; satıcı "Diğer"e gömüyor. 🟡→🔴 (LC/advance). Tip yokluğu YÜKSEK, gereklilik ORTA → PROFORMA tipi + onay-öncesi satıcı kutusu.
- **S3 — kısmi sevk yok:** tek `ship` + tek fatura no. 🟡 ORTA (düşük öncelik).
- **S4 — epsilon 0.01:** `order-payments-card.tsx:73` ön-doldurma; karar değil gösterim. 🟢 etkisiz → `> 0` yeterli.

---

## KAPSAM ENVANTERİ (kontrol edildi ↔ bakılamadı)

**Kontrol edildi (frontend TAM + işaretli backend):** dört yüzeyin tüm ekran/bileşen/hook'ları; wizard 5 adım + modallar; sipariş liste+detay+alt bileşenler; `form-schema.ts`, `create-listing.dto.ts`, `use-order-documents.ts`, `use-company-orders.ts`. **Aggregator ek backend doğrulaması:** `cancel()` CONFIRMED-guard (CO:544-551) + `getOne` targetPrice ifşası (CL:2166/2484).

**Bakılamadı (bilinmiyor, "temiz" denmedi):** `company-orders.service.ts` gövdesi satır-satır (receive/complete/recordPayment gerçek etkileri — INV'lere güvenildi, canlı test yok); `buildPaymentPlan`'in MAL_MUKABILI/CAD/CUSTOM dalları; `mapDetailToForm` (kopya eşlemesi); `staged-documents.tsx`, `publish-confirm-dialog.tsx`, `save-template-dialog.tsx`, `item-question-modal` gövdesi; ilan **düzenleme** yolu (`/company/ilan/[id]/duzenle`). Crossfield raporundaki X-CF-2 (auction FX fail-open baz) ödeme-plan türetmesiyle komşu — bu turda incelenmedi.

**Bu tur kod değiştirmedi.** Aksiyon önerileri yukarıda; hangilerinin uygulanacağı ürün sahibinin kararı.
