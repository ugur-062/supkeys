# KVKK uyumu — operatör listesi (16 Ekim 2026)

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
2. **Yazılı Kişisel Veri Saklama ve İmha Politikası** yazıldı: `/sozlesmeler/saklama-imha` (canlıya aşağıdaki
   kapıyla çıkar). Tablodaki süreleri API'deki saklama işleri uygular (`retention.purge` ve öteki işler).
3. Kullanıcı Sözleşmesi m.8 hesabın kapatılmasını gerçek koşullarıyla yazıyor.

**Metin ile gerçek arasındaki fark, bu listenin konusu.** Metinler mekanizmayı şimdiki zamanla yazar
("standart sözleşmeler değiştirilmeden imzalanır ve beş iş günü içinde Kuruma bildirilir", "erişim kayıtları en
az 1, en fazla 2 yıl saklanır"). Bunlar aşağıdaki adımlar bitince doğru olur.

### Canlı kapısı (BLOKLAYICI — `docs/release-process.md` Kurallar, `docs/launch-checklist.md`)

16 Ekim metinleri (`sozlesmeler/{kvkk,gizlilik,saklama-imha,kullanici}`, `/hesap-silme`, kayıt formu onay
satırları) **aşağıdakilerin TAMAMI bitip `docs/legal/dpa/README.md`'ye işlenmeden `production`'a çıkmaz.**
`main` staging'e kendiliğinden kurulur; canlıya çıkan PR bu dosyaları kapı bitene dek içermez.

1. **SS-2** (1–4. adımlar): tablodaki her veri işleyenle imza + son imzadan itibaren 5 iş günü içinde
   Standart Sözleşme Bildirim Modülü'ne bildirim. Bir sağlayıcı imzalamazsa 4. adım → metin ona göre değişir.
2. **Sentry:** DPA panelden kabul, Data Scrubber + Prevent Storing IP açık (1.1). Aydınlatma m.4 Sentry için
   "çerezler, istek gövdesi, IP adresi ve jetonlar gönderilmeden ayıklanır" der.
3. **Trafik kayıtları** (6. adım 4): erişim günlükleri kapalı R2 kovasına akıyor, yaşam döngüsü 400 gün;
   kovadaki gerçek süre politika satır 5'e rakamla yazıldı.
4. **Apple (APNs):** avukat yanıtı (§10 soru 3) metne işlendi. Bugün Aydınlatma m.4 Apple'ı veri işleyen
   listesinden ÇIKARIR ve yalnız olguyu yazar (ne gider, nasıl kapatılır); aktarım dayanağı cümlesi YOK.
   Yanıta göre: (a) dayanak cümlesi eklenir; ya da (b) anlık bildirim metni genelleştirilir (Açık işler);
   ya da (c) iOS anlık bildirimi canlıda kapatılır.
5. **Yurt dışındaki karşı taraf firma:** avukat yanıtı (§10 soru 5) metne işlendi. Aydınlatma m.4 bugün
   yalnız olguyu yazar; m.8 dayanağı yalnız yurt içi içindir.
6. **Yeterlilik kararı kontrolü:** Kurul aktarım yapılan ülkelerden biri için yeterlilik kararı ilan
   etmişse m.4'teki "yeterlilik kararı bulunmadığından" cümlesi o ülke için değişir.
7. **Kullanıcı Sözleşmesi m.8 bildirimi** (11. adım): mevcut kullanıcılara uygulama içi + e-posta.
8. **Google Workspace** (1.10): CDPA kabul + Türk SCC talebi; sözleşme tarafı unvanı doğrulandı.
9. **Yapay zekâ modelleri** (1.3): canlıda GA model id'leri sabitlendi ve README'ye yazıldı.

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
| Apple (APNs) | Apple Inc. (ABD) | ABD | DPA yok; Apple Developer Program License Agreement (13.10.2026) | — (SS imzalamıyor; **canlı kapısı 4**) |

MX kaydı (16.10.2026, `dns.google` sorgusu): `rothern.com` → `smtp.google.com` — kurumsal e-posta Google
Workspace'te. KVKK başvuruları ve destek yazışmaları (kimlik bilgisi dahil) bu yolla Google'a gider;
Aydınlatma m.4 Google satırı ve politika satır 25 bunu yazar.

Not: hiçbir sağlayıcının DPA'sı ya da AB SCC'si KVKK standart sözleşmesinin yerine geçmez. KVKK'ya atıf
yapan tek metin Google CDPA (Ek-3 "Turkey"); orada da Türkçe SS fiilen sunuluyor mu belli değil.
**Google sözleşme tarafı:** Google Cloud (Vertex), Firebase ve Workspace için sözleşme tarafı aynı olmayabilir
(Google LLC / Google Cloud EMEA Ltd. / Google Ireland Ltd.). GCP Billing › Account management, Firebase
konsolu ve Workspace faturasından oku; tabloya ve Aydınlatma m.4'e (bugün "Google LLC ve bağlı şirketleri")
doğru unvan ve ülke yazılır, SS-2 o tarafla imzalanır.

---

## 1. DPA kabul ve arşiv (sırayla, bugün)

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
   ön-sürüm ad elenir. **Yapılacak:** `render.yaml` ve Render panelinde (api + api-staging) bugün
   `gemini-flash-latest` / `gemini-pro-latest` takma adları var — takma ad ön-sürümü gösterebilir.
   Vertex Model Garden'da (bölge `global`) GA olduğu yazan sürüm id'lerini seç, kişisel veri gönderen her
   özellik (asistan, belge çıkarımı, tedarikçi araması, profil önerisi, içerik çevirisi:
   `CONTENT_TRANSLATION_MODEL`) için panelde sabitle, staging'de dene, `DEFAULT_PRICING`'de fiyatı
   yoksa bana yaz (fiyatsız model de açılışı keser). Seçilen id'leri ve tarihi `docs/legal/dpa/README.md`'ye yaz.
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
   Agreement'ı (13.10.2026) kabul eder (banner çıkıyorsa oradan). APNs için DPA yok — canlı kapısı 4.
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

Araştırmada sekiz sağlayıcıdan hiçbirinin KVKK SS'sini imzaladığına dair kamuya açık kanıt bulunamadı;
reddetme olasılığı yüksek. Seçenekler:

1. Standart sözleşmeyi imzalayan **muadil sağlayıcıya** geçmek.
2. **Türkiye'de barındırılan** bir alternatife geçmek (o zaman aktarım yok).
3. **Taahhütname + Kurul izni** (m.9/4-ç): aktarım ancak izinden sonra başlar (Yönetmelik m.15/3).

**Yapılmayacak:** barındırma, e-posta, hata izleme gibi sürekli hizmetleri "arızi aktarım" istisnasına
(m.9/6) dayandırmak — Yönetmelik m.16/1 ve Kurum rehberine göre süreklilik arz eden aktarım arızi değildir.
Açık rızaya dönmek de çözüm değildir.

Geçiş süresince: reddi yazılı belgele; kalan riski yazılı değerlendir; aktarılan kişisel veriyi en aza
indir (Sentry Data Scrubber + IP saklamama — 1. adım; anlık bildirim metninde kişisel veri olmaması — aşağıda
"Açık işler"; yapay zekâ istemlerinde gereksiz kişisel veri olmaması). **Aydınlatma Metni m.4 o sağlayıcı
için gerçek dayanağı yazacak şekilde değişir — canlıdan önce bana bildir.**

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
4. **Trafik kayıtları en az 1, en fazla 2 yıl** (m.5/3; politika tablosu satır 5). Bugün günlükler yalnız
   sağlayıcı panellerinde ve kısa süre duruyor. **Canlı kapısı 3.** Kur:
   - **ASIL KAYNAK: Cloudflare HTTP requests Logpush** (www, `api.rothern.com` ve `cdn.rothern.com` Cloudflare
     vekilinden geçer) → **R2'de ayrı, kapalı bir kova** (`rothern-access-logs` gibi). Alanlar: `ClientIP`,
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
     altında). 2 yılı geçen nesne olmamalı. Kural kurulunca gerçek süreyi bana yaz: politika satır 5'e
     "En az 1 yıl, en fazla 2 yıl" yerine rakamla (ör. "400 gün (5651: en az 1, en fazla 2 yıl)") yazılır.
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
  silmeyi reddediyor. Politika satır 2 "kapanan firmanın belgeleri silinir" diyor → **canlıda kilit varsa
  kaldır ya da süresini politika ile uyumlu yap**; yoksa firma silmesi belgeleri bırakır (sessizce).
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

