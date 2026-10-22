# KVKK uyumu — operatör listesi (16 Ekim 2026; yayın kuralı 22 Ekim 2026)

> Kaynak: araştırma `rothern-qa-2026-10/account-deletion/kvkk-research.json` (mevzuat, Kurum duyuruları,
> sağlayıcı sözleşmeleri; resmî bağlantılar aşağıda). Bu belge hukuki görüş değildir; 10. adımdaki avukat
> incelemesinin girdisidir.

## Neden var

16 Ekim 2026 kararı (sahip): "mağazalar ve KVKK kabul etsin".

1. **Yurt dışına aktarım artık açık rızaya dayanmıyor.** Dayanak KVKK m.9/4-c: Kurul'un ilan ettiği
   standart sözleşme, **SS-2** (veri sorumlusundan veri işleyene). Metin değiştirilmeden imzalanır ve
   imzaların tamamlanmasından itibaren **5 iş günü** içinde Kuruma bildirilir. Açık rıza yalnız arızi
   aktarımlar için kalır (m.9/6-a); hizmet ona bağlanmaz. Kayıt formundaki zorunlu KVKK kutusu artık yalnız
   "Aydınlatma Metni'ni okudum" der, sağlayıcı listesi taşımaz.
2. **Yazılı Kişisel Veri Saklama ve İmha Politikası** yazıldı: `/sozlesmeler/saklama-imha` (22.10.2026 sahip
   kararıyla canlıya çıkar). Tablodaki süreleri API'deki saklama işleri uygular (`retention.purge` ve öteki işler).
3. Kullanıcı Sözleşmesi m.8 hesabın kapatılmasını gerçek koşullarıyla yazıyor.