## 10. Avukat incelemesi (canlıdan önce)

İncelenecek metinler: `/sozlesmeler/kvkk`, `/sozlesmeler/gizlilik`, `/sozlesmeler/saklama-imha`,
`/sozlesmeler/kullanici` (m.8), `/hesap-silme`, SS-2 ekleri. Sorular:

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
   mı, metne yazılmalı mı (bugün yazılı değil).
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

## 11. Kullanıcı Sözleşmesi m.8 değişikliğinin bildirimi (canlı kapısı 7)

m.8 artık hesabın kapatılmasını koşullarıyla yazıyor (Kurucu devri, son yönetici, süren sipariş / açık talep);
eski metin "dilediği zaman kapatabilir" diyordu. Sözleşme m.11 esaslı değişikliğin bildirileceğini söyler; TBK
m.21 bildirilmeyen aleyhe genel işlem koşulunu "yazılmamış" sayar. Canlıya çıkışta mevcut kullanıcılara
**uygulama içi duyuru + e-posta** (Admin › Duyuru) — değişikliğin özeti ve `/sozlesmeler/kullanici#madde-8`
bağlantısı. Yeniden onay gerekip gerekmediği §10 soru 9.

## Açık işler (kod / karar)

- **Tabloya 16 Ekim'de giren satırlar — süreleri sahibin onayına:** `company_referral_invites` (bağlantı
  daveti; satır 13 ve gece işi: bağlı talep daveti kalmadığında, son gönderim / tıklamadan 1 yıl),
  `company_user_invitations` (satır 22 ve gece işi: kabul edilmeyen davet son değişiklikten 1 yıl),
  `company_complaints` / `company_admin_notes` / `company_blocks` (satır 23: firma açıkken + kapanıştan 10
  yıl, elle), `platform_admins` (satır 24: görev süresince, ayrılınca elle), kurumsal e-posta kutuları
  (satır 25: 3 yıl, elle). Süreler inceleme önerisiyle yazıldı — farklı istersen bana yaz, tablo ve iş
  birlikte değişir.
- **Anlık bildirim metni (canlı kapısı 4 ile birlikte):** bugün push başlığı ve gövdesi uygulama içi
  bildirimin metnidir (firma ve kişi adı geçebilir). Apple / Google'a giden kişisel veriyi azaltmak için
  metni genel tutup ("Yeni bir bildiriminiz var") ayrıntıyı uygulama içinde göstermek mümkün — ürün kararı
  bekliyor; seçilirse Aydınlatma m.4'teki Apple paragrafı "kişisel veri içermeyen genel metin" diye değişir.
- **Bilinen küçük artıklar (kabul edildi):** bildirim 1 yılda silindiği için, bir yıldan uzun uzatılıp
  yeniden 12–72 saat penceresine giren talepte teklifsiz talep uygulama içi hatırlatması ikinci kez çıkabilir
  (e-posta tekilliği `email_logs`'ta, 2 yıl); profil önerisi ömürlük sayacı 5 yıl (AI kullanım kaydı) / 10
  yıl (denetim kaydı) sonra sıfırlanır.