**Metin ile gerçek arasındaki fark, bu listenin konusu.** 22.10.2026'dan beri metinler yalnız yayın günü doğru
olanı yazar ("Rothern … standart sözleşmeyi kullanır: standart sözleşme sağlayıcılara … imzaya sunulur", "erişim
kayıtları en fazla 2 yıl"); bir adım bitince ilgili cümle aşağıdaki B tablosuna göre yükseltilir.

### Yayın sonrası açık adımlar (22.10.2026 sahip kararı)

**Kural (16 Ekim "Canlı kapısı"nın yerine):** `main`'deki her şey 22.10.2026'da canlıya çıkar; 16 Ekim metinleri
(`sozlesmeler/{kvkk,gizlilik,saklama-imha,kullanici,aracilik}`, `/hesap-silme`, kayıt formu onay satırları) dahil.
Canlıdaki her cümle **yayın günü doğru** olmalı: bitmemiş bir hukuki adım metne olmuş gibi yazılmaz (imza, Kurum
bildirimi, süre rakamı, avukat yanıtı, sözleşme tarafı) ve gereksiz itiraf da yazılmaz. Açık adımlar yayından sonra
sürer; biri bitince "yükseltilecek cümle" sütunundaki metin AYNI değişiklikte güncellenir, sayfanın `updatedAt`'i
(Politika'da değişiklik geçmişi satırı da) yazılır ve tamamlanma `docs/legal/dpa/README.md`'ye işlenir. **Sayfaya
sağlayıcı başına "imzalandı / bekliyor" durumu YAZILMAZ** (KVKK m.11 sorusu kvkk@ ile yanıtlanır).

**Sıra:** metinler `production`'a birleştirildiği (merge) anda canlıya çıkar — "yayın günü" o andır, takvim günü
değil. **22.10.2026 sahip kararı:** A-ÖNCE'deki denetimler (A3, A4, A8, A9, A10, A12, A13) merge'den önce biter;
A0, A1, A2, A6 ve A11 merge günü, merge'den hemen sonra yapılır (canlıda o gün 4 iç firma vardı; aynı gün
gönderim metni doğru tutar). Bir maddeyi bitiremeyen o maddenin tuttuğu cümleyi o anın gerçeğine çeker (bana yaz).
22.10.2026 merge öncesi: A4 yapıldı (Kurul'un ilan ettiği yeterlilik kararı bulunamadı; kvkk.gov.tr duyurularından
teyit edilir), A8 iki anahtar `false` (ön sayımdan sonra aynı gün silinir), A10 `0` / `0`, A12 `api` / `cdn` / `www`
yanıtlarında çerez yok.
A-SONRA tablosu yeni kodu ya da canlıdaki yeni metni gerektirir; merge'den hemen sonra, aynı gün yapılır.

#### A-ÖNCE — merge'den önce: metin canlıya çıktığı anda doğru olsun

| # | Operatör ne yapar | Bugün doğru tuttuğu cümle |
|---|---|---|
| A0 | `docs/legal/dpa/README.md` iskeletini oluştur (bu değişiklik dosyayı açmaz): sağlayıcı başına §2'deki sütunlar (belge, sürüm / tarih, kabul tarihi, kabul eden, SS-2 gönderim tarihi, imza ve Kurum bildirim tarihi, sağlayıcıdaki günlük saklama süresi) ve A / B adımı başına satır (tarih, kanıt — ekran görüntüsü / e-posta / PDF yolu —, sahip). Aşağıdaki "README'ye" adımları buraya yazılır. | Bu bölümün kayıt kuralı (her adımın tarih ve kanıtla izlenmesi) |
| A1 | Listedeki yedi sağlayıcıya **tarihli SS-2 talebi**: Sentry; Google (Cloud / Vertex AI, Firebase ve Workspace aynı destek kaydında); Supabase; Resend; Vercel; Render; Cloudflare. Kurum metni değiştirilmeden (§3.1–3.3). Gönderim tarihleri README'ye. | KVKK m.4 "standart sözleşme, sağlayıcılara … metin değiştirilmeden imzaya sunulur"; Gizlilik m.4 "standart sözleşmeyi kullanır"; Politika m.5 "standart sözleşme kullanılır" |
| A2 | **Sentry DPA** panelden kabul + Data Scrubber + Prevent Storing of IP Addresses (§1.1); **Google Cloud CDPA** ve **Workspace CDPA** kabul (§1.3, §1.10); Firebase şartları (§1.2). Tarih + ekran görüntüsü README'ye. **Ayrıca (A2b):** tedarikçi araması Vertex'te "Grounding with Google Search" kullanır (`gemini.provider.ts` `tools: [{ googleSearch: {} }]`); bu hizmetin kendine özgü koşulları var. Google Cloud Service Specific Terms'te Grounding with Google Search maddesini oku: kabul edilen CDPA kapsamında mı (Google orada veri işleyen mi) — sonucu ve bağlantıyı README'ye yaz. Kapsam dışıysa merge'den önce bana yaz (B14 o gün uygulanır ya da arama desteği kapatılır). | KVKK m.4 ve Gizlilik m.4 "kabul ettikleri veri işleme koşulları uyarınca … Rothern'in talimatları doğrultusunda işler" (KVKK m.4 Google satırındaki "tedarikçi araması (Google arama desteğiyle)" dahil); Politika m.5 "veri işleme sözleşmeleri (sağlayıcıların veri işleme ekleri) yapılır"; Politika m.2 "Rothern adına ve Rothern'in talimatlarıyla işletilir" |
| A3 | **Yapay zekâ modelleri GA mı (§1.3):** (1) Render production panelinde `AI_MODEL_DEFAULT` / `VISION` / `PREMIUM` ve `CONTENT_TRANSLATION_MODEL`'in TAM değerini oku. (2) Her id'nin Vertex Model Garden'da (bölge `global`) **GA** olduğunu (Preview / Experimental değil) doğrula — `gemini-3.5-flash` için de: `ai.config.ts`'deki 2026-07-24 notu onu "sürüm-preview" sayar ve `isPreGaModelId` adı `-preview` taşımadığı için onu yakalamaz. GA değilse GA bir id seç (`DEFAULT_PRICING`'de fiyatı olmalı; yoksa bana yaz), staging'de dene. (3) **Yedek model:** kapasite (503 / 429) ve 400 hatasında sağlayıcı aynı isteği `gemini-flash-lite-latest` takma adıyla yeniden dener (`gemini.provider.ts` `FALLBACK_MODELS`; `gemini-3.5-flash`, `gemini-2.5-flash`, `gemini-flash-latest` için). Vertex'te bu ada tek bir deneme isteği at (ör. staging'de geçici `AI_MODEL_DEFAULT=gemini-flash-lite-latest`, sonra geri al): 404 verirse yedek hiçbir veri işlemez; bir modele çözülüyorsa o modelin GA olduğunu doğrula. Ön-sürüme çözülüyorsa B15 merge'den önce yapılır. (4) Üretimin Vertex'i (`GEMINI_SERVICE_ACCOUNT_JSON`) kullandığını doğrula. Id'ler, yedeğin sonucu, kanıt ve tarih README'ye. | KVKK m.4 Google satırı ve "kabul ettikleri veri işleme koşulları uyarınca" (Google'ın veri işleme koşulları yalnız GA modelleri kapsar); API açılışı |
| A4 | kvkk.gov.tr'de Kurul'un yeterlilik kararı duyurularını kontrol et; sonucu tarihiyle README'ye yaz. | KVKK m.4 "yeterlilik kararı bulunmadığından" |
| A6 | `kvkk@` ve `support@` adreslerine dışarıdan deneme e-postası; her adrese adı belli bir sahip. | KVKK m.9, Gizlilik m.6–7, Kullanıcı Sözleşmesi m.8, `/hesap-silme` başvuru yolu ve "en geç 30 gün" |
| A8 | Render production'da **`DATA_RETENTION_PURGE_ENABLED` ve `UNVERIFIED_SIGNUP_PURGE_ENABLED`**: ikisi de tanımsız (production'da açık) ya da `true`. İlk koşuyu önizlemek için merge'den önce `false` yapılırsa ikisi de **aynı gün** yeniden açılır (değişken silinir); hiçbiri yayın gününün ötesinde `false` kalmaz. Ertesi sabah ilk gecenin `system.retention_purge` ve `company.signup_expired` kayıtlarını denetle. | KVKK m.7 ve Gizlilik m.6 "… e-posta adresi doğrulanmayan hesaplar … kendiliğinden silinir"; Politika satır 10 (7 gün, otomatik silme); Politika m.8–10 ("otomatik imha işleri her gün ya da her hafta çalışır") |
| A9 | `ADMIN_2FA_REQUIRED_ROLES` `none` değil (tanımsız ya da SUPER_ADMIN'i içeriyor). | Politika m.5 "en yetkili rolde iki adımlı doğrulama zorunludur" |
| A10 | Salt okur sorgu: `company_users` ve `platform_admins`'te `enc:v1:` ile başlamayan dolu `twoFactorSecret` sayısı; varsa yeniden şifrele ya da o kullanıcılara 2FA'yı yeniden kurdur. | Politika m.5 "iki adımlı doğrulama sırları şifrelenir" |
| A11 | Sentry'de `[KVKK-SILME-BEKLIYOR]` uyarısını adı belli bir kişiye yönlendiren kuralı kur (ileti yeni kodla gelir; kural önceden kurulur). | Gizlilik m.6, KVKK m.7, Kullanıcı Sözleşmesi m.8, Politika satır 2 ve m.9 "en geç 30 gün" |
| A12 | Tarayıcıda `api.rothern.com` ve `cdn.rothern.com` yanıt çerezlerine bak; `__cf_bm` varsa KVKK m.6 çerez listesine "altyapı sağlayıcısının bot koruması çerezi" merge'den önce eklenir (bana yaz). | KVKK m.6 ve Gizlilik m.5 "yalnızca hizmetin çalışması için zorunlu çerezler" ve sayılan çerezler |
| A13 | Supabase › Organization › Legal Documents'ta sözleşme tarafını oku (bugün metin "Supabase Pte. Ltd., Singapur" der); README'ye yaz, farklıysa KVKK m.4 satırı merge'den önce değişir (§1.4). | KVKK m.4 Supabase satırı |

#### A-SONRA — merge'den hemen sonra, aynı gün

| # | Operatör ne yapar | Bugün doğru tuttuğu cümle |
|---|---|---|
| A5 | **Kullanıcı Sözleşmesi bildirimi** (§11): yeni metin canlıda görününce Admin › Duyuru, uygulama içi + e-posta. Özet iki değişikliği söyler: **m.7** (yapay zekâ tedarikçi araması, talep formundaki seçenek açıksa bulunan ve davete uygun firmaları talebi yayımlayan adına kendiliğinden davet eder; talep bazında kapatılır) ve **m.8** (hesabın kapatılması koşulları); yürürlük tarihi 22.10.2026; bağlantılar `/sozlesmeler/kullanici#madde-7` ve `#madde-8`. | Kullanıcı Sözleşmesi m.11 "esaslı değişiklikler Kullanıcı'ya bildirilir" |
| A7 | Canlı R2 kovalarında nesne kilidi yok ya da politika ile uyumlu (§8; kilit ayarı merge'den önce de okunabilir); yeni kodla bir deneme firma silmesiyle belgelerin gittiğini doğrula. | Politika satır 2 "Firma doğrulama belgeleri, kimlik belgesi görüntüleri, logo ve kapak görselleri dosya depolama alanından silinir" |
| A9b | SUPER_ADMIN'ler dağıtımdan hemen sonra 2FA kurar (yeni kod kurulumu zorunlu tutar). | Politika m.5 "en yetkili rolde iki adımlı doğrulama zorunludur" |
| A11b | Admin "KVKK silme bekliyor" süzgeci haftalık takvime (§9). | "en geç 30 gün" sözleri (A11) |
| A14 | Mağazalar: Play / App Store'a ancak `main` canlıdayken ve https://www.rothern.com/en/account-deletion 200 dönerken gönderilir (`docs/store-listing.md`). | Mağaza veri beyanı, hesap silme adresi |

#### B. Yayından sonra sürenler — bitince yükseltilecek cümleler

| # | Açık adım (operatör) | Bitince yükseltilecek cümle(ler) |
|---|---|---|
| B1 | **SS-2:** her sağlayıcıyla imza + son imzadan itibaren 5 iş günü içinde Standart Sözleşme Bildirim Modülü'ne bildirim (§3.4–3.5). | **Hepsi imzalanıp bildirilince:** KVKK m.4 sağlayıcı listesinin altındaki ilk paragraf "Rothern, yukarıda sayılan sağlayıcılara aktarımda … standart sözleşmeyi … kullanır: … imzaya sunulur …" → "yukarıda sayılan sağlayıcılara aktarım, KVKK m. 9/4-c uyarınca Kurul'un ilan ettiği standart sözleşmeye (veri sorumlusundan veri işleyene aktarım) dayanır" + sağlayıcı listesinde her satıra Kurum'a bildirim tarihi; Gizlilik m.4 "… standart sözleşmeyi kullanır" → "… standart sözleşmelere dayanır" ("Standart sözleşmenin nasıl uygulandığı …" yönlendirmesi kalır); Politika m.5 "aktarım … standart sözleşmelerle yapılır". Bir sağlayıcı reddederse §4; sayfaya ret / bekleme yazılmaz, seçilen yol uygulanınca m.4 o sağlayıcının gerçek dayanağını yazar. Testler: `legal-account-deletion.test`, `legal-retention-policy.test`. |
| B2 | **5651 trafik kayıtları:** `api` ve `cdn` için Cloudflare Logpush, www için Vercel Log Drain → kapalı R2 kovası, yaşam döngüsü 400 gün, SHA-256 + zaman damgası manifestosu (§6.4). Bugün 5651 m.5/3'ün "en az 1 yıl" yükümlülüğü karşılanmıyor; metin bunu iddia etmez. | KVKK m.7 "Erişim (trafik) kayıtları: en fazla 2 yıl (5651 sayılı Kanun m. 5/3)" → "400 gün (5651 sayılı Kanun m. 5/3: en az 1, en fazla 2 yıl)"; Politika satır 5: süre sütunu aynı rakam, imha sütunu "Günlüklerin tutulduğu kapalı saklama alanında süre sonunda otomatik silme", veri sütununa günlük kaynak portunu gerçekten taşıyorsa "port"; Politika m.5 son madde "Erişim (trafik) günlükleri IP adresi içerebilir …" → "… IP adresi içerir ve 8. maddedeki tablonun 5. satırındaki süreyle saklanır"; `/hesap-silme` `kept3` TR / EN / RU (+ `pnpm i18n:sync --apply`). |
| B3 | **Apple (APNs):** avukat yanıtı (§10 soru 3). | KVKK m.4 Apple paragrafı ("Apple bu hizmeti kendi koşullarıyla sunar ve yukarıdaki veri işleyen listesinde yer almaz"): (a) dayanak cümlesi eklenir; ya da (b) anlık bildirim metni genelleştirilir (Açık işler) ve paragraf "kişisel veri içermeyen genel metin" der; ya da (c) iOS anlık bildirimi canlıda kapatılır. |
| B4 | **iOS uygulaması App Store'da yayında** (Android de Play'de). | KVKK girişi "Rothern mobil uygulamalarında" → "Rothern iOS ve Android mobil uygulamalarında"; Gizlilik ve Politika girişi "(www.rothern.com web sitesi ile Rothern iOS ve Android mobil uygulamaları)"; `/hesap-silme` `intro` TR / EN / RU; testler `legal-account-deletion.test`, `hesap-silme/__tests__/page.test`. |
| B5 | **Yurt dışındaki karşı taraf firma:** avukat yanıtı (§10 soru 5). | KVKK m.4 ilk paragraf, "… o işlemle birlikte iletilir." cümlesinin ardına m.9 dayanak cümlesi. |
| B6 | **VIES:** avukat yanıtı (§10 soru 6). | KVKK m.4 "Avrupa Komisyonu (VIES): … VIES hizmetinde sorgulanır." paragrafının sonuna dayanak cümlesi; yanıt "aktarım değil" derse paragraf aynen kalır. Gizlilik m.4'teki VIES cümlesi olgu olarak kalır. |
| B7 | **Google sözleşme tarafı** hizmet başına okundu (GCP Billing › Account management, Firebase konsolu, Workspace faturası). | KVKK m.4 Google satırı ara ifadesi "Google LLC (merkezi ABD'de) ve bağlı şirketleri (Google'ın küresel altyapısı)" → hizmet başına taraf (ör. "Google Cloud EMEA Limited (İrlanda) — yapay zekâ ve Google Workspace; Google LLC (ABD) — Firebase Cloud Messaging"); aşağıdaki sağlayıcı tablosu; SS-2 o tarafla. Taraf İrlanda'daysa A4 kontrolü İrlanda için de yapılır. |
| B8 | **Yeterlilik kararı:** Kurul bir aktarım ülkesi için karar ilan ederse. | KVKK m.4 "yeterlilik kararı bulunmadığından" cümlesi bölünür; o ülkedeki sağlayıcının dayanağı KVKK m.9/1. |
| B9 | (Kod kararı) `CompanyUsersService.remove`, `AccountDeletionService.scrubAccount` ve firma anonimleştirmesi (`AdminCompaniesService.deleteOrAnonymize`) `permissions` VE `roles`'u birlikte boşaltır (yalnız `permissions` boşaltmak rol hazır setine düşürür, güvensiz). | Politika satır 1 veri sütununa "… bildirim tercihleri ve izinler", imha sütununda çıkarılan kullanıcının silinenlerine "izinler"; "…; kullanıcının firmadaki yetki bilgisi de hesap kaydında kalır" cümlesi çıkar ("adı, … firma kaydıyla birlikte kalır (2. satır)" kalır); test `legal-retention-policy.test` satır 1. |
| B10 | (Kod kararı) firma silmede ürün görselleri de silinir; `purgeCompanyObjects` hataları Sentry'ye gider. | Politika satır 2 imha sütunu "Firma doğrulama belgeleri, kimlik belgesi görüntüleri, logo ve kapak görselleri …" → "Belge ve görseller dosya depolama alanından silinir". |
| B11 | (Kod kararı) bildirim izni verilmemişken saklı belirteç sunucudan silinir (`push-devices/unregister`) ve şifre değişimindeki `rebindStoredPushToken` izin durumuna bakar (bugün izne bakmadan saklı belirteci yeniden yazar, kaydı tazeler). | KVKK m.4 Apple paragrafı "İzin kapalıyken uygulama, açılışlarda cihaz kaydınızı yenilemez; 30 gün boyunca yenilenmeyen cihaz kaydına anlık bildirim gönderilmez." → "İzin kapalıyken uygulamanın bir sonraki açılışında cihaz kaydınız silinir ve o cihaza anlık bildirim gönderilmez." (izin kapatıldığı an değil). |
| B12 | (Kod kararı) talep sahibine `publicIndexable`, firmaya `publicListingsEnabled` anahtarı (bugün iki kolon yalnız okunur). | Gizlilik m.3 son iki cümle, KVKK m.2 parantezi ve **Aracılık Sözleşmesi m.2 beşinci paragraf** ("Firma, herkese açık bir satın alma talebinin görünürlüğünü talep üzerinde henüz hiçbir teklif (taslak dâhil) oluşturulmamışken önce … iptal ederek pazar yeri sayfalarından kaldırabilir. …"): talep bazında arama motoru dizinlemesini kapatma ve firma ayarlarından tüm taleplerin pazar yerinde görünmesini durdurma eklenir; testler `legal-account-deletion.test` (Gizlilik m.3, KVKK m.2, Aracılık). |
| B13 | (Kod kararı) yönetim panelinde ticari veri OKUMALARI denetim kaydına yazılır. | Gizlilik m.2 "… rol bazlı yetkiyle erişir; yönetim panelinde yapılan değişiklikler denetim kaydına yazılır" → "… ve kayıt altında erişir". |
| B14 | (Yalnız A2b "kapsam dışı" çıkarsa; o durumda merge'den ÖNCE) Grounding with Google Search Google'ın veri işleyen koşulları dışında. | KVKK m.4 Google satırında "tedarikçi araması (Google arama desteğiyle)" ayrı anlatılır: arama sorgusu (kalem adları, kategori, hedef ülkeler) Google'ın kendi koşullarıyla sunduğu arama hizmetine gider; ya da arama desteği kapatılır (kod kararı) ve ifade listeden çıkar. |
| B15 | (Kod kararı) production'da yedek model GA bir sürüme sabitlenir ya da kapatılır (`gemini.provider.ts` `FALLBACK_MODELS` bugün `gemini-flash-lite-latest` takma adına geçer; `isPreGaModelId` takma adı adından yargılayamaz). A3(3) yedeğin ön-sürüme çözüldüğünü gösterirse merge'den ÖNCE. | Metin değişmez; §1.3 "yedek takma ada geçer" notu kalkar ve "üretimde yalnız GA model" kuralı koşulsuz olur (A3(3) her sürümde tekrarlanmaz). |

Cezalar (2026, ikincil kaynak CottGroup; Resmî Gazete'den teyit edilmedi): standart sözleşmeyi bildirmeme
m.18/1-d **90.308 – 1.806.377 TL**; veri güvenliği m.18/1-b **256.357 – 17.092.242 TL**; aydınlatma eksikliği
m.18/1-a **85.437 – 1.709.200 TL**; VERBİS'e kaydolmama m.18/1-ç **341.809 – 17.092.242 TL**.

---

## Sağlayıcı tablosu (Aydınlatma Metni m.4 ile aynı tutulur)

| Sağlayıcı | Sözleşme tarafı (ülke) | Veri yeri | DPA nasıl yürürlükte | SS-2 gönderilecek adres |
|---|---|---|---|---|
| Sentry | Functional Software, Inc. (ABD) | AB (de.sentry.io, Almanya) | **Panelden kabul şart** (DPA v5.1.0) | legal@sentry.io |
| Firebase (FCM) | Google LLC (ABD) | küresel | Firebase konsolunda "Accept Firebase Terms" (DPST 21.08.2024) | Google destek kaydı (3. adım) |
| Google Cloud / Vertex AI | Google (ABD) | `global` (AB'ye sabitli değil) | ToS ile atıfla; ayrıca panelden kabul edilebilir (CDPA 08.06.2026) | Google destek kaydı: CDPA Ek-3 "Turkey" §2.1 |
| Supabase | Supabase Pte. Ltd. (Singapur) | AWS eu-central-1 (Frankfurt) | ToS ile kendiliğinden (DPA "Version 1 — 01.08.2026") | privacy@supabase.io |
| Resend | Plus Five Five, Inc. (ABD) | ABD | ToS ile; Resend önceden imzalı (31.12.2025) | privacy@resend.com (DPA §6.6.4'e atıfla) |
| Vercel | Vercel Inc. (ABD) | fra1 (Frankfurt) + küresel ağ | Pro planla kendiliğinden (17.03.2026, yürürlük 31.03.2026) | privacy@vercel.com |
| Render | Render Services, Inc. (ABD) | Frankfurt | ToS ile kendiliğinden (19.12.2024) | privacy@render.com (DPA §6.6.4'e atıfla) |
| Cloudflare | Cloudflare, Inc. (ABD) | küresel ağ | Self-Serve Agreement'a atıfla (DPA v6.4, 03.04.2026) | legal@cloudflare.com |
| Google Workspace (kurumsal e-posta: kvkk@, support@) | Google — **unvanı doğrula** (Workspace faturası / Admin console › Hesap › Hesap ayarları; Türkiye adresli müşteride Google Cloud EMEA Ltd. ya da Google Ireland Ltd. olabilir) | küresel | Admin console › Hesap › **Yasal ve uygunluk** › Cloud Data Processing Addendum › kabul | Aynı Google destek kaydı (CDPA Ek-3 "Turkey" §2.1) |
| Apple (APNs) | Apple Inc. (ABD) | ABD | DPA yok; Apple Developer Program License Agreement (13.10.2026) | — (SS imzalamıyor; **yayın sonrası B3**) |

MX kaydı (16.10.2026, `dns.google` sorgusu): `rothern.com` → `smtp.google.com` — kurumsal e-posta Google
Workspace'te. KVKK başvuruları ve destek yazışmaları (kimlik bilgisi dahil) bu yolla Google'a gider;
Aydınlatma m.4 Google satırı ve politika satır 25 bunu yazar.

Not: hiçbir sağlayıcının DPA'sı ya da AB SCC'si KVKK standart sözleşmesinin yerine geçmez. KVKK'ya atıf
yapan tek metin Google CDPA (Ek-3 "Turkey"); orada da Türkçe SS fiilen sunuluyor mu belli değil.
**Google sözleşme tarafı:** Google Cloud (Vertex), Firebase ve Workspace için sözleşme tarafı aynı olmayabilir
(Google LLC / Google Cloud EMEA Ltd. / Google Ireland Ltd.). GCP Billing › Account management, Firebase
konsolu ve Workspace faturasından oku; tabloya ve Aydınlatma m.4'e (bugün ara ifade "Google LLC (merkezi ABD'de)
ve bağlı şirketleri") doğru unvan ve ülke yazılır, SS-2 o tarafla imzalanır (yayın sonrası B7).

---

## 1. DPA kabul ve arşiv (sırayla, merge'den önce: A2, A3)

1. **SENTRY — en acil.** Sentry ToS, DPA yokken kişisel veri gönderilmesini yasaklıyor.
   https://sentry.io (EU kuruluş, `de.sentry.io`) › Organization Settings › **Legal & Compliance** ›
   **Data Processing Addendum** (v5.1.0) › Review / Accept. Kabul eden kişi şirket adına yetkili olmalı
   (Owner rolü gerekebilir). Kabul edilen PDF'i ve tarih görünen ekran görüntüsünü arşive koy.
   Aynı oturumda Organization Settings › **Security & Privacy**: **Data Scrubber** açık,
   **Prevent Storing of IP Addresses** açık (kurum düzeyinde; `docs/pre-launch-hardening.md` #5).
2. **FIREBASE (FCM).** Şirketin Google hesabıyla https://console.firebase.google.com › push projesi
   (`rothern-98853`). "Accept Firebase Terms" istemi çıkarsa kabul et; çıkmıyorsa şartlar daha önce kabul
   edilmiştir. Alternatif: https://firebase.google.com/terms › "Accept Firebase Terms". Firebase Data
   Processing and Security Terms (21.08.2024) sayfasının PDF'ini arşive koy.
3. **GOOGLE CLOUD / VERTEX AI.** https://console.cloud.google.com/iam-admin/privacy › Vertex projesini seç ›
   "Cloud Data Processing Addendum" › **Review and Accept › I Accept**. Billing › Account management'ta fatura
   adresinin Türkiye olduğunu doğrula. Sonra Cloud Billing destek kaydı (ya da https://cloud.google.com/contact):
   "CDPA Appendix 3 – Turkey §2.1 kapsamında Turkish SCCs (KVKK Standart Sözleşme – Veri Sorumlusundan Veri
   İşleyene) talep ediyoruz".
   **GA MODEL ŞARTI (Preview / Experimental modeller CDPA dışında):** kod artık iki şeyi zorlar —
   `loadAiConfig` production'da `AI_MODEL_DEFAULT/VISION/PREMIUM`'da `-preview` / `-exp` / `experimental`
   geçen id görürse açılışı keser (Render yeni sürümü sağlık denetimi geçmeden eskisinin yerine koymaz);
   içerik çevirisinin yedek listesinde ön-sürüm yok ve production'da `CONTENT_TRANSLATION_MODEL`'deki
   ön-sürüm ad elenir. **Durum (2026-10-22):** `render.yaml`'da `AI_MODEL_DEFAULT` / `AI_MODEL_VISION` /
   `AI_MODEL_PREMIUM` artık `sync: false` — değer Render panelinden gelir, Blueprint eşitlemesi paneldeki
   sabitlemeyi ezmez. Panelde üçü için `gemini-3.5-flash` olduğu yazılı (çalışma ağacındaki `render.yaml` yorumu),
   ama **ne panel değeri ne bu id'nin GA olduğu doğrulandı**: `ai.config.ts`'deki 2026-07-24 notu
   `gemini-3.5-flash`'ı "sürüm-preview" sayar ve `isPreGaModelId` adı `-preview` eki taşımadığı için onu
   yakalamaz — GA olduğu Model Garden'da doğrulanana dek "GA" yazılmaz (`render.yaml` yorumundaki "GA" notu
   da). Ayrıca **yedek model:** kapasite (503 / 429) ve 400 hatasında sağlayıcı aynı isteği (kişisel veriyle)
   `gemini-flash-lite-latest` takma adıyla yeniden dener (`gemini.provider.ts` `FALLBACK_MODELS`:
   `gemini-3.5-flash`, `gemini-2.5-flash`, `gemini-flash-latest` → `gemini-flash-lite-latest`). `-latest` takma
   adı GA sabitlemesi değildir ve `isPreGaModelId` onu adından yargılayamaz; Vertex'te 404 verip vermediği bu
   ad için ölçülmedi (`gemini-pro-latest` 404 veriyordu). **Yapılacak (merge'den önce, A3):** panel değerlerini
   oku; Vertex Model Garden'da (bölge `global`) her id'nin GA olduğunu doğrula, değilse GA olduğu yazan bir
   sürüm id'si seç ve kişisel veri gönderen her özellik (asistan, belge çıkarımı, tedarikçi araması, profil
   önerisi, içerik çevirisi: `CONTENT_TRANSLATION_MODEL`) için panelde sabitle; staging'de dene;
   `DEFAULT_PRICING`'de fiyatı yoksa bana yaz (fiyatsız model de açılışı keser). Yedek takma adın Vertex'te
   ne yaptığını bir deneme isteğiyle ölç (404 / GA sürüm / ön-sürüm); ön-sürümse B15 merge'den önce. Seçilen
   id'leri, yedeğin sonucunu ve tarihi `docs/legal/dpa/README.md`'ye yaz. `ai.config.ts`'deki eski yorum A3
   sonucuna göre ayrı bir değişiklikte düzeltilir (bu değişikliğin kapsamı dışında). Tedarikçi araması Vertex'te
   Grounding with Google Search kullanır; bu hizmetin CDPA kapsamında olup olmadığı A2b'de okunur.
4. **SUPABASE.** https://supabase.com/dashboard › Organization (rothern) › Settings › **Legal Documents**
   (adres kalıbı `supabase.com/dashboard/org/<slug>/documents`; menü adı panelde doğrulanacak). DPA PDF'ini
   indir; karşı imzalı kopya istiyorsan aynı sayfadan PandaDoc talebini başlat. Sözleşme tarafının
   **Supabase Pte. Ltd. (Singapur)** olduğunu not et.
5. **RESEND.** https://resend.com/settings/documents › önceden imzalı DPA'yı (31.12.2025) indir. Başka işlem yok.
6. **VERCEL.** Team `rothern` › Settings › Billing: plan **Pro** olmalı (DPA Hobby'yi kapsamıyor).
   https://vercel.com/legal/dpa PDF'i. Alt işleyen değişikliği bildirimlerine abone olmak için
   privacy@vercel.com'a e-posta at (DPA bunu şart koşuyor).
7. **RENDER.** Hesabın (workspace) şirket adına açıldığını doğrula. https://render.com/dpa PDF'i. Panelde işlem yok.
8. **CLOUDFLARE.** İşlem yok; https://www.cloudflare.com/cloudflare-customer-dpa/ PDF'i ve Self-Serve
   Subscription Agreement sürümü (12.09.2025).
9. **APPLE.** Account Holder https://developer.apple.com/account › güncel Apple Developer Program License
   Agreement'ı (13.10.2026) kabul eder (banner çıkıyorsa oradan). APNs için DPA yok — yayın sonrası B3.
10. **GOOGLE WORKSPACE (kurumsal e-posta).** Süper yönetici: https://admin.google.com › Hesap › Hesap
    ayarları › **Yasal ve uygunluk** › "Cloud Data Processing Addendum" › kabul (zaten kabul edildiyse
    tarihini not et). Sözleşme tarafının unvanını faturadan oku. Türk SCC talebini 3. adımdaki Google
    destek kaydına ekle ("Workspace hesabımız için de"). PDF + ekran görüntüsünü arşive koy.

## 2. Arşiv klasörü `docs/legal/dpa/`

- `docs/legal/dpa/README.md`: sağlayıcı başına tek satır — belge, sürüm/tarih, kabul tarihi, kabul eden kişi,
  SS-2 durumu (gönderildi / imzalandı / reddedildi / bildirildi + bildirim tarihi), yeniden bildirim takvimi,
  **sağlayıcının kendi sisteminde tuttuğu günlüklerin saklama süresi** (Resend gönderim kayıtları, Sentry olay
  saklama, Vercel / Render / Cloudflare günlükleri, Supabase yedek / PITR penceresi — panelden ya da
  sözleşmeden oku). Politika m.6 bu sürelerin sağlayıcı ayarlarıyla sınırlı olduğunu ve yılda bir gözden
  geçirildiğini söyler; rakamlar burada tutulur.
- `docs/legal/dpa/<sağlayıcı>/`: herkese açık DPA PDF'leri ve kabul ekran görüntüleri.
- **Depoya konmaz:** imzalı SS-2 asılları, imza sirküleri, yetki belgeleri, noter onaylı çeviriler (imza ve
  kişisel veri içerir). Bunlar şirket arşivinde (ör. Google Drive'da kısıtlı klasör) durur; README yalnız
  nerede olduklarını yazar.

## 3. SS-2 talebi, imza ve Kuruma bildirim

1. **Metni indir:** "Standart Sözleşme-2 (Veri Sorumlusundan Veri İşleyene)" — Kurum sitesinde Standart
   Sözleşmeler duyurusu. Araştırma iki adres gösteriyor (`kvkk.gov.tr/Icerik/7929/Standart-Sozlesmeler` ve
   `kvkk.gov.tr/Icerik/7938/...Standart-Sozlesmeler-ve-Baglayici-Sirket-Kurallarina-Iliskin-Dokumanlar...`):
   **indirmeden önce Kurum sitesinde güncel sürümü teyit et.** Metin **hiç değiştirilmez**; yalnız seçimlik ve
   alternatif hükümler seçilir (Yönetmelik m.14/3).
2. **Ekleri doldur** (sağlayıcı başına): aktarılan veri kategorileri ve ilgili kişi grupları, amaçlar
   (Aydınlatma Metni m.4 ile aynı), saklama süreleri (`/sozlesmeler/saklama-imha` tablosu), alt işleyenler
   (sağlayıcının alt işleyen listesi), teknik ve idari tedbirler (politika m.5), Rothern VERBİS'e kayıtlıysa
   VERBİS bilgileri (ekler VERBİS kaydıyla tutarlı olmalı). **Bildirimi kimin yapacağı yalnız metindeki
   seçimlik hükümle belirlenir; metne cümle EKLENMEZ** (değiştirilmiş metin standart sözleşme sayılmaz).
   Belirlenmezse bildirimi veri aktaran (Rothern) yapar.
3. **Gönder:** sağlayıcı tablosundaki adreslere. Adresleri (privacy@ / legal@ …) göndermeden önce her
   sağlayıcının güncel DPA / gizlilik sayfasından **teyit et** — tablodakiler araştırmadan, doğrulanmadı.
   Render ve Resend'de DPA §6.6.4'e atıf yap ("yasa SCC'lerin ayrı imzalanmasını gerektiriyorsa talep
   üzerine imzalanır"; bağlayıcı değil ama dayanak). Google'a 1/3. adımdaki destek kaydından. Her yanıtı ya
   da reddi **tarihli** sakla (hesap verebilirlik).
4. **İmza gelirse:** Türkçe metin (ya da çift sütunlu metnin Türkçe sütunu) iki tarafça **ıslak imza ya da
   güvenli elektronik imzayla** imzalanır; iki taraf da imza tarihini yazar; **geriye dönük yürürlük
   ibaresi konmaz**. Rothern'in imza sirküleri + karşı tarafın imza yetki belgeleri eklenir; yabancı
   belgeler için **noter onaylı Türkçe çeviri**, yabancı resmî belgeler için **apostil**.
5. **5 iş günü içinde bildir:** son imzanın tarihinden itibaren **5 iş günü** içinde
   https://standartsozlesme.kvkk.gov.tr (Standart Sözleşme Bildirim Modülü; VERBİS değil, ayrı hesap
   açılır). Alternatif: KEP ya da fiziki teslim. Eklenir: imzalı nihai metin, imzacıların yetki belgeleri,
   çeviriler, apostil. Bildirim kanıtını (ekran görüntüsü / KEP alındısı) arşive koy; Google için
   bildirim kanıtı Google'a da gönderilir (CDPA Ek-3 §2.1).
6. **Yeniden bildirim takvimi** (her sözleşme için, README'ye): taraf bilgisi değişikliği, sözleşme içeriği
   değişikliği, sözleşmenin sona ermesi, alt veri işleyen değişikliği (SS-2 md. 8(a)), sonraki aktarım
   alıcısı değişikliği (md. 7.7(c)) → ekler güncellenir ve yeniden bildirilir. Sağlayıcıların alt işleyen
   değişikliği bildirimlerine abone ol (Vercel: privacy@vercel.com; diğerlerinin alt işleyen sayfaları).

## 4. Sağlayıcı SS-2'yi imzalamazsa

Araştırmada listedeki sağlayıcıların hiçbirinin KVKK SS'sini imzaladığına dair kamuya açık kanıt bulunamadı;
reddetme olasılığı yüksek. Seçenekler:

1. Standart sözleşmeyi imzalayan **muadil sağlayıcıya** geçmek.
2. **Türkiye'de barındırılan** bir alternatife geçmek (o zaman aktarım yok).
3. **Taahhütname + Kurul izni** (m.9/4-ç): aktarım ancak izinden sonra başlar (Yönetmelik m.15/3).

**Yapılmayacak:** barındırma, e-posta, hata izleme gibi sürekli hizmetleri "arızi aktarım" istisnasına
(m.9/6) dayandırmak — Yönetmelik m.16/1 ve Kurum rehberine göre süreklilik arz eden aktarım arızi değildir.
Açık rızaya dönmek de çözüm değildir.

Geçiş süresince: reddi yazılı belgele; kalan riski yazılı değerlendir; aktarılan kişisel veriyi en aza
indir (Sentry Data Scrubber + IP saklamama — 1. adım; anlık bildirim metninde kişisel veri olmaması — aşağıda
"Açık işler"; yapay zekâ istemlerinde gereksiz kişisel veri olmaması). **Sayfaya ret ya da bekleme durumu
yazılmaz; seçilen yol uygulanınca Aydınlatma Metni m.4 o sağlayıcı için gerçek dayanağı yazacak şekilde değişir
— bana bildir** (yayın sonrası B1).

## 5. VERBİS tespiti (yazılı, her yıl)

- **Muafiyet (2018/87, eşik 2023/1154 ile güncel):** ana faaliyeti özel nitelikli kişisel veri işleme
  olmayan ve **yıllık çalışan sayısı 50'den az VE yıllık mali bilanço toplamı 100 milyon TL'den az** olan
  veri sorumlusu kayıttan muaftır. İki koşul **birlikte** aranır.
- **Nasıl hesaplanır:** çalışan sayısı = tamamlanmış son yılda 12 ayın **en az 7'sinde** (ardışık olması
  gerekmez) Muhtasar ve Prim Hizmet Beyannamesi'nde bildirilen sayı. Bilanço = gelir/kurumlar vergisi
  beyannamesi ekindeki bilançonun **aktif ya da pasif toplamı** (ciro sayılmaz).
- **Yaz:** `docs/legal/verbis-tespit-2026.md` — tarih, çalışan sayısı ve kaynağı, bilanço toplamı ve kaynağı,
  sonuç, tespit eden. Her yıl beyanname sonrası yenile.
- **Eşik aşılırsa:** **30 gün içinde** VERBİS'e kayıt (Sicil Yönetmeliği m.8; https://verbis.kvkk.gov.tr).
  Saklama ve imha politikası o zaman zorunlu olur (bizde zaten yayında); SS-2 ekleri VERBİS kaydıyla tutarlı
  hâle getirilir.
- Muafiyet Kanun'dan muafiyet değildir: aydınlatma, silme, güvenlik ve SS bildirimi yükümlülükleri aynen sürer.

## 6. 5651: yer sağlayıcı bildirimi ve trafik kayıtları

1. **Yer sağlayıcılık bildirimi:** Rothern kullanıcı içeriği (talep, ürün, mesaj, belge) barındırdığı için
   yer sağlayıcıdır. Bildirim kanalı e-Devlet girişli https://yersaglayici.btk.gov.tr — 7590 sayılı Kanun
   (RG 31.07.2026) ile yetki Siber Güvenlik Başkanlığı'na geçti; **başvurmadan önce kanalın hâlâ bu adres
   olduğunu teyit et**. Ceza: 100.000 – 1.000.000 TL (m.5/6).
2. **Tanıtıcı bilgiler (m.3):** künye `/iletisim`'de güncel (unvan, adres, MERSİS, e-posta); **telefon hâlâ
   eksik** (denetim H-8) — numara gelince eklenecek.
3. **İçerik kaldırma prosedürü:** m.8 ve m.9 kapsamında gelen bildirimi kim alır, ne kadar sürede kaldırır —
   bir sayfalık iç prosedür yaz (`docs/legal/5651-icerik-kaldirma.md`).
4. **Trafik kayıtları en az 1, en fazla 2 yıl** (m.5/3 yükümlülüğü). Bugün günlükler yalnız sağlayıcı
   panellerinde ve kısa süre duruyor; metinler yalnız yayın günü doğru olan üst sınırı yazar ("en fazla 2 yıl
   (5651 sayılı Kanun m. 5/3)", politika satır 5). **Yayın sonrası B2.** Kur:
   - **ASIL KAYNAK: Cloudflare HTTP requests Logpush** (`api.rothern.com` ve `cdn.rothern.com` Cloudflare
     vekilinden geçer) → **R2'de ayrı, kapalı bir kova** (`rothern-access-logs` gibi). **www Cloudflare
     arkasında DEĞİL** (Vercel'e doğrudan gelir; `apps/web/src/app/api/client-error/route.ts`): Logpush www
     trafiğini yakalamaz → www için **Vercel Log Drain** → kendi toplayıcımız (Cloudflare Worker ya da Render'da
     koşan hizmet) → aynı kapalı kova da kurulur. Alanlar: `ClientIP`,
     `ClientSrcPort`, `EdgeStartTimestamp`, `ClientRequestHost`, `ClientRequestURI`, `ClientRequestMethod`,
     `EdgeResponseStatus`, `EdgeResponseBytes` (5651'in istediği IP, port, zaman, adres, hizmet). Logpush
     Cloudflare'in kendi hizmeti ve R2 Cloudflare'de → **yeni veri işleyen eklenmez**. **Teyit et:** HTTP
     requests Logpush'u planımızda var mı (bazı planlarda yalnız Enterprise).
   - **Render / Vercel günlükleri bu iş için yetmez:** API'nin Pino erişim günlüğü istemci IP başlıklarını
     bilerek yazmaz (`LOGGED_REQUEST_HEADERS`, MU-12) ve `remoteAddress` Cloudflare / Render vekilidir —
     gerçek istemci IP'si yoktur. Cloudflare Logpush planda YOKSA iki yol, bana yaz: (a) API günlüğüne
     istemci IP'si eklenir (`pinoHttp` `customProps` → `resolveClientIp(req)`; günlük o andan itibaren kişisel
     veri taşır ve YALNIZ kapalı 400 günlük kovaya akmalı) + Render **Log Streams**; (b) başka bir CDN / plan.
   - **Toplayıcı yeni veri işleyen OLMAMALI:** Render Log Streams / Vercel Log Drains bir hedef ister; hedef
     Cloudflare Worker ya da Render'da koşan bir hizmet olmalı ve R2'ye yazmalı. Üçüncü taraf SaaS toplayıcı
     (Datadog, Logtail, Papertrail…) seçilirse o yeni bir yurt dışı veri işleyendir: önce sağlayıcı tablosu,
     Aydınlatma m.4 ve SS-2 + bildirim, sonra akış.
   - **Saklama:** kovada yaşam döngüsü kuralı — öneri **400 gün** (1 yılın üstünde pay, 2 yıl sınırının
     altında). 2 yılı geçen nesne olmamalı. Kural kurulunca gerçek süreyi bana yaz: politika satır 5'teki
     "En fazla 2 yıl (5651 sayılı Kanun m. 5/3)" yerine rakamla (ör. "400 gün (5651 sayılı Kanun m. 5/3: en az 1,
     en fazla 2 yıl)") yazılır; KVKK m.7, politika m.5 ve `/hesap-silme` `kept3` aynı değişiklikte (B2).
   - **Bütünlük:** her günlük dosyanın SHA-256 özeti ve **zaman damgası** ayrı bir manifestoya yazılır
     (2007 tarihli 5651 yönetmelikleri hash + zaman damgası ister); RFC 3161 zaman damgası hizmeti ya da
     Kamu SM zaman damgası kullanılabilir.
   - **Erişim:** kovaya yalnız toplayıcının yazma anahtarı ve sahibin okuma yetkisi; başkası okuyamaz.

## 7. İYS (yalnız pazarlama / ticari elektronik ileti gönderilecekse)

- Bugün `marketingConsent` hiçbir gönderimde okunmuyor (sahip kararı H-2: karşılama ve teşvik e-postaları
  hizmet iletisi sayılıyor). Soğuk davetler (üye olmayan firmalara talep daveti) ve Silver/teşvik içeren
  e-postalar ticari elektronik ileti sayılabilir — **avukat görüşü H-3 bekliyor** (10. adım).
- **Kayıt formundaki onay (16 Ekim):** "Profil ve hizmet iyileştirme" kutusu kaldırıldı (ona dayanan işleme
  yoktu). Tek isteğe bağlı kutu artık belirli amacı söyler: "Rothern'in kampanya ve tanıtımlarına ilişkin
  ticari elektronik ileti almak istiyorum". Aydınlatma m.3 şunu vaat eder: **bu kapsamdaki iletiler yalnız
  onay verenlere ve onay İYS'ye kaydedildikten sonra gönderilir.** Yani ilk kampanya e-postasından ÖNCE:
  İYS hizmet sağlayıcı kaydı, o güne kadar toplanan onayların İYS'ye aktarımı (İYS dışında alınan onay 3 iş
  günü içinde bildirilir; eski onaylar için avukata sor) ve gönderimin `marketingConsent` + İYS ret
  durumuna bağlanması (bana yaz). Hizmete ilişkin bilgilendirme e-postaları (karşılama serisi, haftalık
  özet, doğrulama / paket hatırlatmaları, duyurular) metinde m.5/2-f'ye dayanır — H-3 aksini derse metin ve
  gönderim birlikte değişir.
- İleti ticari sayılırsa: https://iys.org.tr üzerinden **hizmet sağlayıcı kaydı** (gönderim adedi eşiği yok);
  tacir/esnaf alıcıların adresleri **gönderimden önce İYS'ye kaydedilir** ve **ret durumu İYS'den kontrol
  edilir** (Yönetmelik m.6/3, m.6/6); İYS dışında alınan onaylar ve retler **3 iş günü** içinde İYS'ye
  bildirilir; her iletide kolay ve ücretsiz ret bağlantısı (bizde var), ret 3 iş günü içinde uygulanır.
- Resend ile giden işlem e-postalarında (kod, sipariş, bildirim) tanıtım içeriği olmamalı.

## 8. Yedekler ve dosya kovası

- **Yedek döngüsü (politika satır 18):** Supabase planındaki günlük yedek / PITR saklama süresini panelden
  teyit et ve `docs/legal/dpa/README.md`'ye yaz (Pro'da günlük yedek; PITR eklentisi açılırsa 7 gün —
  `docs/pre-launch-hardening.md` Faz 3). Politika sayı yazmıyor, döngüyü söylüyor.
- **Yedekten geri yükleme yapılırsa** (politika m.6): yedeğin alındığı andan sonra silinen hesaplar
  (denetim kaydı `company.user.self_deleted`, `admin.user.erased`) ve imha edilen firmalar yeniden silinir;
  süreye bağlı işler zaten bir sonraki gece kendiliğinden temizler.
- **R2 nesne kilidi (O-14 / B7-4):** staging'de KYC kovasında nesne kilidi, yenilenen belgenin eskisini
  silmeyi reddediyor. Politika satır 2 "firma doğrulama belgeleri, kimlik belgesi görüntüleri, logo ve kapak
  görselleri dosya depolama alanından silinir" diyor → **canlıda kilit varsa kaldır ya da süresini politika ile
  uyumlu yap** (yayın günü A7); yoksa firma silmesi belgeleri bırakır (sessizce; hata yalnız Render günlüğünde).
  Ürün görselleri bugün firma silmede silinmez — metin onları saymaz (B10).
- R2 için ikinci kovaya yedek kopya kurulursa (hardening Faz 3 seçenek a), o kopya da yedektir: aynı döngüyle
  silinmeli.

## 9. Periyodik gözden geçirme (en geç 6 ayda bir; ilki Nisan 2027)

Takvime koy. Her gözden geçirmede:

1. Admin › Firmalar › Askı süzgeci **"KVKK silme bekliyor"**: 30 günü geçen firma kalmamalı
   (`docs/pending-operator-tasks.md` §8).
2. Süresi dolan ticari kayıtlar (politika satır 3; ilk kayıtlar 2037 başında dolar): o tarihe kadar yalnız
   kontrol, sonra elle imha prosedürü.
2a. **Elle imha edilen satırlar (politika 23–25):** moderasyon kayıtları (kapanmış firmanın şikâyet /
    engelleme / yönetici notu, kapanıştan 10 yıl sonra), ayrılan personelin yönetim paneli hesabı (pasif
    hesap silinir; yaptığı işlemler denetim kaydında e-posta adresiyle kalır), kurumsal e-posta
    kutularındaki başvuru ve destek yazışmaları (sonuçlandırılmasından 3 yıl sonra; Rothern'in ticari
    yazışmaları 10 yıl). Her elle imhayı gözden geçirme kaydına tarih, kapsam ve sayıyla yaz (politika m.10).
3. İmha kayıtları: denetim kaydında saklama işinin her gece çalıştığı ve sayılar (admin Sistem › zamanlanmış
   işler; Sentry'de `[CRON-HATA] retention.purge` yok).
4. Politika metni güncel mi (yeni kişisel veri tablosu, yeni sağlayıcı) — değişiklik varsa politikaya
   değişiklik geçmişi satırı.
5. Yılda bir: VERBİS tespiti (5. adım), sağlayıcıların tedbirleri ve alt işleyen listeleri, SS-2 yeniden
   bildirim takvimi.

## 10. Avukat incelemesi (yayından sonra sürer; yanıtlar B3, B5, B6 ile metne işlenir)

İncelenecek metinler: `/sozlesmeler/kvkk`, `/sozlesmeler/gizlilik`, `/sozlesmeler/saklama-imha`,
`/sozlesmeler/kullanici` (m.7, m.8), `/sozlesmeler/aracilik` (m.2), `/hesap-silme`, SS-2 ekleri. Sorular:

1. Her veri seti için Rothern'in rolü: veri sorumlusu mu (SS-2), B2B müşteri adına veri işleyen mi (SS-3)?
2. Supabase sözleşme tarafı Singapur: alıcı ülke olarak Singapur yazılması yeterli mi?
3. Apple APNs: veri işleyen mi bağımsız alıcı mı; FCM → APNs zincirinde rol dağılımı.
4. Soğuk davetler ve yapay zekânın bulduğu adresler: m.5/2-f dayanağı, m.10 bilgilendirme zamanı, 6563 / İYS
   (H-3, H-4, H-6); Almanya / Kanada önceden onay listesi.
5. Yurt dışında yerleşik karşı taraf firmalar: Türkiye'deki üyenin teklif / sipariş / mesaj bilgisi yabancı
   alıcıya (ya da tersi) Platform üzerinden iletilir. Bu, veri sorumlusundan veri sorumlusuna aktarım mı (SS-1),
   ilgili kişinin kendi işlemi mi (Rehber Örnek 1), m.9/6-b mi? Metin bugün yalnız olguyu söylüyor
   (Aydınlatma m.4 ilk paragraf).
6. AB'de yerleşik firmaların KDV numarasının Avrupa Komisyonu VIES hizmetinde sorgulanması — aktarım sayılır
   mı, dayanağı ne? Metin bugün yalnız olguyu söylüyor (Aydınlatma m.4 "Avrupa Komisyonu (VIES)" paragrafı,
   Gizlilik m.4); dayanak cümlesi yanıtla eklenir (B6).
7. Ürün sayfalarındaki YouTube / Vimeo gömülü videolar (ziyaretçi IP'si doğrudan sağlayıcıya gider).
8. Ret kayıtlarının "süresiz" saklanması (politika satır 14) ölçülülük bakımından uygun mu.
9. Kayıt formundaki onay satırlarının yeni ifadesi; Kullanıcı Sözleşmesi m.8'in TBK m.20-25 bakımından
   yeterliliği; sözleşme değişikliğinin yeniden onay gerektirip gerektirmediği (bugün istemiyor; 11. adım
   yalnız bildirir).
10. ETBİS (H-9).
11. **Saklama sebebinin ataması:** firmalar arası talep, teklif, sipariş ve mesajlarda Rothern taraf değil.
    Metin 10 yılı TBK m.146 (ispat, m.5/2-e) ve firmaların TTK m.82 / VUK m.253 kayıtlarına erişimin
    sürdürülmesi (m.5/2-c) ile; m.5/2-ç'yi yalnız Rothern'in kendi defter, belge ve yazışmaları için yazıyor.
    Doğru mu, 10 yıl ölçülü mü?
12. **Aracı hizmet sağlayıcı kayıtları:** 6563 ve E-Ticarette Hizmet Sağlayıcı ve Aracı Hizmet Sağlayıcılar
    Hakkında Yönetmelik (ETBİS, H-9) Rothern'e satıcı kimlik bilgisini daha uzun saklama yükümlülüğü
    getiriyorsa politika satır 2'deki "kapanıştan sonra 30 gün" değişir.
13. **Kimlik belgesi görüntüsü:** doğrulama bittikten sonra silinebilir mi (bugün "firma hesabı açık olduğu
    sürece", satır 2)? Formda ve Aydınlatma m.1'de "din, kan grubu gibi bilgileri yüklemeden önce karartın"
    yazıyor — yeterli mi?
14. **Ticari olmayan e-posta kayıtlarının süreleri** (politika satır 21: güvenlik / doğrulama ve davet 1 yıl,
    öneri / özet / duyuru / karşılama 2 yıl) ve **moderasyon / personel / yazışma** süreleri (satır 23–25)
    ölçülü mü?
15. **22.10.2026 yayın ifadeleri:** KVKK m.4 "Rothern … standart sözleşmeyi kullanır: standart sözleşme
    sağlayıcılara … imzaya sunulur; imzalanan her sözleşme … beş iş günü içinde … bildirilir" (imzalar
    tamamlanmadan aktarım sürerken) ve trafik kayıtlarında "en fazla 2 yıl" — yayın günü doğru ve yeterli mi;
    imzalar gelene kadar aktarımın gerçek dayanağı ne (§4)?
16. **Kullanıcı Sözleşmesi m.9:** sorumluluk "son 12 ayda tahsil edilen hizmet bedeli" ile sınırlı; ücretsiz
    dönemde bu sıfır — TBK m.115 ve genel işlem koşulu denetimi bakımından geçerli mi?
17. **Kullanıcı Sözleşmesi m.7 / m.11:** m.7 "Kullanıcı aleyhine esaslı değişiklikler makul süre önceden
    duyurulur" der; m.7 (otomatik davet) ve m.8 değişiklikleri yayın günü, merge'den hemen sonra (A5)
    duyuruluyor — yeterli mi, yeniden onay gerekir mi (soru 9)?
18. **Kullanıcı Sözleşmesi m.7 yapay zekâ hükmü:** "Kullanıcı'nın kullandığı ya da kabul ettiği öneri, taslak
    ve sonuçların doğruluğunun kontrolü Kullanıcı'ya aittir; içeriklerin otomatik çevirisinde esas olan,
    Kullanıcı'nın girdiği özgün metindir" ve otomatik davetin Kullanıcı adına yapılması — TBK m.20-25 genel işlem
    koşulu denetimi bakımından yeterli mi; çevirinin kullanıcıya gösterilmeden yayımlanması ayrı bir uyarı ister mi?

## 11. Kullanıcı Sözleşmesi değişikliğinin bildirimi (m.7 ve m.8; merge'den hemen sonra A5)

22.10.2026'da Kullanıcı Sözleşmesi iki yerde değişti: **m.7** yapay zekâ tedarikçi aramasının, talep formundaki
seçenek açık bırakılırsa bulduğu ve davete uygun firmaları talebi yayımlayan Kullanıcı adına kendiliğinden davet
ettiğini (seçenek talep bazında kapatılır) ve otomatik çeviride özgün metnin esas olduğunu yazıyor; eski "nihai
karar Kullanıcı'ya aittir" sözü kalktı. **m.8** hesabın kapatılmasını koşullarıyla yazıyor (Kurucu devri, son
yönetici, süren sipariş / açık talep); eski metin "dilediği zaman kapatabilir" diyordu. Sözleşme m.11 esaslı
değişikliğin bildirileceğini söyler; TBK m.21 bildirilmeyen aleyhe genel işlem koşulunu "yazılmamış" sayar.
Yeni metin canlıda görünür görünmez (merge'den hemen sonra) mevcut kullanıcılara **uygulama içi duyuru + e-posta**
(Admin › Duyuru): iki değişikliğin kısa özeti, yürürlük tarihi (22.10.2026) ve `/sozlesmeler/kullanici#madde-7`
ile `/sozlesmeler/kullanici#madde-8` bağlantıları. Yeniden onay gerekip gerekmediği ve m.7'deki "makul süre
önceden" sözü §10 soru 9 ve 17.

## Açık işler (kod / karar)

- **Tabloya 16 Ekim'de giren satırlar — süreleri sahibin onayına:** `company_referral_invites` (bağlantı
  daveti; satır 13 ve gece işi: bağlı talep daveti kalmadığında, son gönderim / tıklamadan 1 yıl),
  `company_user_invitations` (satır 22 ve gece işi: kabul edilmeyen davet son değişiklikten 1 yıl),
  `company_complaints` / `company_admin_notes` / `company_blocks` (satır 23: firma açıkken + kapanıştan 10
  yıl, elle), `platform_admins` (satır 24: görev süresince, ayrılınca elle), kurumsal e-posta kutuları
  (satır 25: 3 yıl, elle). Süreler inceleme önerisiyle yazıldı — farklı istersen bana yaz, tablo ve iş
  birlikte değişir.
- **Anlık bildirim metni (yayın sonrası B3 ile birlikte):** bugün push başlığı ve gövdesi uygulama içi
  bildirimin metnidir (firma ve kişi adı geçebilir). Apple / Google'a giden kişisel veriyi azaltmak için
  metni genel tutup ("Yeni bir bildiriminiz var") ayrıntıyı uygulama içinde göstermek mümkün — ürün kararı
  bekliyor; seçilirse Aydınlatma m.4'teki Apple paragrafı "kişisel veri içermeyen genel metin" diye değişir.
- **Model yorumları (A3'ten sonra, ayrı değişiklik):** `ai.config.ts` 2026-07-24 notu `gemini-3.5-flash`'ı
  "sürüm-preview" sayar; çalışma ağacındaki `render.yaml` yorumu aynı id'ye "GA" der. İkisi çelişiyor ve bu
  değişiklikte düzeltilmedi (kapsam dışı); A3'ün Model Garden sonucu ikisine de işlenir. Yedek modelin GA
  sabitlemesi B15.
- **Bilinen küçük artıklar (kabul edildi):** bildirim 1 yılda silindiği için, bir yıldan uzun uzatılıp
  yeniden 12–72 saat penceresine giren talepte teklifsiz talep uygulama içi hatırlatması ikinci kez çıkabilir
  (e-posta tekilliği `email_logs`'ta, 2 yıl); profil önerisi ömürlük sayacı 5 yıl (AI kullanım kaydı) / 10
  yıl (denetim kaydı) sonra sıfırlanır.
