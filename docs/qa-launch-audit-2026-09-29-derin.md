# Derin Yayın Denetimi — 2026-09-29

> Kullanıcı: "Sistemi baştan aşağı hiçbir şey atlamadan en ince ayrıntısına kadar parça parça kontrol etmelisin. Canlıya çıkacağız, her şeyi kontrol et."
>
> Yöntem: 2026-09-28 bölüm denetiminden BAĞIMSIZ, dosya odaklı tarama. Git'te izlenen testler hariç **1.447 kaynak dosya / 216.030 satır** 97 dilime bölündü; her dilim bir ajana verildi ve her satırı okundu (kapsam mekanik olarak doğrulandı: 1.453 girdi, eksik 0). Üstüne 24 kesitsel tarama (yetki matrisi, yalıtım/RLS/GRANT, sırlar, bağımlılıklar, web↔API sözleşmesi, i18n, şema↔migration, cron, e-posta, bağlantılar, iş kuralları, para, saat, yarış, realtime/yükleme, açık yüzey, oturum, admin, gözlemlenebilirlik, altyapı, AI, uçtan uca yolculuklar, paket kuralları, kayıt/banka/KYC) ve tam kapı koşumu. Her bulgu bağımsız doğrulandı: YÜKSEK 3 mercek (erişilebilirlik · çürütme · etki), ORTA 1 (+2 yükselirse), DÜŞÜK toplu. Toplam 537 ajan. Salt okunur: kod değişikliği, push, canlı/staging erişimi yok.

## Özet

| Önem | Tekil | Ham (doğrulanan) |
|---|---|---|
| ENGEL | **0** | 0 |
| YÜKSEK | **21** | 31 |
| ORTA | **131** | 173 |
| DÜŞÜK | **248** | 300 |
| Dünkü kayıtta zaten olan (bilinen) | 24 | — |
| Doğrulamada reddedilen | 17 | — |

**Yayın kararı:** kod tarafında ENGEL yok; kapılar yeşil. **21 YÜKSEK bulgu yayından önce düzeltilmeli** — çoğu dünkü bölüm denetiminin göremediği sınıftan: EN/RU kullanıcıya özgü yollar (bildirim bağlantısı 404, arama formu dili düşürüyor), Silver'a satılan özelliğin kırık olması, düzenlemede talep şartlarının ezilmesi, kaynak tüketim saldırıları (zip bombası, seyrek xlsx, file-type CVE), CDN'de kalıcı HTML barındırma, şahıs firması TCKN'sinin ifşası, e-posta teslim zinciri (Resend hız sınırı, bounce tipi), web/admin Sentry'nin hiç başlamaması ve runbook'taki tohum betiğinin staging'e yazması.

## Düzeltme durumu (2026-09-29)

21 YÜKSEK bulgu 19 düzeltme birimiyle (U-A1…U-W8) ele alındı. Her birim bağımsız gözden geçirildi; bulgu çıkanlar onarıldı (ikinci gözden geçirme), kalan dört bulgu ikinci turda (R-1…R-4) kapatıldı ve üçüncü gözden geçirmeden "ok" aldı. Commit'ler `git log --oneline 19f2a1ce..HEAD`; push yapılmadı. Operatör adımları `docs/qa-launch-audit-2026-09-28.md` §14.2 O-17…O-26.

| Y | Konu | Durum | Commit (ilk tur · onarım · 2. tur) | Not |
|---|---|---|---|---|
| Y-01 | Public kovaya imzasız presigned PUT | ✅ düzeltildi | 73d31761 | Public kovada presigned PUT Content-Type'ı imzalıyor; HEAD MIME kontrolü ikinci hat; silme hatası loglanıyor. CDN başlık kuralı, eski nesne taraması ve staging yükleme denemesi operatörde (O-21, O-22, O-23). |
| Y-02 | Zip bombası kapısı başlık beyanına güveniyor | ✅ düzeltildi | **5507c878** (kod) · a6978058 (boş kayıt) · 9a276af3 · a6d09191 · dcf23e01 | Her giriş tavanlı olarak gerçekten açılıyor; CEN/EOCD birebir tutarlı olmalı; EOCD'nin altı alanında ZIP64 reddi (9a276af3). Birleşme ve tanımlı ad maliyeti ExcelJS Range/CellMatrix semantiğiyle birebir; sütunsuz uçlu aralıkla atlatma kapandı (R-1). |
| Y-03 | Seyrek xlsx ile milyonlarca Row/Cell (OOM) | ✅ düzeltildi | **5507c878** (kod) · a6978058 (boş kayıt) · 9a276af3 · dcf23e01 | İçe aktarma `eachRow({includeEmpty:false})` + `findCell` kullanıyor. `wb.xlsx.load` sırasındaki mergeCells/definedName açılımı 9a276af3 + dcf23e01 ile bütçeleniyor, `dataValidations` ayrıştırılmıyor. |
| Y-04 | file-type@16 ASF sonsuz döngü (CVE) | ✅ düzeltildi | 07a719ba · f13dc504 · f77e81af | file-type bağımlılığı kaldırıldı, tür imza baytlarından tanınıyor. HEIC piksel kapısı çözmeden önce, grid/iovl tuvalini de sayıyor (f13dc504). Tavan 25 MP, süreç genelinde tek çözme yuvası var, sıra 30 sn'de dolarsa 429 (R-2). Kalan risk: 25 MP 512 MB konteynerde OOM'a karşı kesin güvence değil (O-8 izleniyor). R-2 gözden geçirmesinin tek düşük bulgusu olan `ai-extract-router.ts` yorum düzeltmesi yapılmadı. Yeni i18n anahtarlarının en/ru durum kayıtları 4672f6b4'e karıştı. |
| Y-05 | AI yükleme ucu GOLD kilitli | ✅ düzeltildi | c0b92091 · 234459ae | `company/ai/uploads/url` SILVER oldu; belge → talep GOLD kapısı servise taşındı; asistan eki kapıları oturum açılmadan önce çalışıyor. |
| Y-06 | Şahıs firması TCKN'si başka firmalara açık | ✅ düzeltildi | 968a1df6 | Görünürlük tek kaynaktan: `visibleTaxNumber`. |
| Y-07 | PATCH company/items/:id moderasyonsuz | ✅ düzeltildi | 2a5f7cc7 | İçerik değişince PENDING'e düşüyor, vitrinde kalıyor. Şartname/marka/MPN'nin de içerik sayılması ürün kararı bekliyor. |
| Y-08 | Toplu e-posta sınırsız eşzamanlı | ✅ düzeltildi | 2171890b · da98caca | Süreç içi kısıcı (öncelik + jeton kovası), 429/5xx yeniden denemesi Idempotency-Key ile, cron'lar aynı süreçte üst üste binmiyor. Resend limiti operatörde (O-20). |
| Y-09 | Bounce tipi Resend ile eşleşmiyor | ✅ düzeltildi | b80fa7dc | `normalizeBounceType` → hard/soft/undetermined. Gerçek yük staging'de doğrulanacak (O-24). |
| Y-10 | Ülke süzgeci embargo OR'unu eziyor | ✅ düzeltildi | 5942081f | Süzgeçler `AND: [kapı, ...]` ile katılıyor; regresyon testi var. |
| Y-11 | Tüm girişler tek sunucu IP'sinden | ⚠️ kısmi | de6e1538 · cb056e89 · d341c4c5 | Kod tamam: `sb_secret_` anahtarıyla istemci IP'si `Sb-Forwarded-For` ile iletiliyor, hata sınıfları ayrıldı, tanınmayan anahtar yok sayılıyor (R-3). Asıl koruma, operatör anahtarı girip kotayı yükseltene kadar devreye girmiyor (O-17…O-19). Sb-Forwarded-For davranışı Supabase belgelerine dayanıyor, staging'de doğrulanmadı. |
| Y-12 | Web/admin sunucu Sentry'si başlamıyor | ✅ düzeltildi | 13260228 | `src/instrumentation.ts`; son kapıda `.next/server/instrumentation.js` web ve admin'de üretiliyor. Olay düşmesi staging'de doğrulanacak (O-25). |
| Y-13 | EN/RU'da bildirim CTA'sı 404 | ✅ düzeltildi | **5507c878** | `notificationHref` ile iç yola indiriliyor. Commit karışması için aşağıdaki nota bakın. |
| Y-14 | Kalem kıyası kalem para birimini yok sayıyor | ✅ düzeltildi | 806c0e77 | Kalem fiyatı kendi biriminde gösteriliyor, TRY karşılığı API ve web'de aynı formülle hesaplanıyor. Rapor genel toplamı `totalTry`; bu yorum ürün onayı bekliyor. |
| Y-15 | Dosyalı teklifte "gönderildi"de takılma | ✅ düzeltildi | 43cf21c9 · c0089921 | Durum ekranı `submitPhase`'e bağlandı; LOST teklife dosyalı yeniden teklif açıldı. c0089921 yalnız testi düzeltiyor (sonner `info` sahtesi). |
| Y-16 | Muadil beyanı alıcıya görünmüyor | ✅ düzeltildi | f5792147 | `AlternativeOfferNote`; RFQ kart görünümü `renderItemExtras`; yeni kalemlerde `alternativeAllowed: true`. |
| Y-17 | Arama formları dil önekini düşürüyor | ✅ düzeltildi | a66b02bb | Dizin SearchForm, typeahead, firma içi ürün araması ve PanelHeroSearch `localizePath` kullanıyor. |
| Y-18 | Bağlantısız firmayla ilk sohbet derin linki | ✅ düzeltildi | c139c861 · dea36793 · b9111210 | Panel her zaman çiziliyor, e-posta CTA'sı `&portal=` taşıyor. Portalsız linkte yön bir kez sabitleniyor (dea36793); sabitleme yalnız portal=null + iki taraf izinli + konuşmalar yüklüyken yapılıyor, bayat izinde açık `?portal` ezilmiyor (R-4). |
| Y-19 | Düzenleme/kopya/şablonda şartlar eziliyor | ✅ düzeltildi | 4672f6b4 | `initialRequestFormValues(kind)`. Kopyada görünürlüğün de tohumdan gelmesi ürün kararı bekliyor. |
| Y-20 | Yayındaki talebi düzenlerken Yayınla 400 | ✅ düzeltildi | 4672f6b4 | OPEN talepte "Değişiklikleri kaydet" (PATCH + davetler hemen); `publish` çağrılmıyor. |
| Y-21 | Geo betikleri ENV_FILE okumuyor | ✅ düzeltildi | b3dd5bc8 | Paylaşılan `script-env.ts` ilk satırda hedef host/ref'i basıyor. Şehir dizini boşken 5 dk'da bir yeniden deniyor, yani seed sonrası yeniden başlatma gerekmiyor. Runbook §15.2 adım 2 ve 7 güncellendi (O-26). |

**Commit karışması:** 5507c878 ("fix(web): bildirim CTA'sı … Y-13") paylaşılan git index'i yüzünden iki düzeltmeyi birlikte taşıyor. Birincisi Y-13 web düzeltmesi (7 `apps/web` dosyası). İkincisi Y-02/Y-03 API kodu: `zip-inspect.ts`, `bid-import.service.ts`, `listing-item-import.service.ts` ve `zip-inspect.spec.ts`, `listing-item-import.spec.ts`, `bid-import.spec.ts`. a6978058 yalnız Y-02/Y-03 mesajını taşıyan BOŞ bir kayıt commit'i. **5507c878'i geri almak Y-13 ile birlikte Y-02/Y-03 güvenlik düzeltmesini de geri alır**; bisect'te atlanırsa ikisi birlikte atlanır. Benzer bir durum 4672f6b4'te (Y-19/Y-20) var: Y-04'ün iki i18n durum kaydını da taşıyor (`api.ai.gorselCozunurluguCokYuksek`, `api.ai.gorselOkunamadiDosyaBozukOlabilir`, en/ru; katalog satırları 07a719ba'da). Bu commit tek başına geri alınırsa bu iki kayıt da gider. Geçmiş yeniden yazılmadı (bkz. karar 2).

**Birimler içinde kapanan yakın ORTA bulgular** (M numaraları kararlı olmadığından başlıkla anılıyor):
- "HEIC çözme piksel sınırı olmadan yapılıyor; görsel bombası sharp'ın 60MP kapısından önce belleği tüketiyor": 07a719ba · f13dc504 · f77e81af (Y-04 ile).
- Bozuk ya da 60 MP üstü görsel ve bozuk HEIC'te sharp/heic-convert hatasının 500 dönmesi: artık 400 dönüyor (07a719ba). Doğrulama kimliği S016; raporda ayrı başlığı yok.
- "Advisory lock aynı oturumda yeniden girişli: aynı örnekte üst üste binen cron koşuları engellenmiyor (dış davet çift gönderimi)": `runExclusive` süreç içi koşu kümesi (da98caca).
- "Şehir dizini yalnız açılışta yükleniyor, runbook tohumlamayı API açıldıktan sonra yapıyor": b3dd5bc8.
- "Supabase zayıf/sızmış parola reddi 503 'birazdan tekrar deneyin' olarak dönüyor": artık 400 `WEAK_PASSWORD` (de6e1538).
- "Portal parametresiz e-posta linki mesajı yanlış yönde (boş konuşma) açıyor": c139c861 · dea36793 · b9111210.
- "Düzenlenen talebin içeriği yeni talep formuna 'taslak' olarak sızıyor": düzenleme kipinde otomatik taslak yazılmıyor (4672f6b4).
- "Elendikten sonra yeniden teklifte yeni dosya eklenirse gönderim çıkmaza giriyor": 43cf21c9.
- "Ana akış (kapalı zarf RFQ) kart görünümünde muadil beyanı alanları hiç çizilmiyor": f5792147 (yeni/Excel/katalog kalemlerinde eksik `alternativeAllowed` de burada düzeldi).
- "Tedarikçinin kendi teklif özetinde kalem fiyatları teklifin ana birimiyle etiketleniyor", "Teklif karşılaştırma matrisinde farklı para birimleri etiketsiz yan yana basılıyor" ve "Tur geçmişi penceresi her teklifi ilanın birimiyle gösteriyor (teklif birimi yok sayılıyor)": üçü de 806c0e77'de.
- YÜKSEK maddelere "Aynı kök" olarak taşınan üç ORTA da kapandı: admin e-postalı duyurusu (Y-08, 2171890b), kritik bounce alarmı (Y-09, b80fa7dc) ve firma içi ürün arama formu (Y-17, a66b02bb).

### Kullanıcı kararı bekleyenler

Her maddede Claude'un uyguladığı varsayılan yazılı; karar farklıysa küçük bir takip işi gerekir.

1. **xlsx açılım tavanları:** `XLSX_LIMITS` hâlâ 60 MB toplam / 40 MB tek giriş açılmış boyuta izin veriyor. Bu sınır zip bombasını kesiyor. Ancak yoğun 40 MB sheet XML'i (~2M hücre) 512 MB instance'ı zorlayabilir. *Varsayılan:* değiştirilmedi. Düşürmek (ör. 20/16 MB) AI tablo çıkarımında büyük dosya kabulünü etkiler.
2. **5507c878 ikiye bölünsün mü** (push öncesi, rebase gerektirir)? *Varsayılan:* bölünmedi; boş kayıt commit'i a6978058 ve yukarıdaki not yeterli sayıldı. Bölmek için çalışma ağacı temizken `git rebase -i 5507c878~1` çalıştırılır: 5507c878 `edit`, a6978058 `drop` yapılır. Ardından 7 web dosyası Y-13 mesajıyla, 6 API dosyası a6978058'in mesajıyla ayrı ayrı commit edilir.
3. **Asistan belge eki Silver'da:** *Varsayılan:* GOLD'da kaldı (talep AI'ı). Silver'da sunucu 403 dönüyor, ataç gizli. Silver'da başka amaçla (ör. belgeden fiyatlama) istenirse ayrı ürün işi gerekir.
4. **Asistan boş durum metni** tüm paketlerde "belge yükleyin" diyor. *Varsayılan:* dokunulmadı; Silver'da ataç olmadığı hâlde metin aynı kaldı.
5. **Duyuru e-postası sonucu admin arayüzünde gösterilsin mi?** *Varsayılan:* e-postalar bulk kuyruğuna alınıyor, HTTP isteğinde beklenmiyor. Yanıt `emailQueued` dönüyor, sonuç `admin.announcement.email_completed` audit'ine yazılıyor; arayüz bunları göstermiyor.
6. **Web'de 400 `WEAK_PASSWORD`:** API yerelleştirilmiş mesaj dönüyor. *Varsayılan:* kayıt, sıfırlama ve davet formlarının bu mesajı gösterip göstermediği denetlenmedi (web'e dokunulmadı).
7. **Katalog kaleminde şartname/marka/MPN içerik sayılsın mı** (Y-07)? *Varsayılan:* sayılıyor, değişince yeniden incelemeye düşüyor (üçü de herkese açık sayfada görünüyor). CLAUDE.md'deki eski içerik listesi bu üçünü saymıyordu.
8. **Kopya ve şablonda görünürlük** (Y-19)? *Varsayılan:* tohumun ticari şartları görünürlük dahil korunuyor; PRIVATE talebin kopyası PRIVATE açılıyor. Aksi istenirse yalnız visibility profilden alınabilir.
9. **OPEN talep düzenleme ekranındaki davet açıklaması:** metin hâlâ "Talep yayınlanınca … gider" diyor, oysa davetler artık kaydet anında gidiyor. *Varsayılan:* metin değişmedi (yeni i18n anahtarı gerekir).
10. **LOST teklife dosyalı yeniden teklif** (Y-15): teklif önce DRAFT'a çekiliyor. Yükleme düşer ve tedarikçi sayfayı terk ederse teklif DRAFT kalıyor, eleme gerekçesi son gönderime kadar duruyor. *Varsayılan:* bu davranış kabul edildi. Alternatif: sunucu LOST teklife de belge eklemeye izin verir.
11. **Teklif karşılaştırma raporunda "Genel toplam"** (Y-14): *Varsayılan:* rapor biriminde (`totalTry`). Ham tutar yalnız "Teklif para birimlerini göster" açıkken ikinci satırda çıkıyor; `showBidCurrencies`'in anlamı değişti.

Karara dönüşmeyip operatöre taşınan sorular (Resend limiti, Supabase kota değeri, Sb-Forwarded-For'un staging'de doğrulanması) O-17…O-20'de. U-A2'nin HEIC tavanı sorusu (50 MP mı, 25 MP mı) R-2'de 25 MP ile kapandı.

### Regresyon

- **İlk kapı (HEAD 806c0e77):** 7 kapının 6'sı yeşil. `i18n:check` cırcırı 5 API dosyasında tabanı aştı: yeni Türkçe günlük ve iç hata literalleri (2171890b, da98caca, 73d31761, 9a276af3, 5507c878). a6d09191 bu metinleri İngilizce ASCII'ye çevirdi; cırcır yeşile döndü.
- **Son kapı (HEAD a6d09191), 11/11 yeşil:** typecheck 7/7 paket temiz. Lint 0 hata (uyarılar: api 27, web 66, admin 7). `i18n:check` yeşil: tr 7.599 anahtar, en/ru %100, cırcır 101 dosya / 860 literal. **API jest 254 dosya / 2.656 test**, 2 suite LIVE bayrağı yokken tasarım gereği atlanıyor. **Web vitest 191 dosya / 1.138 test**, **admin 21 / 105**, **i18n 8 / 39**. api, web ve admin derlemeleri geçti; `.next/server/instrumentation.js` web ve admin'de var. `git status` temiz.
- **Önceden var olan kararsız test:** `test/integration/dashboard-analytics.spec.ts` "DashboardAnalyticsService (DB) › dolu senaryo" ilk koşuda bir kez düştü (pipeline `submitted` 1 beklenirken 0). Üç yeniden koşuda geçti: tek başına 9/9, parti iki kez 80/80. Olası neden servisteki `end = new Date()` ile DB'deki `createdAt @default(now())` arasındaki zaman yarışı. Düzeltme commit'lerinin hiçbiri bu dosyalara dokunmuyor; son dokunan f1737115.
- **İkinci tur (R-1…R-4: dcf23e01, f77e81af, d341c4c5, b9111210) son kapıdan SONRA geldi.** Her biri kendi hedefli testleriyle doğrulandı ve gözden geçirmeden "ok" aldı. Tam kapı bu dört commit'le yeniden koşulmadı; yukarıdaki toplamlar onların eklediği testleri içermiyor. Push'tan hemen önce tam regresyon (runbook §15.1 madde 3) bu yüzden şart.

## Kapılar (hepsi yerel, 2026-09-29)

| Kapı | Durum | Özet |
|---|---|---|
| 1. Git durumu | ✅ | Çalışma ağacı temiz (0 satır). main, origin/main'in 79 commit, origin/production'ın 131 commit önünde (push edilmemiş). HEAD 5c441986. Log: gates/01-git.log |
| 2a. Typecheck shared | ✅ | 0 hata (artımlı ve artımsız). |
| 2b. Typecheck i18n | ✅ | 0 hata. |
| 2c. Typecheck email | ✅ | 0 hata. |
| 2d. Typecheck db | ✅ | 0 hata. |
| 2e. Typecheck api | ✅ | 0 hata (22 sn). |
| 2f. Typecheck web | ✅ | 0 hata (46 sn). |
| 2g. Typecheck admin | ✅ | 0 hata. |
| 2h. Paket dist tazeliği | ✅ | Tüketicilerin kullandığı dist çıktıları kaynakla güncel; yalnız shared/dist'te kaynağı silinmiş yetim dosyalar (admin/, schemas/, product-import, cookie-names, tender-number, supplier-sectors) ve currencies.d.ts'te union sırası farkı (zararsız). |
| 3a. Lint api | ✅ | 0 hata, 27 uyarı (25 no-unused-vars, 1 no-explicit-any, 1 diğer). |
| 3b. Lint web (next lint) | ✅ | 0 hata, 67 uyarı (56 no-unused-vars, 9 react-hooks/exhaustive-deps, 1 no-img-element, 1 jsx-a11y/role-has-required-aria-props). |
| 3c. Lint admin (next lint) | ✅ | 0 hata, 7 uyarı (6 no-unused-vars, 1 no-img-element). shared/i18n/email/db paketlerinde lint script'i yok. |
| 4. i18n kapısı | ✅ | tr 7577 anahtar; en %100 ve ru %100 (eksik/bayat/makine 0); cırcır 102 dosyada 866 literal = taban. 'i18n kapısı yeşil'. |
| 5a. API jest (25 parti × 10 dosya, --runInBand, yerel docker test PG) | ✅ | 247 dosya: 245 geçti, 0 başarısız, 2 atlandı (ai-assistant-live.spec, ai-live-smoke.spec — LIVE env yokken bilinçli describe.skip). 2520 test: 2518 geçti, 0 başarısız, 2 bekleyen. Docker test DB (rothern-postgres-test) zaten ayaktaydı. Log: gates/05-api-batch-*.log/json, 05-api-summary.log |
| 5b. Web vitest | ✅ | 180/180 dosya, 1070/1070 test geçti (198 sn). |
| 5c. Admin vitest | ✅ | 20/20 dosya, 100/100 test geçti. |
| 5d. i18n vitest | ✅ | 8/8 dosya, 39/39 test geçti. Başka paket test script'i yok; apps/web/e2e Playwright spec'leri staging/prod hedefli olduğu için koşulmadı (kural gereği). |
| 6a. API üretim derlemesi | ✅ | tsc --incremental false başarılı (29 sn), dist/main.js üretildi. Çalıştırılmadı (kök .env staging DB'ye bakıyor). |
| 6b. Web üretim derlemesi | ✅ | Next 15.5.25, derleme 63 sn, 239/239 statik sayfa üretildi, OOM yok. NEXT_PUBLIC_API_URL=localhost:4000 (.env.local) ve yerel API çalışmadığından statik üretimde 47 'fetch failed ECONNREFUSED 127.0.0.1:4000' logu var; sayfalar hatayı yutup derleme geçiyor (yerel eser — gerçek API ile doğrulanmadı, s |
| 6c. Admin üretim derlemesi | ✅ | Başarılı (95 sn), 3/3 statik sayfa. 1 CSS uyarısı: globals.css'teki Google Fonts @import kuralı tailwind'den sonra geldiği için üretim CSS'inden düşüyor (bulgu olarak raporlandı). |
| 7a. prisma validate | ✅ | Şema geçerli (prisma 6.19.3). |
| 7b. prisma format (kontrol, geçici kopya + diff) | ⚠️ | prisma 6.19.3'te --check yok; kopya biçimlenince 566 satırlık diff (182 satır kaldırılan) çıkıyor: hizalama, @@index yer değişimi, alan sırası ve /** */ tek satırlık doküman yorumlarının açılması; formatlayıcı bazı yorumları bozuyor ('* /** ...'). Anlamsal şema değişikliği yok. CI'da format kapısı y |
| 7c. Şema drift (migrate diff) | ✅ | 'No difference detected.' (97 migration). Gölge DB yerel test konteynerinde geçici oluşturuldu ve sonra DROP edildi; rothern_test kullanılmadı. |
| 8. Odak/atlama işaretleri | ✅ | 0 .only/fit/fdescribe. 5 skip: 2 API canlı AI spec'i (LIVE koşullu describe.skip), 3 Playwright e2e'de veri yoksa koşullu test.skip. xit/xdescribe 0. |
| 9. Bağımlılık denetimi (CI kapısı) | ✅ | Yüksek/kritik 0 (çıkış 0). 10 uyarı: 3 düşük (webpack×2, esbuild) + 7 orta (file-type×2, @nestjs/core, uuid, @opentelemetry/core, multer 2.3.0 YENİ). CLAUDE.md 6 orta diyor; multer uyarısı belgelenmemiş. |
| 10. Son git durumu | ✅ | 0 satır — izlenen dosyada değişiklik yok (yalnız gitignore'lu dist/.next/tsbuildinfo üretildi). |

Not: `prisma format` farkı yalnız biçim (anlamsal değişiklik yok, CI kapısı yok). Web derlemesi yerel API kapalıyken yapıldı (47 ECONNREFUSED günlüğü yerel eser).

## YÜKSEK — yayından önce

### Y-01 — Public kovaya presigned PUT yapılıp commit çağrılmazsa HTML/SVG cdn.rothern.com'da kalıcı olarak yayında kalıyor (Parça 5 #1 düzeltmesi aşılabiliyor)

- **Yer:** `apps/api/src/common/company/public-image-upload.ts:58` · **Bulan:** X15 · **Doğrulama:** 3/3
- **Sorun:** requestPublicImageUpload ve requestPublicDocumentUpload public kova için presigned PUT üretiyor, ama SDK content-type'ı imzalamıyor (s3-request-presigner prepareRequest içinde unsignableHeaders.add('content-type')). Gerçek tip kontrolü (assertUploadedObjectValid) yalnızca istemci kendi isteğiyle resolve uçlarını çağırırsa çalışıyor; nesne ise PUT biter bitmez bilinen CDN adresinde herkese açık oluyor. Ayrıca belgelenmiş R2 nesne kilidi DeleteObject'i reddediyor ve silme hatası sessizce yutuluyor, yani commit çağrılsa bile uymayan nesne kovada kalıyor. Parça 5 #1 (HIGH) belgede kapatıldı olarak işaretli ama bu yol hâlâ açık.
- **Senaryo:** company:manage yetkisi olan herhangi bir yeni firma sahibi POST /company/profile/image/upload-url {kind:'logo',fileName:'a.png',mimeType:'image/png'} çağırır. Dönen URL'e 'Content-Type: text/html' başlığıyla sahte bir giriş sayfası PUT eder ve /resolve'u hiç çağırmaz. Sonuçta https://cdn.rothern.com/prod/tenant-profile/<id>/logo-<uuid>-a.png text/html olarak servis edilir. Bu, markanın alan adında kalıcı phishing/XSS demektir: sayfa .rothern.com ile same-site olduğu için rk_csrf okunabilir, çerezler ezilebilir (cookie tossing) ve kurbanın çereziyle WS bağlantısı açılabilir.
- **Düzeltme:** generatePresignedPut içindeki getSignedUrl çağrısına signableHeaders: new Set(["content-type"]) ekleyerek imzayı allowlist'teki MIME'a bağlayın. Buna ek olarak ya yüklemeyi private bir staging anahtarına yapıp magic-byte doğrulamasından sonra sunucu tarafında sabit ContentType ile public kovaya kopyalayın, ya da cdn.rothern.com için Cloudflare'de image/pdf dışındaki her şeye "X-Content-Type-Option

### Y-02 — Zip bombası kapısı zip dosyasının kendi beyan ettiği açılmış boyuta güveniyor; sahte başlıklı xlsx ile JSZip her şeyi belleğe açıyor ve 512MB instance OOM ile çöküyor

- **Yer:** `apps/api/src/common/files/zip-inspect.ts:53`, `apps/api/src/common/files/zip-inspect.ts:68` · **Bulan:** S020, X15 · **Doğrulama:** 3/3
- **Sorun:** inspectZip açılmış boyutu yalnızca merkezi dizindeki (CEN) uncompressed alanından okuyor; bu alan saldırganın kontrolünde. ExcelJS xlsx.load, JSZip.loadAsync ile her girdiyi tamamen belleğe açıyor (entry.async('string'/'nodebuffer')). JSZip beyan edilen boyutla gerçek boyutu yalnızca açma BİTTİKTEN sonra karşılaştırıyor (compressedObject.js:36-39). Render starter (512MB) tek süreçli olduğundan tek bir istek tüm kiracılar için API'yi düşürüyor. Parça 2 #4 kapatıldı diye işaretli, ama bu yolla kapı aşılabiliyor.
- **Senaryo:** Saldırgan bir xlsx hazırlar: xl/worksheets/sheet1.xml girdisinin CEN ve yerel başlığında uncompressed=1024 yazar, ama içindeki deflate akışı ~3.7MB olup ~3.5GB'a açılır. assertZipWithinLimits bunu 1KB sanıp geçirir. Dosya kalem içe aktarma, teklif içe aktarma (5MB base64 gövde) ya da AI belge çıkarımıyla (R2 üzerinden 15MB, yaklaşık 15GB açılım) gönderilir. wb.xlsx.load bellekte açmaya başlar, süreç OOM-kill olur, API herkes için yeniden başlar. Saldırı tekrarlanabilir.
- **Düzeltme:** ExcelJS'e vermeden önce ortak bir yardımcıda (zip-inspect.ts) her girdiyi zlib.inflateRawSync(data, { maxOutputLength }) ile gerçekten açın; gerçek toplam boyutu sayın, beyan edilen boyutla uyuşmazsa ya da tavanı aşarsa reddedin. Bu fonksiyonu dört xlsx yolunun hepsi kullanmalı.

### Y-03 — Seyrek satırlı xlsx/CSV ile parseWorksheet milyonlarca Row/Cell nesnesi üretip API'yi OOM ile düşürüyor

- **Yer:** `apps/api/src/modules/company-listings/import/listing-item-import.service.ts:414` · **Bulan:** S029 · **Doğrulama:** 3/3
- **Sorun:** parseWorksheet `for (let r = headerRow + 1; r <= ws.rowCount; r++)` döngüsünde her satır için `ws.getRow(r)` ve eşlenen her sütun için `row.getCell(col)` çağırıyor; ExcelJS 4.4 `getRow`/`getCell` var olmayan satır ve hücreyi OLUŞTURUP worksheet'te saklıyor. `rowCount` son tanımlı satırın numarasıdır (`_lastRowNumber`), gerçek satır sayısı değil; ITEM_IMPORT_MAX_ROWS yalnız dolu satırları sayar ve döngüyü kesmez. zip-inspect açılmış boyuta bakar, seyrek satırı (birkaç baytlık `<row r="1048576">`) yakalamaz. Aynı desen bid-import.service.ts:277'de de var (başka dilim).
- **Senaryo:** buy:listing:manage izinli bir kullanıcı, geçerli başlık satırı + `A1048576` hücresinde tek değer taşıyan ~10 KB'lık bir xlsx'i POST company/listing-item-import/parse'a yollar → döngü ~1M Row ve 3-7M Cell nesnesi (her biri stil/değer alt nesneleriyle) yaratır, olay döngüsü saniyelerce bloklanır ve Render konteyneri bellek tükenmesiyle yeniden başlar; tüm kullanıcıların uçuştaki istekleri düşer, istek tekrarlanarak kalıcı kesinti yaratılabilir.
- **Düzeltme:** Döngüyü `ws.eachRow({ includeEmpty: false }, ...)` ile yalnız var olan satırlar üzerinde kur, getCell yerine `row.findCell(col)` kullan. Ayrıca headerRow'dan sonraki satır numarası makul bir tavanı (ör. ITEM_IMPORT_MAX_ROWS*4) aşınca döngüyü kes ya da 400 dön. Aynı düzeltmeyi bid-import.service.ts:253/277'ye de uygula.

### Y-04 — file-type@16.5.4 ASF ayrıştırıcısındaki sonsuz döngü (CVE-2026-31808), tek bir ~100 baytlık dosyayla tüm API sürecini kilitliyor

- **Yer:** `apps/api/src/modules/ai/tender-extract/ai-extract-router.ts:108` · **Bulan:** X04 · **Doğrulama:** 3/3
- **Sorun:** `routeExtractInput`, kullanıcının R2'ya yüklediği her AI girdisinde `fileTypeFromBuffer(f.buffer)` çağırıyor. file-type 16.5.4'ün ASF dalı (core.js:1076-1103), `size=0` olan bir alt başlıkta `payload = -24` hesaplıyor; strtok3 6.3.0 `ignore(-24)` konumu geri sarıyor ve `while` döngüsü mikro-görev kuyruğunda sonsuza kadar dönüyor. Event loop bir daha makro-göreve sıra vermediği için bütün kiracılarda tüm HTTP, WebSocket ve cron işleri durur. Yerelde doğruladım: ASF GUID'iyle başlayıp sıfırla doldurulmuş 100 baytlık bir buffer ile 200 ms'lik `setTimeout` hiç tetiklenmedi, süreç ancak dışarıdan öldürülünce sonlandı. CLAUDE.md'deki 'file-type 16→21 bilinçli ertelendi (ORTA)' notu bu uyarıyı listeliyor ama etkisini küçümsüyor. Tam sürüm göçü (ESM) gerekmeden kapatılabilir.
- **Senaryo:** Ücretli (GOLD) bir firma kullanıcısı `POST /api/company/ai/uploads/url` ile presigned URL alır ve içerik tipini `application/pdf` beyan eder; ancak presigned PUT içerik tipini imzalamadığı ve baytları kontrol etmediği için R2'ya ilk 16 baytı `30 26 B2 75 8E 66 CF 11 A6 D9 00 AA 00 62 CE 6C` olan, gerisi sıfır 100 baytlık bir dosya koyar. Ardından `POST /api/company/ai/tender-extract` (ya da SILVER+ tedarikçi olarak `bid-price-extract`) çağrısını yapar. `downloadAiInputs` yalnızca HEAD ile boyutu kontrol eder, `fileTypeFromBuffer` sonsuz döngüye girer ve tek Render instance'ındaki Nest süreci %100 CPU'da takılır. Render sağlık kontrolü yeniden başlatana kadar tüm müşteriler için site çöker; saldırgan isteği tekrarlayarak kesintiyi sürdürebilir.
- **Düzeltme:** `fileTypeFromBuffer` çağrısını kaldırıp bu yolun kabul ettiği türleri (PDF, JPEG, PNG, WEBP, HEIC ftyp, XLSX PK) imza baytlarından elle tanıyın. Kısa vadeli bir çözüm olarak ASF GUID'iyle (30 26 B2 75 8E 66 CF 11) başlayan buffer'ları çağrıdan önce reddedin ya da file-type >=21.3.1'e dinamik import ile geçin.

### Y-05 — Ortak AI yükleme ucu GOLD kapısında: Silver satıcının 'Belgeden Fiyatla (AI)' özelliği hiç çalışmıyor

- **Yer:** `apps/api/src/modules/ai/tender-extract/tender-extract.controller.ts:119`, `apps/api/src/modules/ai/tender-extract/tender-extract.controller.ts:87` · **Bulan:** S016, X01, X05, X21 · **Doğrulama:** 3/3
- **Sorun:** `POST company/ai/uploads/url`, sınıf seviyesinde `@RequireTier("GOLD")` taşıyan TenderExtractController içinde tanımlı. `bid-price-extract` ise Silver+ (varsayılan PAID_TIER) ve dosyaları yalnız bu uçtan aldığı anahtarlarla kabul ediyor (`isOwnAiExtractKey`). Web, teklif-ver sayfasında düğmeyi `tierAtLeast(tier, "SILVER")` ile açıyor ve `uploadOne` önce `/company/ai/uploads/url` çağırıyor. Sonuç: satış paketinin (Silver) satılan AI özelliği tüm Silver müşterilerde 403 ile kırık.
- **Senaryo:** SILVER paketli, sell:bid:submit izinli tedarikçi teklif-ver ekranında 'Belgeden Fiyatla (AI)' düğmesine basıp PDF seçer → web `POST /company/ai/uploads/url` gönderir → CompanyPaidTierGuard GOLD ister → 403 'Bu özellik Gold paket gerektirir'; bid-price-extract'e hiç ulaşılmaz. Yalnız GOLD firmalarda çalışır.
- **Düzeltme:** `uploadUrl` handler'ına `@RequireTier("SILVER")` ekle. Guard handler metadata'sını önceliyor, böylece sınıftaki GOLD bu uçta geçersiz kalır. Alternatif olarak ucu tier override'ı olmayan ayrı bir controller'a taşı. Ardından Silver kullanıcıyla uploads/url'den bid-price-extract'e kadar giden uçtan uca bir test ekle.

### Y-06 — Panel firma profili şahıs firmasının TCKN'sini (taxNumber) başka firmalara açıyor

- **Yer:** `apps/api/src/modules/company-connections/services/company-connections.service.ts:1742` · **Bulan:** S025, S066 · **Doğrulama:** 3/3
- **Sorun:** `getProfile` başka bir firmanın `taxNumber` alanını `trade.taxNumber` olarak maskesiz döner; `companyType` seçilmediği için şahıs firması ayrımı yapılmaz. TR şahıs firmasında taxNumber 11 haneli TCKN'dir (onboarding `sahisFirmasiIcin11HaneliTckn`). Firmanın KENDİ profil servisi (`company-profile.service.ts:155`) bu alanı company:manage'siz üyeden bile gizlerken (EF-M3), aynı veri buy:view/sell:view taşıyan HER kayıtlı firma üyesine gösteriliyor; web `company-profile-view.tsx:438` bunu çiziyor. Aynı sızıntı `list()` içinde bağlantı kartında da var (satır 1205, `taxNumber: other.taxNumber`).
- **Senaryo:** TR'de SOLE_PROPRIETOR olarak kayıt olan firma onboarding sonrası otomatik `publicEnabled=true` olur. Kendi kendine kaydolmuş herhangi bir ücretsiz firma üyesi `GET /company/directory/companies/<rothernId>` çağırır → yanıtta `trade.taxNumber` = firma sahibinin TC kimlik numarası; panel profil sayfasında 'Vergi no' satırında görünür. KVKK kapsamında kişisel veri ifşası.
- **Düzeltme:** `getProfile` select'ine `companyType` alanını ekleyin ve `!isSelf && companyType === "SOLE_PROPRIETOR"` durumunda `trade.taxNumber` değerini null döndürün. Aynı kuralı `list()` içindeki bağlantı kartı `taxNumber` alanına da uygulayın (COMPANY_CARD_SELECT'e companyType ekleyerek) ya da bu alanı karttan tamamen çıkarın.

### Y-07 — PATCH company/items/:id ile yayındaki ürünün ad/açıklama/kategorisi admin onayı olmadan değişiyor

- **Yer:** `apps/api/src/modules/company-items/company-items.service.ts:369` · **Bulan:** S027 · **Doğrulama:** 3/3
- **Sorun:** `update()` yalnız PENDING kilidine (`assertNotInReview`) bakıyor. APPROVED ve `isPublic=true` bir ürünün içerik alanlarını (name, description, specification, categoryId) değiştirip olduğu gibi yazıyor. `reviewStatus` PENDING'e çekilmiyor, `searchText` yenilenmiyor, çeviri kuyruğa alınmıyor. CLAUDE.md'ye göre yayındaki ürünün içerik değişikliği yeniden incelemeye düşmeli; bu kural yalnız `updateShowcase` yolunda uygulanıyor ve web bu ucu hiç kullanmıyor, yani uç sadece moderasyonu atlamaya yarıyor.
- **Senaryo:** `sell:product:manage` izni olan kullanıcı onaylı ürünü için `PATCH /api/company/items/<id>` çağırıyor, gövde `{name:"…", unit:"adet", description:"WhatsApp +90… hakaret/spam"}`. Yanıt 200 dönüyor, ürün APPROVED+isPublic olarak kalıyor ve admin görmeden herkese açık, indekslenen `/firma/<slug>/urun/<slug>` sayfasında yeni metin yayınlanıyor. Ayrıca ürün aramada hâlâ eski adıyla bulunuyor (searchText eski kalıyor).
- **Düzeltme:** `update()` içinde `before.reviewStatus !== "DRAFT"` ya da `isPublic` ise 409 dönün ve içerik değişikliğini showcase yoluna yönlendirin. Alternatif olarak APPROVED üründe name/description/specification/categoryId değiştiyse `reviewStatus: "PENDING", submittedAt, rejectReason: null` yazın, searchText'i yeniden hesaplayın ve `translations.enqueue` çağırın.

### Y-08 — Toplu bildirim e-postaları sınırsız eşzamanlı gönderiliyor — Resend hız sınırında sessizce düşüyor

- **Yer:** `apps/api/src/modules/company-listings/services/company-listings.service.ts:345` · **Bulan:** X09 · **Doğrulama:** 3/3
- **Sorun:** `notify()` her alıcı için `void this.email.send(...)` ile ateşle-unut çalışır; davet, kapanış, kategori eşleşmesi (300'e kadar alıcı) döngüleri tüm gönderimleri aynı anda başlatır. Kuyruk/yeniden deneme yok (BullMQ kaldırıldı) ve Resend SDK 429'da yeniden denemez; Resend'in varsayılan hesap sınırı saniyede birkaç istek olduğundan fazlası `FAILED` olur ve bir daha gönderilmez. Her gönderim ayrıca 3-4 DB sorgusu açtığından küçük havuzda (connection_limit≥5) diğer istekler P2024 zaman aşımına düşebilir. Yönetici duyurusu da 'sınırlı paralel chunk' der ama e-posta kolu `void` olduğu için 1000 gönderim bir anda başlar.
- **Senaryo:** Alıcı 8 tedarikçiyi davet ederek talebi yayınlar → notifyListingInvitees 8 `email.send`i ~50 ms içinde başlatır → Resend ilk 2'sini kabul edip diğerlerine `rate_limit_exceeded` döner → 6 davet e-postası FAILED, tekrar denenmez; tedarikçiler yalnız zil bildirimini görür. Kategori duyurusunda 40 firmanın çoğu e-posta almaz.
- **Düzeltme:** EmailService.send'e süreç içi bir sınırlayıcı ekleyin (p-limit veya token bucket, Resend hesabının rps değerine göre). 429 ve 5xx hatalarında üstel geri çekilmeyle 2-3 kez yeniden deneyin. Duyuru kolunda e-postayı chunk içinde await edin ve email.service.ts:97'deki yanlış "Resend retry" yorumunu düzeltin.

- **Aynı kök:** admin e-postalı duyurusu 5000'e kadar gönderimi bekletmeden ateşliyor (ORTA listeden taşındı).

### Y-09 — Hard-bounce bastırma ve soğuk davet freni Resend'in bounce tipiyle hiç eşleşmiyor

- **Yer:** `apps/api/src/modules/email/email.service.ts:177` · **Bulan:** X09 · **Doğrulama:** 3/3
- **Sorun:** Resend webhook'u `data.bounce.type` alanında SES terminolojisini gönderir (`Permanent` / `Transient` / `Undetermined`, alt tip `subType`); kod ise `"hard"` değerini arıyor. resend-event.service bu değeri olduğu gibi `bounceType`a yazdığı için gönderim öncesi bastırma, yönetici bastırma listesi, kritik e-posta bounce alarmı ve soğuk davet ısınmasındaki '7 günde kalıcı geri dönme >%2 → yarıya indir' freni hiçbir zaman tetiklenmez. Testler uydurma `"hard"` yükü kullandığı için yeşil görünüyor.
- **Senaryo:** AI keşfinin bulduğu geçersiz adreslere davet gider, Resend `email.bounced` + `bounce.type: "Permanent"` yollar → EmailLog.bounceType="Permanent". `dailyCap` hardBounces7d=0 sayar, tavan her hafta ×2 büyümeye devam eder; aynı ölü adrese (ve şifre sıfırlama isteyen ölü adrese) gönderim sürer, kullanıcıya 'kod gönderildi' denir. Yüksek bounce oranı Resend hesabının askıya alınmasına kadar gidebilir.
- **Düzeltme:** Webhook'ta bounce.type'ı büyük/küçük harf duyarsız normalize edin (Permanent→hard, Transient→soft, diğerleri→undetermined) ve ham type/subType değerlerini payload'da tutun. Arayüzü ve spec yüklerini Resend'in gerçek yük şekline çekin.

- **Aynı kök:** resend-event.service.ts:152 kritik e-posta bounce alarmı da `=== "hard"` arıyor (ORTA listeden taşındı).

### Y-10 — Ülke süzgeci vitrin kapısının embargo OR koşulunu eziyor; açılış tarihi gelecekteki talepler herkese açık listede görünüyor

- **Yer:** `apps/api/src/modules/public-marketplace/public-marketplace.service.ts:202` · **Bulan:** S040 · **Doğrulama:** 3/3
- **Sorun:** `marketplaceListingWhere(now)` embargoyu `OR: [{ bidsOpenAt: null }, { bidsOpenAt: { lte: now } }]` ile uygular. `list()` içinde `...gate` yayıldıktan SONRA `q.country` verilince `{ OR: [{ targetCountries: { isEmpty: true } }, { targetCountries: { has: ... } }] }` aynı `OR` anahtarını yazar ve embargo koşulu sorgudan tamamen düşer. Böylece bidsOpenAt'i gelecekte olan (status OPEN + publishedAt dolu) talepler anonim pazar yeri listesinde kart olarak (başlık, özet, kalem özeti, şehir/sektör) çıkar; business-rules.md 'bidsOpenAt gelecekteyse yalnız sahip görür' kuralı ihlal edilir. Detay (`getByNumber`) ve facet uçları kapıyı doğru uyguladığı için liste ile sayaç da ayrışır.
- **Senaryo:** Firma A, bidsOpenAt = 3 gün sonra olan PUBLIC bir talep yayımlar (status OPEN, publishedAt dolu). Anonim ziyaretçi `GET /api/public/listings?country=TR` çağırır (web'deki ülke çipi de bu parametreyi gönderir) → where'deki OR yalnız hedef-ülke koşulu olur, embargo kontrolü kalkar → embargolu talep listede görünür; ülke parametresi olmadan aynı istek onu göstermez.
- **Düzeltme:** Ülke koşulunu üst düzey OR yerine `AND: [{ OR: [...ülke...] }, ...(searchWhere().AND ?? [])]` biçiminde birleştirin ya da gate'teki embargo OR'unu `AND: [{ OR: [...] }]` altına alın; embargolu talep + country parametresi için regresyon testi ekleyin.

### Y-11 — Tüm girişler Supabase GoTrue'ya tek sunucu IP'sinden gidiyor; IP başına giriş kotası herkes için girişi kilitleyebilir

- **Yer:** `apps/api/src/modules/supabase-auth/supabase-auth.service.ts:82` · **Bulan:** S041 · **Doğrulama:** 3/3
- **Sorun:** verifyPassword, anon key'li publicClient ile signInWithPassword çağırıyor (company ve admin login, parola değiştirme). Bu yüzden her kullanıcının girişi GoTrue'ya Render'ın çıkış IP'sinden ulaşıyor ve istemci IP'si iletilmiyor. Hosted Supabase'in 'sign-ups and sign-ins' kotası IP başına sayılıyor (5 dakikada 30 civarı; launch-checklist bu kotanın daha da sıkılaştırılmasını istiyor). 429 alınınca kimlik hatası sayılmıyor, ServiceUnavailable'a çevriliyor; sonuçta bütün platformda giriş 503 dönüyor.
- **Senaryo:** Tek bir saldırgan IP'si, API'nin login throttle'ı izin verdiği için dakikada 10 istekle rastgele e-posta/parola denemesi yapıyor. 5 dakikada 50 deneme Supabase'in sunucu IP'sine uyguladığı kotayı dolduruyor ve bundan sonra tüm meşru kullanıcıların girişi 5 dakika boyunca 'Giriş servisi geçici olarak kullanılamıyor' (503) alıyor. Saldırgan bunu sürekli tekrarlayarak girişi kalıcı olarak kapatabiliyor. Lansman günündeki gerçek trafik de aynı kotayı tek başına doldurabilir.
- **Düzeltme:** Supabase dashboard'da sign-in kotasını sunucu trafiğine göre yüksek bir değere çekin ve checklist'teki 'sıkılaştır' maddesini düzeltin. Kalıcı çözüm için istemci IP'sini Supabase'in desteklediği başlıkla (secret key ile sb-forwarded-for) iletin ya da API'de hesap bazlı bir ön-sınır ekleyin; 429'u Sentry'de ayrı etiketle alarm olarak raporlayın.

### Y-12 — Web ve admin'de sunucu Sentry'si hiç başlatılmıyor: instrumentation.ts yanlış klasörde

- **Yer:** `apps/web/instrumentation.ts:5` · **Bulan:** X19 · **Doğrulama:** 3/3
- **Sorun:** İki uygulama da `src/app` düzeninde, ama `instrumentation.ts` uygulama kökünde (apps/web/instrumentation.ts, apps/admin/instrumentation.ts). Next 15.5 bu kancayı yalnız `appDir`in bir üst klasöründe, yani `src/` altında arar (next/dist/build/index.js:540 `rootDir = path.join(pagesDir || appDir, '..')`). Bu yüzden `register()` hiç çalışmıyor: `Sentry.init` yapılmıyor, `onRequestError` bağlanmıyor. 2026-09-28 tarihli admin üretim derlemesinde de `.next/server/instrumentation.js` yok; bu da dosyanın görülmediğini doğruluyor. `/api/client-error` içindeki `Sentry.captureException` istemci olmadığı için boşa gidiyor; `console.error` yedeği ise yalnız DSN TANIMSIZKEN çalışıyor, canlıda DSN tanımlı olduğundan tarayıcı hataları iz bırakmadan kayboluyor.
- **Senaryo:** Canlıda bir sunucu bileşeni ya da SSR veri çağrısı hata veriyor (ör. API 5xx, B1-1 yolu) veya tarayıcıda hata sınırı tetikleniyor. Web ve admin Sentry projelerine tek bir olay bile düşmüyor. Tarayıcı bildirimleri Vercel günlüğüne de yazılmıyor. Yayın planı madde 9'daki 'ilk 24 saat Sentry (3 proje)' izlemesi web ve admin için kör kalıyor.
- **Düzeltme:** apps/web/instrumentation.ts ve apps/admin/instrumentation.ts dosyalarını src/ altına taşıyın (apps/*/src/instrumentation.ts). Derlemeden sonra .next/server/instrumentation.js dosyasının oluştuğunu kontrol edin, staging'de de kasıtlı bir hatayla Sentry'ye olay düştüğünü doğrulayın.

### Y-13 — EN/RU kullanıcılarda bildirime tıklamak 404 sayfasına götürüyor (dil ön eki iki kez ekleniyor)

- **Yer:** `apps/web/src/app/[locale]/company/(authed)/bildirimler/page.tsx:66`, `apps/web/src/components/company-shell/live-toasts.tsx:64`, `apps/web/src/components/company-shell/notification-bell.tsx:54` · **Bulan:** S057, S071, X09, X10 · **Doğrulama:** 3/3
- **Sorun:** API bildirimin ctaUrl'ini alıcının diline göre yerelleştirip saklıyor (renderPayload -> localizeAppPath, appRoutes.listing(..., l)); EN kullanıcı için örnek 'https://rothern.com/en/company/request/abc'. Sayfa yalnız origin'i silip '/en/company/request/abc' dış yolunu @/i18n/navigation router.push'a veriyor; bu sarmalayıcı İÇ (Türkçe) yol bekliyor, translateRoutePath eşleşme bulamayınca yolu aynen geçiriyor ve next-intl applyPathnamePrefix as-needed modunda tekrar '/en' ekliyor. Sonuç '/en/en/company/request/abc' -> [locale]/[...rest] catch-all -> notFound(). Aynı kalıp components/company-shell/notification-bell.tsx:54 ve components/company-shell/live-toasts.tsx:64 (toPath) içinde de var.
- **Senaryo:** Dili EN (veya RU) olan bir tedarikçiye 'yeni talep daveti' bildirimi düşer; Bildirimler sayfasında (ya da zilde/canlı tostta) bildirime tıklar -> router.push('/en/company/request/abc') -> tarayıcı '/en/en/company/request/abc' adresine gider ve 404 görür. TR kullanıcılarda ön ek olmadığı için sorun görünmez.
- **Düzeltme:** Origin silindikten sonra yolu splitLocale(path).path (apps/web/src/i18n/href.ts) ile İÇ yola indirip router.push'a öyle verin. Bunu tek bir ortak yardımcıda toplayıp bildirimler sayfası, notification-bell ve live-toasts'ta kullanın, EN/RU ctaUrl için de test ekleyin.

### Y-14 — Sahip ekranı kalem kıyası ve kalem-bazlı kazandırma seçicisi kalem para birimini yok sayıyor

- **Yer:** `apps/web/src/app/[locale]/company/(authed)/ilan/[id]/page.tsx:450` · **Bulan:** X12 · **Doğrulama:** 3/3
- **Sorun:** Madde 9 çok-birimli teklifte kalem kendi biriminde (bi.currency) fiyatlanabiliyor ve API bu alanı sahibe dönüyor; ama `bidsForItem` ve kıyas matrisi (`priceMap`/`priceTryMap`) birim fiyatı teklifin ANA birimi ve ana birim kuruyla (`bidRate(b)`) okuyor. Sonuç: yanlış sembol, yanlış TRY karşılığı, yanlış 'en iyi' vurgusu ve kalem kazandırmada yanlış teklifin OTOMATİK ön-seçilmesi. Aynı hata rapor tarafında da var: `bidComparison` `itemPrices.unitPrice`/`totalPrice` ham kalem fiyatını teklifin `bidCurrency` etiketiyle veriyor (web ve Excel).
- **Senaryo:** TRY ana birimli teklif, kalem X'i 100 USD fiyatlıyor; rakip aynı kalemi 3.000 TRY veriyor. Ekran '100,00 ₺' gösterir, priceTry=100 ile en ucuz sayar, yeşil vurgular ve `startItemAward` kalem X'in kazananı olarak 100 USD'lik (≈4.899 TRY) teklifi ön-seçer; alıcı daha pahalı tedarikçiye kazandırır (sipariş gerçek USD tutarıyla doğar).
- **Düzeltme:** Sahip projeksiyonuna kalem `fxToBase` (ya da hazır hesaplanmış kalem TRY karşılığı) eklenmeli. Web tarafında kalem birimi `bi.currency ?? b.currency` ile gösterilmeli, TRY karşılığı `unit × (fxToBase ?? 1) × bidRate(b)` ile hesaplanmalı; rapordaki itemPrices'a da kalem `currency` eklenmeli.

### Y-15 — Dosyalı ilk teklifte yükleme başarısız olunca ekran 'Teklifin gönderildi' yazısında takılı kalıyor, teklif ise TASLAK duruyor

- **Yer:** `apps/web/src/app/[locale]/company/(authed)/ilan/[id]/teklif-ver/page.tsx:522` · **Bulan:** S060 · **Doğrulama:** 3/3
- **Sorun:** İki aşamalı gönderimde önce `placeBid.mutateAsync(buildPayload(true))` (taslak) başarıyla dönüyor ve `placeBid.isSuccess` true oluyor; 522. satırdaki erken dönüş formu kaldırıp 'Teklifin gönderildi — satın alma talebi detayına dönülüyor…' metnini basıyor. Ardından `uploadStaged()` başarısız olursa `submit` 968'de `return` ediyor: yönlendirme yok, form ve 'listede kaldı, tekrar deneyin' dediği dosya listesi görünmüyor, teklif sunucuda DRAFT kalıyor. Tetik kolay: sürükle-bırak (1450-1454) `accept` süzgecini atlıyor, .docx/.heic gibi dosya kabul edilip sunucuda `requestUploadUrl` 400 ('Sadece PDF, görsel veya Excel') alıyor. `saveDraft` da taslağı 'gönderildi' metniyle gösteriyor.
- **Senaryo:** Tedarikçi ilk teklifini hazırlar, teklif mektubunu (.docx) alana sürükler, 'Teklif Gönder'e basar → taslak kaydedilir, ekran 'Teklifin gönderildi' der, dosya yüklemesi 400 alır, kısa bir hata toast'ı çıkar ve kaybolur; ekran sonsuza dek 'gönderildi' yazısında kalır. Tedarikçi teklifinin gittiğini sanıp çıkar; teklif DRAFT kaldığı için alıcı hiç görmez ve kapanışla kaybolur.
- **Düzeltme:** Durum ekranı yalnız son gönderimde (asDraft=false) çıksın, örneğin `placeBid.variables?.asDraft === false` koşulu ya da ayrı bir finalSubmitted state'iyle; taslak adımından sonra yükleme başarısız olursa form görünür kalsın. Ayrıca addFiles, dosyaları accept listesindeki MIME/uzantılara göre süzsün ve reddedilenleri toast ile bildirsin.

### Y-16 — Tedarikçinin MUADİL beyanı (isAlternative/offeredBrand/offeredMpn) alıcıya hiçbir yerde gösterilmiyor

- **Yer:** `apps/web/src/app/[locale]/company/(authed)/ilan/[id]/teklif/[bidId]/page.tsx:253` · **Bulan:** S060 · **Doğrulama:** 3/3
- **Sorun:** API sahip dalında her teklif kalemi için `isAlternative`, `offeredBrand`, `offeredMpn` döndürüyor (service 3433-3435) ve web tipi `ListingBidItemRow` bunları taşıyor, ama teklif detayındaki kalem tablosu (252-303) yalnız ad, teslim, soru cevapları, miktar ve fiyat çiziyor. Web'de bu alanları okuyan tek çizim yok (grep: yalnız teklif-ver formu ve tip tanımı); ilan detayındaki karşılaştırma tablosu da göstermiyor. `alternativeAllowed` varsayılanı true (schema 2263), plan belgesi bu simetriyi 'Faz 3'ün ayrılmaz parçası' sayıyor.
- **Senaryo:** Pazarlık talebinde tedarikçi bir kalem için 'Muadil ürün teklif ediyorum — Marka: X, Parça no: Y' işaretleyip gönderir. Alıcı teklif detayında ve karşılaştırmada yalnız fiyatı görür, istediği markanın teklif edildiğini sanıp 'Kazandır'a basar; sipariş X markası için doğar ve teslimde uyuşmazlık çıkar.
- **Düzeltme:** teklif/[bidId]/page.tsx kalem hücresinde bi?.isAlternative doluysa belirgin bir "Muadil" rozeti ve "Teklif edilen: {offeredBrand} · {offeredMpn}" satırı çizilmeli. Aynı gösterim ilan detayındaki karşılaştırma tablosuna ve teklif listesine de eklenmeli, katalog anahtarları üç dilde tanımlanmalı.

### Y-17 — Dizin arama formu dil önekini düşürüyor; EN/RU ziyaretçi aramada Türkçe siteye atılıyor

- **Yer:** `apps/web/src/components/marketplace/search-form.tsx:42` · **Bulan:** S078 · **Doğrulama:** 3/3
- **Sorun:** `SearchForm` JS'siz düz `<form action={action} method="get">` basıyor ve `action` iç (Türkçe, öneksiz) yol: `product-index.tsx` `action: basePath` (`/urunler`), `listing-index.tsx` `/alim-talepleri`. Tarayıcı bu adrese gider. `localePrefix: "as-needed"` + `localeDetection: false` olduğu için öneksiz yol her zaman `tr` sayılıyor, çerez de okunmuyor. Sonuçta arama yapan yabancı ziyaretçi Türkçe arayüze düşüyor. Aynı kalıp `search-typeahead.tsx:223`te de var; `PanelHeroSearch` ise `router.push` (i18n sarmalayıcı) kullandığı için doğru çalışıyor.
- **Senaryo:** İngilizce ziyaretçi `/en/products` sayfasında arama kutusuna "steel pipe" yazıp Ara'ya basıyor -> tarayıcı `GET /urunler?q=steel+pipe` açıyor -> middleware yolu `tr` olarak çözüyor -> sonuç sayfası, süzgeçler ve sonraki gezinme tamamen Türkçe geliyor (Rusça ziyaretçide de aynısı oluyor).
- **Düzeltme:** ProductIndex/ListingIndex içinde `action`ı `localizePath(basePath, locale)` ya da `@/i18n/href` ile dış yola çevirip verin. SearchTypeahead'de de `opt.action`ı aktif dile göre çevirin (örneğin `localizePath(opt.action, useLocale())`).

- **Aynı kök:** firma içi ürün arama formu (`company-products.tsx:51`) da EN/RU ziyaretçiyi Türkçe sayfaya atıyor (ORTA listeden taşındı).

### Y-18 — Bağlantısız teklif veren/sipariş karşı tarafıyla ilk sohbet derin linki açılmıyor

- **Yer:** `apps/web/src/components/messaging/company-inbox-view.tsx:252` · **Bulan:** S080 · **Doğrulama:** 3/3
- **Sorun:** Sohbet paneli yalnız `selectedRowName` doluysa çiziliyor; bu ad sadece mevcut thread'lerden veya ACTIVE bağlantılardan (`useConnections`) çözülüyor. Teklif listesi (`ilan/[id]/page.tsx:1487`), teklif detayı (`teklif/[bidId]/page.tsx:189`) ve sipariş detayı (`siparis/[id]/page.tsx:660`) 'Mesaj' linkleri bağlantı olmayan firmaya da `?with=` ile gidiyor ve backend (D1 kararı, audit-2026-07-09) bağlantısız mesajı serbest bırakıyor. Sonuç: ilk temasta sohbet hiç açılmıyor, 'Bir kişi seç' boş ekranı görünüyor; mobilde sol liste de `selected` dolu olduğu için gizlendiğinden geri butonu olmayan çıkmaz ekran kalıyor.
- **Senaryo:** Alıcı, açık ilanına teklif veren ve bağlantısı olmayan (önceden hiç yazışmamış) bir tedarikçinin satırındaki 'Mesaj' linkine tıklar → /company/mesajlar?with=<bidderId>&portal=satinalma → rows ve threads.data bu id'yi içermez → selectedRowName=null → sohbet yerine 'Bir kişi seç / Soldan bir firma seçerek sohbete başlayın' görünür, tedarikçiye mesaj atmanın hiçbir yolu yoktur (liste yalnız bağlantıları gösterir). Aynısı bağlantısız karşı taraflı siparişte de olur.
- **Düzeltme:** `selected` doluysa sohbet panelini her durumda çiz. Ad `rows`/`threads` içinde bulunamazsa `useThreadMessages` yanıtındaki `data.otherParty.name` değerini kullan, ad gelene kadar iskelet göster. Mobil geri butonunu yalnız `selected` koşuluna bağla.

### Y-19 — Talep düzenleme/kopyalama/şablon açılışında firmanın varsayılan şartları talebin kendi şartlarını eziyor

- **Yer:** `apps/web/src/components/tenders/quick/quick-request.tsx:207` · **Bulan:** S083, X22 · **Doğrulama:** 3/3
- **Sorun:** QuickRequest ilk açılışta `applyRequestDefaults({ ...DEFAULT_FORM_VALUES, ...initialValues }, d)` ile formu sıfırlıyor; applyRequestDefaults görünürlük, hedef ülkeler, teslim şekli, ödeme kategorisi/vade/peşin oranı/LC, para birimleri, kapalı zarf, bidVisibility, requireAllItems/requireBidDocument, teslim adresi ve kapanış tarihini (now+closeDays) firmanın 'Talep şartları' varsayılanlarıyla YAZIYOR. Düzenleme sayfası (`duzenle/page.tsx`) ve `?from=`/`?template=` bu bileşene talebin kendi değerlerini `initialValues` olarak veriyor ama hepsi siliniyor; sağdaki TermsPanel de talebin değil varsayılanın değerini gösteriyor. Kaydedince updateListing bu değerleri talebe yazar.
- **Senaryo:** Alıcı PRIVATE görünürlüklü, USD, akreditifli, 15 Ekim kapanışlı bir taslak (veya teklifsiz OPEN talep) oluşturur; firma varsayılanı PUBLIC/TRY/açık hesap 30 gün/7 gün. 'Satın alma talebini düzenle' ile yalnız başlıktaki yazım hatasını düzeltip kaydeder → talep PUBLIC (pazar yerinde herkese açık), TRY, açık hesap olur ve kapanış bugün+7 güne kayar; yalnız davetlilere açık olması gereken talep ifşa olur, tedarikçiler yanlış ticari şartla fiyat verir.
- **Düzeltme:** initialValues verildiğinde (düzenleme, kopya, şablon) applyRequestDefaults uygulanmamalı ya da yalnız initialValues'ta bulunmayan alanlara uygulanmalı. Düzenleme kipinde bidsCloseAt ve görünürlük talebin kendi değerinde kalmalı, TermsPanel'in terms durumu da defaultsFromForm(initialValues) ile tohumlanmalı.

### Y-20 — Yayındaki (teklifsiz) talebi düzenlerken 'Talebi yayınla' her zaman 400 hatası veriyor; bekleyen davetler kayboluyor

- **Yer:** `apps/web/src/components/tenders/quick/quick-request.tsx:333` · **Bulan:** X22 · **Doğrulama:** 3/3
- **Sorun:** Sahip detayı `canEdit`'i OPEN + teklifsiz talepte de true döner ve 'Düzenle' aynı QuickRequest'i açar; bileşen talebin durumunu bilmez. Birincil 'Talebi yayınla' edit yolunda önce PATCH (başarılı) sonra `publishExisting` (POST /publish) çağırır; publishListing yalnız DRAFT kabul ettiği için 400 döner, kullanıcı 'yayımlanamadı' hatasıyla sayfada kalır ve eklediği dış/üye davetleri hiç gönderilmez. İkincil 'Taslağı kaydet' ise talep OPEN kalmışken 'Taslak güncellendi' der ve davetleri artık hiç tüketilmeyecek sessionStorage'a yazar; ayrıca edit-taslak kaydı `asDraft:true` göndermediği için kapanışı boş/geçmiş ya da davetsiz PRIVATE taslak 'kapanış tarihi zorunlu'/'en az bir davetli' 400'üyle kaydedilemez.
- **Senaryo:** Alıcı teklif gelmemiş OPEN talebi 'Düzenle' ile açıp miktarı değiştirir, AI panelinden 3 dış tedarikçi ekler ve 'Talebi yayınla'ya basar → PATCH kaydedilir, ardından POST /company/listings/:id/publish 400 'Yalnızca taslak ilan yayınlanabilir' → hata toast'ı, sayfa değişmez, 3 davet hiç gitmez.
- **Düzeltme:** QuickRequest'e talebin durumu (canPublish/status) geçirilmeli. OPEN talebi düzenlerken publishExisting çağrılmamalı; yalnız PATCH yapılıp bekleyen üye ve dış davetler hemen gönderilmeli, düğme de "Değişiklikleri kaydet" olarak gösterilmeli. DRAFT talebi düzenlerken taslak kaydına `asDraft: true` eklenmesi de değerlendirilmeli.

### Y-21 — seed-geo-cities ve backfill-city-ids ENV_FILE'ı okumuyor, runbook adım 7 canlı yerine staging'e yazıyor

- **Yer:** `packages/db/prisma/scripts/seed-geo-cities.ts:16` · **Bulan:** X20 · **Doğrulama:** 3/3
- **Sorun:** Runbook 15.2 adım 7 (docs/qa-launch-audit-2026-09-28.md:750) ve CLAUDE.md:71 canlı kurulumu `ENV_FILE=../../.env.prod.local` ile koşturmayı söylüyor. Ancak ENV_FILE'ı yalnız backfill-price-base (ve wipe/rewrite betikleri) okuyor. seed-geo-cities.ts:16 ve backfill-city-ids.ts:14 yalnız `process.env.DIRECT_URL || process.env.DATABASE_URL` kullanıyor. Bu değişkenler kabukta tanımlı değilse Prisma istemcisi `packages/db/.env` dosyasını yüklüyor; bu dosya kök `.env`'e sembolik bağ (aws-0 pooler, staging) ve `.env.prod.local` ile aynı değil (canlı aws-1).
- **Senaryo:** Yayın günü operatör `ENV_FILE=../../.env.prod.local pnpm --filter @rothern/db seed-geo-cities` komutunu koşuyor. Betik staging veritabanına 33.804 satırı idempotent upsert ediyor ve başarı basıyor. Canlı `geo_cities` boş kalıyor. `backfill-city-ids --dry` da staging'i listeliyor. Canlıda yabancı şehir/ülke sayfaları 404 veriyor, şehir seçici yalnız TR+KKTC gösteriyor. Yabancı firmaların `cityId` alanı null yazılıyor. Bu, 2026-09-15 olayıyla aynı sınıf (CLAUDE.md:68-71).
- **Düzeltme:** backfill-price-base.ts:23-35'teki ENV_FILE yükleyicisini, PrismaClient import'undan önce çalışacak şekilde seed-geo-cities.ts ve backfill-city-ids.ts'e ekleyin (tercihen prisma/scripts/lib altında paylaşılan bir yardımcı olarak). Betik başlarken hedef DB host'unu ve proje ref'ini de loglasın.

## ORTA — ilk hafta

### M-001 — Admin hata toast'ları ham 'Request failed with status code 400' gösteriyor; doğrulama hatasının sebebi hiç görünmüyor

- `apps/admin/src/app/admin/ilanlar/[id]/page.tsx:40` · S004
- Sayfalar hatayı `e instanceof Error ? e.message : "Hata"` ile gösteriyor. AxiosError'da bu, sunucu mesajı değil İngilizce 'Request failed with status code NNN' metni. Global ValidationPipe doğrulama hatalarını `{message, errors:{...}}` biçiminde döndürüyor ve lib/api.ts interceptor'ı `errors` doluysa bilinçli olarak toast basmıyor. Sonuç olarak DTO ihlalinde admin yalnız ham İngilizce metni görüyor; diğer 4xx'lerde ise biri doğru, biri ham İngilizce iki toast çıkıyor.
- **Senaryo:** Admin ilanı kapatırken 'şikayet var' (9 karakter) yazıp Kapat'a basıyor. PromptDialog yalnız boş olup olmadığına bakıyor, dialog hemen kapanıyor ve yazılan metin kayboluyor. ReasonDto @MinLength(10) 400 + errors döndürüyor, interceptor sessiz kalıyor, ekranda sadece 'Request failed with status code 400' beliriyor. Aynı durum sipariş iptalinde (siparisler/[id]:614-619), ürün düzeltme gerekçesinde (urunler/[id]:31,182), personel eklemede, şifre değiştirmede ve manuel kurda da yaşanıyor.
- **Düzeltme:** lib/api.ts'e ortak bir apiErrorMessage(e) yardımcısı eklenmeli: önce errors'daki ilk alan mesajını, yoksa message'ı döndürsün. Sayfalarda e.message yerine bu kullanılmalı ve interceptor'ın zaten toast bastığı statülerde ikinci toast basılmamalı. PromptDialog'a bir minLength prop'u eklenmeli ve gerekçe dialog'larına min 10 / max 500 kontrolü verilmeli.

### M-002 — Süper Admin kendi satırında 'Şifre Sıfırla'ya basınca kendini kilitliyor

- `apps/admin/src/app/admin/personel/page.tsx:325` · S004
- 'Şifre Sıfırla' düğmesi isSelf kontrolü olmadan her satırda, onay istemeden gösteriliyor. Backend resetPassword kendi hesabını da kabul ediyor: Supabase şifresi rastgele geçici şifreyle değişiyor, 2FA kapanıyor ve tokenVersion artıyor. Hook'taki invalidate(['admin-staff']) hemen eski çerezle yeniden istek atıyor, 401 alınıyor ve interceptor /admin/login'e yönlendiriyor. Geçici şifre banner'ı ya hiç görünmüyor ya da bir anlığına görünüyor. Admin portalında 'şifremi unuttum' akışı da yok.
- **Senaryo:** Canlıda tek SUPER_ADMIN (boş DB, seed edilmiş tek hesap) Personel sayfasında kendi satırındaki 'Şifre Sıfırla'ya basıyor. Şifresi bilinmeyen bir değere dönüyor, 2FA siliniyor, oturumu düşüyor ve login sayfasına atılıyor. Başka Süper Admin olmadığı için panele geri girebilmesi ancak Supabase dashboard/DB müdahalesiyle mümkün.
- **Düzeltme:** Kendi satırında 'Şifre Sıfırla' düğmesi gizlenmeli (isSelf ? null : ...) ve backend resetPassword'da id === actorId ise BadRequest dönülmeli; kişi kendi şifresini Ayarlar'daki Şifre Değiştir ile değiştirmeli. Ayrıca diğer personel için onay dialog'u eklenmeli.

### M-003 — Global arama SUPPORT rolünde her aramada 403 toast'ı üretiyor ve "Sonuç yok" diyor

- `apps/admin/src/components/layout/global-search.tsx:27` · S006
- GlobalSearch üst çubukta (admin-shell.tsx:371) rolden bağımsız her admin için gösteriliyor, ancak backend `GET /admin/search` 1592f516'dan beri `@RequireAdminRole("SUPER_ADMIN", "SALES")` ile kapalı (admin-companies.controller.ts:566-567). SUPPORT kullanıcısında 2+ karakterlik her debounce edilmiş sorgu 403 alıyor: api.ts:68 interceptor'ı her istekte "Bu işlem için yetkiniz yok" toast'ı basıyor, QueryProvider `retry: 1` olduğu için sorgu başına iki toast çıkıyor. Hata durumu hiç ayrıştırılmadığından (`results.isError` okunmuyor) panel hatayı "Sonuç yok" diye gösteriyor; bu yanıltıcı metin 500/ağ hatalarında da çıkıyor.
- **Senaryo:** SUPPORT rolündeki admin üst çubuktaki arama kutusuna "acme" yazıyor. 250 ms sonra /admin/search?q=acme 403 dönüyor, retry ile bir 403 daha geliyor, ekranda art arda iki "Bu işlem için yetkiniz yok" toast'ı çıkıyor ve açılır panelde "Sonuç yok" görünüyor. Her yeni harfte bu tekrar ediyor.
- **Düzeltme:** GlobalSearch'ü AdminTopbar'da yalnız SUPER_ADMIN/SALES için çizin: admin-permissions matrisine `globalSearch` eylemi ekleyip canAdminDo ile kapılayın, ya da useGlobalSearch'e rol bazlı `enabled` verip 403'te retry yapmayın. Ayrıca `results.isError` olduğunda "Sonuç yok" yerine bir hata metni gösterin.

### M-004 — Çıkışta logout isteği beklenmeden sayfa değişiyor, httpOnly admin çerezi silinmeden kalabiliyor

- `apps/admin/src/hooks/use-admin-auth.ts:73` · S007
- `useAdminLogout` `api.post("/admin/auth/logout")` isteğini fire-and-forget atıp hemen ardından `window.location.href = "/admin/login"` ile yönlendiriyor. Admin paneli ile API ayrı origin'lerde ve istekte `X-CSRF-Token` başlığı var, bu yüzden önce CORS preflight gerekiyor. `enableCors`'ta `maxAge` tanımlı olmadığından Chrome preflight'ı yalnızca 5 sn önbellekliyor. Yeni sayfa commit edilince eski dokümanın bekleyen preflight/POST istekleri iptal ediliyor. Bu durumda `clearAuthCookies` hiç çalışmıyor ve 30 günlük kalıcı `rk_admin` çerezi geçerli kalıyor (logout tokenVersion da artırmıyor).
- **Senaryo:** Ortak bir bilgisayarda SUPER_ADMIN "Çıkış"a basıyor. Vercel'deki /admin/login yanıtı, API'ye giden preflight ve POST zincirinden önce geliyor ve logout POST'u iptal ediliyor. Arayüz çıkış yapılmış gibi görünüyor. Aynı tarayıcıyı kullanan bir sonraki kişi admin origin'inde konsoldan `fetch('https://api.rothern.com/api/admin/...', {credentials:'include'})` çalıştırarak (CSRF çerezi JS'ten okunabiliyor) SUPER_ADMIN yetkisiyle okuma ve yazma yapabiliyor.
- **Düzeltme:** Yönlendirme, logout isteği kısa bir zaman aşımıyla (ör. Promise.race ile 3 sn) beklendikten sonra `finally` içinde yapılmalı. Ek olarak backend logout'ta tokenVersion artırılırsa silinmemiş çerezdeki JWT de geçersiz olur. Aynı düzeltme web tarafındaki company logout'a da uygulanmalı.

### M-005 — SEO_REVALIDATE_SECRET, x-rothern-ssr başlığıyla API erişim günlüğüne düz metin düşüyor

- `apps/api/src/app.module.ts:109`, `apps/api/src/app.module.ts:112` · S041, X03, X16, X19
- B11-1 düzeltmesiyle (4f71f93d) web sunucusu `SEO_REVALIDATE_SECRET`i her SSR çağrısında `x-rothern-ssr` başlığında gönderiyor. pino-http'nin standart req serileştiricisi tüm `headers` nesnesini yazıyor. Özel serileştirici de `...req` ile bu nesneyi olduğu gibi aktarıyor. `redact.paths` yalnız authorization/cookie/cf-connecting-ip başlıklarını maskeliyor, `x-rothern-ssr` listede yok. nestjs-pino istek bağlamındaki her servis satırına da `req` eklediği için sır tek bir satırla kalmıyor, `/api/public/*` isteklerinin hepsinde tekrar tekrar düz metin olarak günlüğe yazılıyor.
- **Senaryo:** Vercel'deki herkese açık ürün sayfası ISR sırasında `GET /api/public/listings` çağırıyor. İstek bitince Render günlüğüne `"req":{"headers":{"x-rothern-ssr":"<SEO_REVALIDATE_SECRET>",...}}` satırı yazılıyor. Render günlüklerini ya da log drain'i okuyabilen biri bu sırrı alıp iki şey yapabilir: `/api/public/*` hız sınırını tamamen atlar (kazıma, DB yükü) ve web'deki `POST /api/seo/revalidate` ile çağrı başına 500 yol × 3 dilde ISR tazelemesi tetikler.
- **Düzeltme:** `redact.paths` listesine `req.headers["x-rothern-ssr"]` eklenmeli. İsterseniz `x-csrf-token` ve `svix-signature` de eklenebilir. Daha sağlam yol, req serileştiricisinde başlıkları allowlist ile yazmak. Sır günlüğe düşmüşse Render ve Vercel'de birlikte döndürülmeli.

### M-006 — Paket düşünce onay kuyruğundaki ürünler tavana sayılmıyor, admin onayı da tavanı denetlemiyor

- `apps/api/src/common/company/product-limit.ts:25` · S019, X23
- enforceProductLimit yalnızca isPublic:true ürünleri kırpıyor, reviewStatus=PENDING olan ve henüz yayında olmayan ürünlere dokunmuyor. publish() kapısı ise 'yayında + onay bekleyen' sayısını tavan olarak kullanıyor. AdminProductsService.approve/approveMany firmanın efektif kademesine ve PRODUCT_LIMITS'e hiç bakmadan isPublic:true yazıyor. Bu yüzden paketi düşen firma, kuyrukta bekleyen ürünler onaylandıkça ücretsiz tavanın (50) üstüne çıkıyor.
- **Senaryo:** Silver firma 300 ürünü onaya gönderiyor (PENDING, isPublic:false). Üyelik süresi doluyor ve cron firmayı STANDART'a düşürüyor. enforceProductLimit yayındaki ürünleri 50'ye kırpıyor ama 300 PENDING ürün kuyrukta kalıyor. Admin toplu onayla bunları yayına alınca STANDART firmada 350 yayında ürün oluyor. Tavan ancak bir sonraki paket düşüşünde yeniden uygulanıyor.
- **Düzeltme:** enforceProductLimit, tavanın üstünde kalan ve yayında olmayan PENDING ürünleri de taslağa çekmeli (reviewStatus DRAFT, submittedAt null). Ayrıca approve/approveMany, isPublic=false olan ürünü yayına alırken firmanın o anki tier'ına göre yayındaki ürün sayısını advisory lock altında saymalı; tavan doluysa ürün atlanmalı ya da reddedilmeli.

### M-007 — Advisory lock aynı oturumda yeniden girişli: aynı örnekte üst üste binen cron koşuları engellenmiyor (dış davet çift gönderimi)

- `apps/api/src/common/cron/cron-lock.service.ts:77` · X08, X14
- Tüm cron'lar tek bir `connection_limit=1` PrismaClient oturumunda `pg_try_advisory_lock` alıyor. Postgres oturum düzeyi advisory lock aynı oturumdaki ikinci istekte her zaman true döner (yığılır), bu yüzden kilit yalnız ÖRNEKLER ARASI koruma sağlıyor. `@nestjs/schedule` işleri `waitForCompletion` olmadan kuruluyor (repo'da hiç kullanılmıyor), yani 60 sn'den uzun süren dakikalık bir tick bir sonrakiyle AYNI süreçte paralel koşuyor. `ExternalInviteDispatcher` atomik claim taşımıyor (QUEUED satırı gönderim bitene dek QUEUED kalıyor, `sendBatch` durumu yeniden denetlemiyor) ve MANUAL kaynakta 7 günlük fren yok; `DiscoveryRunsService.notifyReady` de `notifiedAt: null` koşulsuz `update` ile damgalıyor.
- **Senaryo:** Bir alıcı yabancı dilli 60 kayıtsız adrese MANUAL davet gönderir (günlük tavan 150). Tick 1 her adres için `ensureTranslated(...,1_500)` beklemesi + Resend çağrısıyla 60 sn'yi aşar; 60. saniyede tick 2 aynı süreçte kilidi (yeniden girişli) alır, tick 1'in henüz işlemediği QUEUED davetleri çeker ve gönderir. Tick 1 bayat anlık görüntüsüyle aynı davetlere ulaşınca `inviteHoldUntil` MANUAL için null döndüğünden aynı soğuk adrese ikinci 'X (Rothern üzerinden)' e-postası gider; `remaining` her tick'te ayrı hesaplandığı için günlük tavan da aşılır. Aynı çakışma `discovery.runs`'ta (tur başına ~1 dk, tick başına 2 tur) iki tick'in `notifyReady` fazı denk gelirse alıcıya çift 'N tedarikçi bulundu' e-postası üretir.
- **Düzeltme:** runExclusive'e süreç içi bir Set<string> (o an çalışan iş adları) ekleyin ve aynı iş zaten koşuyorsa atlayın; ya da dakikalık @Cron'lara waitForCompletion: true verin. Ek güvence olarak dispatcher'da göndermeden önce atomik claim (updateMany state=QUEUED→SENDING, count kontrolü) kullanın; notifyReady'de de updateMany({ where: { id, notifiedAt: null } }) ile dönen count'u kontrol edin.

### M-008 — Akşam özeti 18:00'den sonra her 15 dakikada ayrı e-posta olarak gidiyor (tek özet kuralı delinir)

- `apps/api/src/common/email/email-program-policy.ts:41`, `apps/api/src/modules/email-programs/email-programs.service.ts:126` · S020, S038, X08, X09
- `digestDue` yerel saat ≥18 olduğunda her grubu hemen 'vadesi gelmiş' sayıyor; o gün zaten özet gönderilip gönderilmediğine bakılmıyor. 18:00 özeti gittikten sonra gelen her yeni kategori eşleşmesi (günlük 3 anlık hak dolduğu için) yeni bir `email_digest_items` satırı açar ve bir sonraki 15 dakikalık tick'te ayrı bir 'özet' e-postası olarak gönderilir. Politikanın 'günde 3 anlık + akşam TEK özet' sözü gece yarısına kadar fiilen sınırsız hâle gelir.
- **Senaryo:** Yoğun kategorideki bir satıcı gün içinde 3 anlık e-postayı almış, 18:00'de özetini almıştır. 18:40, 19:10, 20:05, 21:30'da yayınlanan dört yeni eşleşen talep için `emailPrograms.tick` 18:45, 19:15, 20:15, 21:45'te dört ayrı 'N yeni talep' özet e-postası gönderir (her biri tek satır) → alıcı akşam boyunca spam alır, şikâyet/çıkış oranı ve gönderen itibarı zarar görür.
- **Düzeltme:** sendDigests'te her grup için alıcının yerel günü içinde aynı tür özet bağlamıyla (listing_category_digest / listing_invitation_digest) FAILED olmayan bir EmailLog kaydı var mı diye bakın. Varsa grubu ertesi günün 18:00'ine kadar bekletin; bunun için digestDue'ya `lastDigestAt < localDayStart` koşulunu ekleyin.

### M-009 — Admin hesaplarında 2FA zorunlu değil; SUPER_ADMIN yalnız parolayla tam yetki alıyor

- `apps/api/src/modules/admin-auth/admin-auth.service.ts:72` · X18
- Login yalnız `admin.twoFactorEnabled` ise TOTP istiyor. Hiçbir rol, SUPER_ADMIN dahil, için 2FA zorunluluğu yok. Guard ya da strateji de 2FA'sız admin'i kısıtlamıyor. Personel oluşturma geçici parolayla hesabı hemen tam yetkili açıyor. Bu hesaplar KYC belgelerini, IBAN'ları, KVKK silme/dökümünü, personel yönetimini ve paket vermeyi kapsıyor.
- **Senaryo:** Bir SUPER_ADMIN'in parolası başka bir sızıntıdan ele geçer (credential stuffing, 10/dk/IP throttle dağıtık saldırıda yetersiz). Saldırgan parolayla giriş yapar, tüm KYC kimlik taramalarına presigned URL ile erişir, firmaları siler ya da kendine personel hesabı açar.
- **Düzeltme:** AdminJwtStrategy ya da AdminRolesGuard'da twoFactorEnabled=false olan admin'e yalnız /admin/auth/me, /admin/auth/2fa/* ve parola değiştirme uçlarını açın, geri kalanında 403 "2FA kurulumu gerekli" döndürün. Kısa vadede canlıya çıkmadan tüm aktif admin hesaplarında 2FA'yı elle açın.

### M-010 — Admin firma düzenlemede billingEmail biçimi doğrulanmıyor; tüm firma e-postaları bu adrese gidiyor

- `apps/api/src/modules/admin-companies/admin-companies.controller.ts:217` · S002, S009
- `UpdateCompanyProfileDto.billingEmail` yalnız `@IsString @MaxLength(200)` taşıyor. Ne servis (updateProfile) ne de diyalog (edit-profile-dialog.tsx:43, düz `Input`) e-posta biçimini kontrol ediyor. billingEmail'i yalnız admin yazabiliyor (web tarafında bu alanı ayarlayan bir yol yok) ve dolu olduğunda notifyCompanyEmail, pickCompanyRecipients, membership.scheduler, sipariş ve bağlantı bildirimleri kullanıcı yerine bu adrese gidiyor. Admin'in bir yazım hatası, firmanın bütün e-posta akışını sessizce kesiyor.
- **Senaryo:** Admin 'Fatura e-postası' alanına `muhasebe@firma,com` ya da `muhasebe firma.com` yazıp kaydeder; kayıt 201 döner. Sonrasında sipariş, doğrulama, üyelik ve bildirim e-postalarının hepsi bu geçersiz adrese yönlenir ve Resend'de başarısız olur. Firma kullanıcılarına hiçbir e-posta ulaşmaz.
- **Düzeltme:** DTO'da billingEmail'e `@ValidateIf((o) => !!o.billingEmail) @IsEmail()` ekleyin, serviste trim + toLowerCase ile normalize edin. Admin diyaloğunda da alanı type="email" yapın.

### M-011 — IBAN'sız ülkede geçerli IBAN ile gönderilen doğrulama admin tarafından onaylanamıyor (banka adı kapısı tutarsız)

- `apps/api/src/modules/admin-companies/admin-companies.service.ts:1092` · X24
- Tek kaynak `bankDetailsErrors`, IBAN zorunlu olmayan ülkede (RU, BR, JP, CN…) geçerli bir IBAN verildiğinde yalnız SWIFT'i istiyor, banka adını istemiyor (bank-details.ts:127). Web doğrulama ekranı ve API `submit()` bu kuralla çalıştığı için gönderim banka adı olmadan PENDING'e geçiyor. Ama admin onay kapısı `assertKycIdentityComplete` `!usesIban && !c.bankName` ise onayı reddediyor. Aynı veri için firma kapısı ile admin kapısı ayrışıyor.
- **Senaryo:** Brezilyalı (BR, IBAN isteğe bağlı) firma doğrulama ekranındaki hesap alanına geçerli bir BR IBAN'ı, SWIFT'i ve hesap sahibini giriyor, banka adını boş bırakıyor. Eksikler listesi boş, Gönder aktif ve submit başarılı (PENDING). Admin `setVerification`/`reviewDocuments` ile VERIFIED vermek istediğinde 400 alıyor: 'Doğrulama için eksik kimlik bilgisi: banka adı'. Firma PENDING'de kilitli (KYC kilidi yüzünden banka adını kendisi ekleyemiyor). Admin ya banka adını elle yazmak ya da gerekçeli ret vermek zorunda.
- **Düzeltme:** `assertKycIdentityComplete` içindeki banka adı ve IBAN satırlarını kaldırın, yerine `bankDetailsErrors({ country, ...(usesIban ? { iban: c.iban } : { accountNumber: c.iban }), swiftBic: c.bankSwiftBic, bankName: c.bankName }, { requireSwift: true })` sonucuna göre eksik listesini oluşturun. Böylece firma kapısıyla admin kapısı aynı kuralı kullanır.

### M-012 — Şikayet çözümünde askıya almada dahili 'Yönetici notu' şikayet edilen firmaya gerekçe olarak gidiyor

- `apps/api/src/modules/admin-companies/admin-companies.service.ts:2294`, `apps/api/src/modules/admin-companies/admin-companies.service.ts:2297`, `apps/api/src/modules/admin-companies/admin-companies.service.ts:2299` · S010, X18
- resolveComplaint suspend=true iken suspendReason yoksa blockedReason `input.adminNote` olur. Bu değer blockedReason'a yazılıyor ve notifyCompany ile askıya alınan firmaya e-posta ve in-app bildirim olarak `gerekce` parametresiyle gönderiliyor. adminNote dahili bir alan: şikayetçiye bile gösterilmiyor (listMine döndürmüyor), admin UI'da da 'Yönetici notu (opsiyonel) / Karar gerekçesi' diye soruluyor ve suspendReason alanı hiç yok. Yani admin'in iç değerlendirmesi, içinde şikayetçi firmanın adı bile olabilir, karşı tarafa sızıyor.
- **Senaryo:** SUPER_ADMIN şikayetler sayfasında 'Çöz + askıya al' seçer, nota 'ABC Ltd 3 kez sahte teklif şikayeti yaptı, iç inceleme olumsuz' yazar. Askıya alınan firmaya 'Your company account has been suspended... Reason: ABC Ltd 3 kez sahte teklif...' e-postası gider. Böylece şikayetçinin kimliği ve dahili değerlendirme açığa çıkar.
- **Düzeltme:** Serviste adminNote'un blockedReason'a yedek olarak kullanılmasını kaldırın: suspendReason boşsa sabit metni kullanın. Admin UI'da suspend=true iken, firmaya gideceği açıkça yazan ayrı bir "Askıya alma gerekçesi (firmaya iletilir)" alanı ekleyip değeri suspendReason olarak gönderin.

### M-013 — KVKK veri dökümü hakkında açılan şikayetleri şikayetçi kimliği ve admin notuyla birlikte veriyor

- `apps/api/src/modules/admin-companies/admin-companies.service.ts:2400` · X18
- exportData, veri öznesine iletilmek üzere `complaintsReceived` ilişkisini ham satır olarak döndürüyor. Satırda complainantCompanyId, createdById (şikayetçi kullanıcı) ve dahili adminNote var. Ürün şikayet edilen firmaya şikayetleri hiçbir yerde göstermiyor, şikayetçi kimliği gizli. KVKK dökümü bu gizliliği deliyor. Admin notları bilinçli olarak dökümden çıkarılmışken şikayet adminNote'u kalmış.
- **Senaryo:** Şikayet edilen firma KVKK erişim talebinde bulunur. SUPER_ADMIN /admin/companies/:id/export JSON'unu iletir. Firma complaintsReceived[].complainantCompanyId ile kendisini kimin şikayet ettiğini ve admin'in iç değerlendirmesini görür, şikayetçiye misilleme riski doğar.
- **Düzeltme:** complaintsReceived'ı yalnız {id, reason, status, createdAt, resolvedAt} alanlarıyla (select/omit ile) döndürün. complainantCompanyId, createdById, adminNote ve resolvedByAdminId dökümde yer almasın. complaintsMade'den de adminNote ve resolvedByAdminId'yi omit edin.

### M-014 — Sert silme kapısı karşı tarafın mesajlarını, davetlerini ve bilgi taleplerini cascade ile siliyor

- `apps/api/src/modules/admin-companies/admin-companies.service.ts:2577`, `apps/api/src/modules/admin-companies/admin-companies.service.ts:2614` · S010, X18
- Koddaki kural şu: karşı tarafın kaydını etkileyen herhangi bir iz varsa sert silme yapılmaz. Ancak kapı yalnız firmanın GÖNDERDİĞİ mesajları (messagesSent) sayıyor. Şu üç durumda karşı tarafın kaydı yine de siliniyor. (1) Karşı tarafın yazıp bu firmanın hiç yanıtlamadığı MessageThread'ler: iki firma ilişkisinde de onDelete Cascade var. (2) Başka alıcıların taleplerine yapılmış ListingInvitation'lar (ListingInvitee Cascade). (3) Kayıtlı alıcıların bu firmanın ürünlerine gönderdiği PublicInquiry'ler (companyId Cascade, claimedCompanyId = alıcı).
- **Senaryo:** Alıcı A, tedarikçi S'ye 5 mesaj ve bir ürün bilgi talebi gönderiyor, S'yi bir talebine de davet ediyor. S hiç yanıt vermiyor ve teklif ya da siparişi yok. S'nin KVKK silmesinde tüm retentionCounts 0 olduğu için company.delete çalışıyor. A'nın gelen kutusundaki thread ve mesajlar, 'Bilgi taleplerim' listesindeki talep ve talebinin davetli listesindeki S kaydı iz bırakmadan kayboluyor.
- **Düzeltme:** `_count`'a threadsAsBuyer/threadsAsSeller ekleyip retentionCounts'a katın. Gerekirse listingInvitations ve claimedCompanyId dolu PublicInquiry sayısını da ekleyin; böylece bu izlerden biri varsa firma anonimleştirme dalına düşer.

### M-015 — KVKK anonimleştirme banka hesaplarını, adres kişilerini ve bekleyen davetleri silmiyor

- `apps/api/src/modules/admin-companies/admin-companies.service.ts:2684`, `apps/api/src/modules/admin-companies/admin-companies.service.ts:2685` · S010, X07, X18
- Anonimleştirme transaction'ı yalnız Company kolonlarını, kycRevision'ları ve kullanıcıları temizliyor. CompanyBankAccount satırları (accountHolder, IBAN/hesap no), CompanyAddress satırları (contactName, phone, addressLine, taxNumber) ve CompanyUserInvitation satırları (davet edilen e-postalar, geçerli token) duruyor. Company'deki bankSwiftBic, bankName, linkedinUrl ve instagramUrl de temizlenmiyor. Şahıs firmasında hesap sahibi ve adres kişisi doğrudan kişisel veri.
- **Senaryo:** Şahıs şirketi sahibi kvkk@ üzerinden silme ister. Firmanın siparişi olduğu için anonimleştirme dalı çalışır. Buna rağmen company_bank_accounts'ta 'Ahmet Yılmaz / TR..IBAN', company_addresses'te 'Ahmet Yılmaz, 0532...' süresiz kalır. exportData bu satırları döndürmeye de devam eder.
- **Düzeltme:** Anonimleştirme transaction'ına companyBankAccount.deleteMany ve companyUserInvitation.deleteMany ekleyin. companyAddress satırlarında contactName/phone/addressLine/taxNumber/taxOffice alanlarını null'layın (ya da silin; bid FK'sı SetNull). Company'de bankSwiftBic, bankName, linkedinUrl ve instagramUrl alanlarını da null'layın.

### M-016 — Admin 'Aktifleştir' koltuk kapısını atlıyor — paket limiti aşılabiliyor

- `apps/api/src/modules/admin-companies/admin-company-users.service.ts:111` · S003, X18
- Kök neden backend'de, görünen yer users-tab.tsx:364-377 'Aktifleştir'. Admin setActive(active=true) hiç koltuk kontrolü yapmadan isActive=true yazıyor. CLAUDE.md 'davet/kabul/atama/reaktivasyon aynı kapı' diyor ve firma tarafındaki reaktivasyon assertSeatAvailable'ı kilitli tx içinde çağırıyor. Admin yolunda bu kapı yok.
- **Senaryo:** SILVER bir firmada (limit 4) admin bir SATISCI'yi devre dışı bırakıyor. Firma boşalan koltuğa yeni bir satışçı davet edip onu kabul ettiriyor (4/4). Admin eski kullanıcıyı 'Aktifleştir' ile geri açıyor ve 5/4 koltuk oluşuyor. Paket düşürülmüş bir firmada ya da GOLD'dan düşmüş bir satınalmacıyı geri açarken buy kapısı da atlanmış oluyor.
- **Düzeltme:** active=true iken kullanıcının seatGroupsOf ile koltuk grubu varsa, firma tarafındaki reaktivasyondaki gibi firma satırını kilitleyen bir tx içinde grup bazlı koltuk ve paket kapısı (buy için GOLD) çalıştırılmalı. En iyisi assertSeatAvailable ortak bir yardımcıya taşınıp admin addUser ile setActive'de de kullanılmalı.

### M-017 — Admin 'Kullanıcı Ekle' GOLD dışı firmaya satınalma koltuğu verebiliyor, bekleyen davetleri saymıyor

- `apps/api/src/modules/admin-companies/admin-company-users.service.ts:207` · S003, X23
- Kök neden backend'de, görünen yer users-tab.tsx:58-63. AddUserDialog her firmaya SATIN_ALMACI rolünü sunuyor. addUser sadece SEAT_LIMITS sayısına bakıyor. CLAUDE.md'deki 'SATINALMA YETKİSİ YALNIZ GOLD'DA VERİLEBİLİR' kapısını (assertSeatAvailable buy-grup reddi) ve bekleyen koltuk davetlerinin rezervasyonunu uygulamıyor; FOR UPDATE kilidi de yok.
- **Senaryo:** STANDART bir firmada kurucu tek SATIŞ koltuğunu tutuyor (used=1, limit=2). SALES rolündeki admin Kullanıcılar sekmesinden rol=SATIN_ALMACI ile kullanıcı ekliyor. used+1=2 <= 2 olduğu için kayıt açılıyor ve kullanıcıya buy:listing:manage/buy:award izinleri yazılıyor. Böylece ücretsiz pakette satınalma yetkisi verilmiş oluyor. Firmanın bekleyen bir SATISCI daveti varsa o davet kabul edildiğinde de limit aşılıyor.
- **Düzeltme:** addUser, company tarafındaki assertSeatAvailable mantığını kullanmalı: groups=seatGroupsOf(yeni izinler), includePending=true, firma satırında FOR UPDATE kilidi alan bir tx içinde. Admin UI'da efektif kademe GOLD değilse SATIN_ALMACI seçeneği devre dışı bırakılmalı.

### M-018 — Admin eliyle eklenen üye kullanıcı sözleşmesini, aracılık sözleşmesini ve KVKK metnini hiç onaylamıyor

- `apps/api/src/modules/admin-companies/admin-company-users.service.ts:238` · X17
- Kayıt ve davet kabulünde termsAcceptedAt/mediationAcceptedAt/kvkkAcceptedAt kişi bazında yazılıyor. addUser ise bu alanları boş bırakarak hesap açıyor. Kullanıcı sıfırlama bağlantısıyla parola koyup platformu kullanıyor ve hiçbir ekranda onay istenmiyor: web'de termsAccepted yalnız kayıt ve davet formlarında var, girişte yeniden onay kapısı yok.
- **Senaryo:** Destek ekibi 'yeni üye ekleyin' çağrısı üzerine admin panelinden kullanıcı ekliyor. Kişi e-postadaki bağlantıyla parolasını belirleyip teklif veriyor ve sipariş yönetiyor. DB'de bu kişi için sözleşme/KVKK onay izi yok (termsAcceptedAt=null); hukuki uyuşmazlıkta onay kanıtlanamıyor.
- **Düzeltme:** /me yanıtına needsTermsAcceptance bayrağı ve bir kabul ucu (POST) ekleyin. Üç onay alanı null olan kullanıcıya ilk girişte zorunlu onay ekranı gösterin. Alternatif olarak admin eklemeyi, kullanıcının onayı kendisinin verdiği davet akışına yönlendirin.

### M-019 — Admin talep müdahaleleri (kapat/uzat/yeniden aç) teklifçi ve davetlilere hiç bildirilmiyor

- `apps/api/src/modules/admin-companies/admin-inspection.service.ts:297` · S011
- closeListing, extendListing ve reopenListing yalnızca talep sahibine notifyCompany gönderiyor. Davetli ve teklif veren tedarikçilere bildirim yok; sahip tarafındaki kardeş changeClosingTime ise notifyListingParticipants ile tüm katılımcıları bilgilendiriyor. Sınıf başlığı 'ilgili taraflara bildirimli' diyor ama taraflar yalnızca sahipten ibaret kalıyor. En ağır durum, IN_AWARD'dan yeniden açmada ortaya çıkıyor: tedarikçiler az önce 'kapandı' bildirimi almıştı ve talebin tekrar teklife açıldığını hiç öğrenmiyorlar.
- **Senaryo:** Alıcı 'Değerlendirmeye Al'a yanlışlıkla basıyor, talep IN_AWARD'a geçiyor ve davetlilere kapanış bildirimi gidiyor. Destek, reopenListing ile talebi 7 gün daha açıyor. Davetli 10 tedarikçiye ne e-posta ne zil bildirimi gidiyor, o yüzden yeni teklif gelmiyor ve yeniden açma işe yaramıyor. Aynı şey extendListing için de geçerli: teklifçiler sürenin uzadığını bilmiyor. closeListing'de de teklif veren firmalara neden kapandığı söylenmiyor.
- **Düzeltme:** notifyListingParticipants'ı paylaşılan bir servise taşıyın ya da public yapın. closeListing, extendListing ve reopenListing sonrasında davetli ve teklifçilere de "kapatıldı", "süre uzatıldı" ve "yeniden açıldı" bildirimlerini gönderin, realtime ping'ini de katılımcıları kapsayacak şekilde genişletin.

### M-020 — Admin referans daveti geri alma satırı SİLİYOR, bağlı talep davetleri ve adres freni de gidiyor

- `apps/api/src/modules/admin-companies/admin-inspection.service.ts:635` · S002, S007
- Admin panelindeki `useRevokeInvite` (apps/admin/src/hooks/use-admin-inspection.ts:263-266) `DELETE /admin/referral-invites/:id` çağırıyor, backend `revokeReferralInvite` de `companyReferralInvite.deleteMany` ile satırı fiziksel olarak siliyor. `ExternalListingInvite.referralInvite` `onDelete: Cascade` olduğu için o adrese gitmiş/kuyruktaki bütün talep davetleri, günlük tavan ve 7 günlük fren geçmişi de siliniyor. B5-4 (firma iptali) ve B13-3 (paket düşüşü) yollarında satır artık CANCELLED'a çekiliyor, bu üçüncü yol (admin) atlanmış; CLAUDE.md kuralı açık: "Kayıtsız adrese davet SİLİNMEZ, iptal edilir".
- **Senaryo:** Alıcı firma bir adrese 3 talep daveti göndermiş (external_listing_invites'ta 3 satır, bir kısmı QUEUED). SALES rolündeki admin firma detayındaki Bağlantılar sekmesinden bekleyen referans davetini geri alıyor. Referral satırı siliniyor, cascade 3 talep davetini de götürüyor. Adres freni geçmişi sıfırlandığı için aynı adrese hemen yeniden soğuk davet gidebiliyor, ölçüm hunisi (/admin/buyume) de geçmiş davetleri kaybediyor.
- **Düzeltme:** `deleteMany` yerine `updateMany({ where: { id, status: "PENDING" }, data: { status: "CANCELLED" } })` kullanın. Ardından `externalListingInvite.updateMany({ where: { referralInviteId: id, state: "QUEUED" }, data: { state: "CANCELLED", cancelReason: "REFERRAL_CANCELLED" } })` ile kuyruktaki talep davetlerini de iptal edin; firma tarafındaki cancelReferralInvite ile aynı desen, ikisi tek transaction

### M-021 — STANDART havuzunda Google Search'lü profil doldurma her zaman istek tavanına takılıyor

- `apps/api/src/modules/ai/ai.config.ts:188` · S013
- STANDART havuzu 0,5 USD, requestShare 0,05, yani istek başı tavan 0,025 USD. Oysa yalnız GROUNDED_REQUEST_USD 0,035 USD, üstüne Flash çıktı tahmini de ekleniyor (8192 × 2,5/1M ≈ 0,0205). Grounded rezervasyon tahmini ≈0,056 USD olduğundan `reserve()` her seferinde `request_cap` döndürüyor. profile-enrich.service.ts:201-217 bu hatayı yakalayıp 503 'AI şu an yanıt veremedi' mesajına çeviriyor ve günlük deneme hakkı yine de düşüyor.
- **Senaryo:** Ücretsiz (STANDART) bir firmanın sitesi çekilemiyor (JS ile render edilen site, bot engeli, zaman aşımı). usingSearch=true olunca callAi({webSearch:true}) çağrılıyor, reserve 0,056 > 0,025 olduğu için AiBudgetExceededException fırlatıyor. Kullanıcı günde 3 kez deneyip her seferinde 'AI şu an yanıt veremedi' görüyor; ücretsiz paketin tek AI özelliği bu firmalar için hiç çalışmıyor.
- **Düzeltme:** STANDART'ta grounded yolu için istek tavanını karşılayacak bir havuz/pay (ör. STANDART requestShare'i 0,25'e çıkarmak) tanımlayın ya da STANDART'ta site okunamazsa grounding'e düşmeden "site okunamadı" hatası dönün ve bu durumda günlük deneme sayacını düşürmeyin.

### M-022 — Asistan yayın onay kartında kapanış ham UTC ISO dizesi olarak gösteriliyor

- `apps/api/src/modules/ai/assistant/assistant-actions.service.ts:224` · S013, X13
- Bağlayıcı alanların tamamını göstermesi gereken onay kartı `closesAt: dto.closesAt` değerini biçimlendirmeden basıyor. Kullanıcı '2026-10-15T00:00:00.000Z' görüyor: gerçek kapanış (İstanbul 03:00) anlaşılmıyor ve EN/RU kullanıcıya dilim etiketi de gitmiyor. Önceki bulgudaki yanlış kapanış saati bu yüzden onay adımında fark edilemiyor.
- **Senaryo:** Türk kullanıcı kartta 'Kapanış: 2026-10-15T00:00:00.000Z' görüp 15 Ekim gün sonu sanıyor ve onaylıyor. Talep 15 Ekim 03:00'te kapanıyor.
- **Düzeltme:** Satır 224'te ham değer yerine formatNotificationDate(new Date(dto.closesAt), currentLocale(), "dateTime") kullanılmalı (apps/api/src/common/notifications/notification-params.ts:112). Böylece tarih okuyucunun dilinde, İstanbul saatiyle ve dilim etiketiyle basılır, closesAt yoksa "-" gösterilir.

### M-023 — Asistanla teklif, kesirli miktarlı kalemlerde onaydan sonra doğrulamada düşüyor

- `apps/api/src/modules/ai/assistant/assistant-actions.service.ts:423` · S013, X21
- `proposePlaceBid`, `amount` alanına Σ(miktar × birim fiyat) değerini yazıyor. Kalem miktarı 3 ondalığa kadar (Decimal(18,3), CreateListingDto maxDecimalPlaces 3), fiyat 2 ondalık olduğundan toplam 5 ondalığa çıkabiliyor. Confirm anında `validatePendingDto(PlaceBidDto)` `amount` için `maxDecimalPlaces: 2` uyguluyor ve kritik onay kartı kullanıcı tarafından onaylandıktan sonra istek 400 ile reddediliyor; pendingAction da o sırada düşürülmüş oluyor. Kalemli teklifte servis `dto.amount`'u zaten kullanmıyor, tutarı kalemlerden hesaplıyor (web de kalemli teklifte amount göndermiyor). 2'den fazla ondalıklı birim fiyat da propose aşamasında reddedilmiyor, yalnız confirm'de düşüyor.
- **Senaryo:** Satıcı asistana '12,5 kg kalem için birim fiyat 3,33 TL' diyor. Onay kartı 41,625 TL toplamla çıkıyor, kullanıcı 'Onayla'ya basıyor. validatePendingDto 'amount must be a number conforming to the specified constraints' ile 400 dönüyor ve teklif verilemiyor. kg/m/ton gibi kesirli birimli B2B taleplerinde asistan yolu sürekli bozuk.
- **Düzeltme:** Kalemli teklifte `amount` alanını DTO'ya koymayın (web ile aynı sözleşme, servis tutarı kalemlerden hesaplıyor), toplamı yalnız özet kartında gösterin. Birim fiyatları da propose aşamasında 2 ondalık ve MAX_MONEY sınırına göre doğrulayıp sorunu `problem` olarak modele geri verin.

### M-024 — Asistanla yayında teslimat adresi varsayılanı yok sayarak seçiliyor ve kartta görünmüyor

- `apps/api/src/modules/ai/assistant/assistant-actions.service.ts:579` · S013
- draftToCreateDto, TESLIMAT ve ILETISIM adresleri arasından en eski oluşturulanı alıyor. `isDefault` bayrağına ve TESLIMAT önceliğine bakmıyor. Web hızlı talep formu ise önce varsayılan TESLIMAT'ı, sonra herhangi bir TESLIMAT'ı seçiyor (quick-request.tsx:224). Seçilen adres kritik onay kartında da gösterilmediğinden kullanıcı yanlış adresi fark edemiyor ve talep bu adresle canlıya çıkıyor.
- **Senaryo:** Firma önce 'Merkez' adlı bir İLETİŞİM adresi, sonra varsayılan olarak işaretli bir 'Depo' TESLİMAT adresi ekledi. Asistanla yayınlanan talep, teslimat adresi olarak Merkez'i (iletişim adresini) taşıyor. Tedarikçiler nakliyeyi yanlış konuma göre fiyatlıyor, sipariş yanlış adrese sevk edilebiliyor.
- **Düzeltme:** Adresi web ile aynı öncelikle seç: önce request-defaults'taki deliveryAddressId, sonra varsayılan TESLİMAT, sonra herhangi bir TESLİMAT, en son İLETİŞİM. Seçilen adresin başlığını ve şehrini publish_tender onay kartının özetine ayrı bir satır olarak ekle.

### M-025 — Asistanla yayınlanan talep, kapanış gününün UTC gece yarısında kapanıyor

- `apps/api/src/modules/ai/assistant/assistant-actions.service.ts:597` · X21
- Çıkarım ve refine istemleri tarihleri 'YYYY-MM-DD' olarak istiyor. Sanitizer bunu `new Date(v).toISOString()` ile UTC 00:00'a çeviriyor (ai-draft-sanitizer.ts:137,151). Asistanın `request_publish_tender` yolu bu değeri form olmadan doğrudan `closesAt` olarak `listings.create`'e veriyor; onay kartında da ham ISO dizesi ('2026-10-30T00:00:00.000Z') görünüyor. Ayrıca asistan istemine bugünün tarihi ve kullanıcının saat dilimi verilmiyor, bu yüzden model yılı belirtilmemiş ya da göreli tarihleri güvenilir çözemiyor.
- **Senaryo:** TR'deki alıcı asistana 'kapanış 30 Ekim' deyip yayınlamayı onaylıyor. Talep 30 Ekim 03:00'te (TR saati) kapanıyor, alıcı gün sonunu bekliyordu. ABD'deki bir alıcıda talep 29 Ekim akşamı, yani söylenen günden bir gün önce kapanıyor ve teklifler kayboluyor.
- **Düzeltme:** `draftToCreateDto` içinde yalnız gün içeren `bidsCloseAt` değerini uygulamanın duvar saatine göre gün sonuna (ya da formun varsayılan kapanış saatine) çevirin; sanitizer'ın ISO çıktısında saat 00:00Z ise bunu yalnız gün sayabilirsiniz. Onay kartında kapanışı okuyucunun diline ve yerel saatine göre biçimlendirin. Asistan sistem istemine bugünün tarihini ve saat dilimini ekleyin.

### M-026 — Asistan istemine bugünün tarihi verilmiyor; göreli ya da yılsız kapanış tarihleri geçmiş yıla düşüp sessizce siliniyor

- `apps/api/src/modules/ai/assistant/assistant.prompts.ts:60` · X13
- Sistem istemi ve taslak bağlamında güncel tarih/saat yok (`assistantSystemPrompt`, `buildDraftContext`), ama asistandan 'KAPANIŞ TARİHİ' toplayıp ISO üretmesi isteniyor. Model '2 hafta sonra' ya da '15 Ekim' gibi ifadeleri eğitim kesim yılına göre yazıyor (ör. 2025-10-15). Sanitizer `future: true` ile geçmiş tarihi `validation_failed` olarak null'a çeviriyor ve bidsCloseAt yeniden eksik sayılıyor.
- **Senaryo:** Kullanıcı 'kapanış 10 gün sonra olsun' diyor, model '2025-10-09' üretiyor ve sanitizer bunu siliyor. Asistan kapanış tarihini tekrar tekrar soruyor ya da yanlış yıla ait bir tarih öneriyor, taslak yayınlanamıyor.
- **Düzeltme:** assistant.service.ts'de her turda sistem istemine "Şu an: <Europe/Istanbul ISO, +03:00 ofsetli>, saat dilimi Europe/Istanbul" satırını ekleyin. Kapanış tarihini bu dilimde ve ofsetli ISO biçiminde üretmesini istemde açıkça isteyin.

### M-027 — İngilizce sayı biçimi (1,500.50) 1000 kat düşük fiyat olarak okunuyor

- `apps/api/src/modules/ai/bid-price-extract/bid-price-extract.service.ts:208` · S014
- parseModelNumber, değerde hem nokta hem virgül varsa hangisinin sonda geldiğine bakmadan her zaman TR biçimi varsayıyor: noktaları siliyor, virgülü ondalık yapıyor. EN/uluslararası belgelerde sık görülen "1,500.50" biçimi 1.5005 olarak okunuyor. Prompt modelden 'belgede yazdığı gibi' çıkarmasını istediği için bu biçim pratikte geliyor. 2026-08-24 Parça 6 #8'deki düzeltme hatanın yönünü tersine çevirdi: artık fiyat 1000 kat AŞAĞI okunuyor ve teklif geri çekilemiyor.
- **Senaryo:** Tedarikçi İngilizce proformasında "Unit price 1,500.50 USD" yazıyor, model unitPrice olarak "1,500.50" döndürüyor ve parseModelNumber bunu 1.5005 olarak okuyor. Önizlemede birim fiyat 1.50 USD görünüyor. Kullanıcı fark etmezse teklifi 1000 kat düşük fiyatla gönderiyor ve teklif geri çekilemiyor.
- **Düzeltme:** İki ayraç birlikte gelince sonda duran ayraç ondalık kabul edilmeli: lastIndexOf('.') > lastIndexOf(',') ise virgüller silinmeli, değilse noktalar silinip virgül noktaya çevrilmeli. Birden çok virgül varsa ya da virgülden sonra tam 3 hane geliyorsa ve docLanguage EN ise ("1,500"), değer binlik kabul edilmeli veya belirsiz diye null dönülerek önizlemede işaretlenmeli.

### M-028 — Ücretsiz pakette başarısız AI denemesi tek seferlik profil hakkını yakıyor

- `apps/api/src/modules/ai/profile-enrich/profile-enrich.service.ts:118` · S014
- Ücretsiz paketin ömür boyu tek hakkı, aiUsage satırları status filtresi olmadan sayılarak kontrol ediliyor. callAi rezervasyonu RESERVED satırı açar, hata olunca bu satır FAILED yapılır ama silinmez. Sağlayıcı hatası, zaman aşımı, JSON parse hatası ya da boş aboutText gibi kullanıcıya hiçbir taslak dönmeyen denemeler de hakkı tüketiyor. Ayrıca bu kontrol FOR UPDATE kilidinin dışında olduğu için eşzamanlı istekler hakkı aşabiliyor.
- **Senaryo:** Ücretsiz firma 'Profili AI ile oluştur'a basıyor. Gemini 503 veriyor (kodda sık görüldüğü not edilmiş) ve kullanıcı ServiceUnavailable hatası görüyor. aiUsage'da feature=profile_enrich olan FAILED bir satır kalıyor. Kullanıcı tekrar denediğinde count=1 olduğu için kalıcı olarak 'ücretsiz pakette bir kez' hatası alıyor ve hiç taslak almadan hakkını kaybediyor.
- **Düzeltme:** Ömürlük hak, başarılı dönüşte yazılan `company.profile_enriched` kaydından sayılmalı ya da en azından yalnız `status: "SETTLED"` satırlar sayılmalı. Sayım, FOR UPDATE kilidi alınan runTenantTx bloğunun içine taşınmalı. Başarılı kayıt şu an `void audit.log` ile hatayı yutarak yazılıyor, bu kayıt ya await edilmeli ya da kalıcı yazılmalı.

### M-029 — Ücretsiz firmada profil AI'ı site metni çekilemezse her seferinde bütçe kapısında düşüyor

- `apps/api/src/modules/ai/profile-enrich/profile-enrich.service.ts:209` · X21
- Site çekilemediğinde ya da metin 200 karakterden kısa olduğunda (JS ile çizilen siteler) akış `webSearch: true` ile grounding yoluna geçiyor. Bu durumda `callAi` tahminine `GROUNDED_REQUEST_USD` (0,035) ekleniyor. STANDART havuz 0,5 USD, istek başı tavan `requestShare` 0,05 yani 0,025 USD; 0,035 > 0,025 olduğu için rezervasyon her zaman `request_cap` ile reddediliyor. `.catch` bu reddi '503 AI şu an yanıt veremedi, birkaç dakika sonra deneyin' mesajına çeviriyor ve günlük 3 deneme hakkından biri yanıyor. CLAUDE.md'nin 'ücretsizde de firma başına bir kez açık' kararı bu siteler için hiç çalışmıyor; test `callAi`'yi mock'ladığı için bu hesap yakalanmıyor.
- **Senaryo:** Ücretsiz (STANDART) bir firma, sitesi SPA olduğu (ya da bot'u engellediği) için 'Profilimi AI ile doldur'a basıyor. fetchSite null dönüyor, grounded çağrının tahmini 0,035 USD, tavan 0,025 USD, AiBudgetExceededException fırlıyor, kullanıcı 'birkaç dakika sonra deneyin' görüyor. Üç denemenin üçü de aynı şekilde düşüyor ve profil hiç dolmuyor.
- **Düzeltme:** STANDART'ta ya grounding yolunu kapatıp net bir "siteniz okunamadı" 400'ü dönün, ya da profile_enrich için istek tavanını grounding ücretini (yaklaşık 0,06 USD) karşılayacak şekilde ayırın. Ayrıca AiBudgetExceededException'ı 503'e çevirmeden olduğu gibi iletin.

### M-030 — parseModelNumber İngilizce binlik ayracını ondalık okuyor: "1,500" → 1.5

- `apps/api/src/modules/ai/search-intent/search-intent.service.ts:366` · S015
- `^\d+,\d+$` dalı virgülü her zaman ondalık sayıyor. EN kullanıcının yazdığı (ve modelin aynen kopyaladığı) "1,500" / "10,000" gibi değerler 1000 kat küçük okunuyor. Prompt binlik ayracı yasaklamıyor (yalnız "1500", "1500,50" örneği veriyor); istek dili (`currentLocale()`) elde olduğu hâlde kullanılmıyor.
- **Senaryo:** EN arayüzde "10,000 pcs M6 bolts under $1,500" → model quantity="10,000", priceMax="1,500" döner → quantity=10, priceMax=1.5. Ürün sayımı moqMax=10 ve 1,5 USD tavanıyla yapılır (gerçek ürünler elenir, gevşetme gereksiz yere süzgeç kaldırır); satınalma taslağına kalem miktarı 10 olarak yazılır.
- **Düzeltme:** İsteme bid-price-extract'teki gibi "binlik ayracı YOK" kuralı eklenmeli. parseModelNumber'da da `^\d{1,3}(,\d{3})+(\.\d+)?$` deseni (tam 3 haneli virgül grupları) binlik ayracı olarak okunmalı, ya da locale parametre olarak geçirilip en/ru için virgül+3 hane binlik sayılmalı.

### M-031 — SeoEnrichDto, servisin kendi kırpma mantığından sıkı: 'AI ile açıklama yaz' uzun kalem/etikette 400

- `apps/api/src/modules/ai/seo-enrich/seo-enrich.controller.ts:17` · X05
- Servis `facts` öğelerini 200 karaktere ve 40 adede kendisi kırpıyor (seo-enrich.service.ts:37). Ancak DTO aynı sınırları doğrulama olarak uyguladığı için istek servise hiç ulaşmıyor. Hızlı talep kartı her kalemi `${name} — ${qty} ${unit}: ${description}` biçiminde gönderiyor; kalem açıklaması 2000 karaktere, kalem sayısı 500'e kadar çıkabiliyor. Ürün formu da 50 karaktere kadar kabul ettiği etiketleri gönderiyor, bu uç ise etiket başına en çok 40 karakter kabul ediyor.
- **Senaryo:** Alıcı hızlı talepte 180 karakterlik teknik açıklamalı bir kalem girip 'AI ile açıklama yaz'a basar → facts[0] > 200 karakter → 400 → 'AI açıklama yazamadı'. 41+ kalemli taleplerde de aynı hata çıkar. Ürün formunda 45 karakterlik bir etiket kayıtlıyken 'AI ile güçlendir' 400 döner.
- **Düzeltme:** DTO'da facts ve keywords için yalnız tür denetimi ve cömert bir tavan bırakın (ör. öğe başına 5000 karakter, 500 adet), kırpmayı servisteki mevcut mantığa bırakın. keywords öğe sınırını en az ShowcaseDto ile aynı değere (50) çekin, ya da istemci göndermeden önce kırpsın.

### M-032 — AI tedarikçi keşfi ve soğuk davetler kayda kapalı ülkeleri (ABD, İran, Suriye, Küba, K. Kore) süzmüyor

- `apps/api/src/modules/ai/supplier-discovery/supplier-discovery.service.ts:404` · X24
- Keşif yalnız DE/CA'yı (`COLD_INVITE_CONSENT_COUNTRIES`) dışarıda bırakıyor. `REGISTRATION_BLOCKED` ülkelerindeki adaylar SUGGESTED oluyor ve davet e-postası alıyor. Talebin hedef ülkeleri de yalnız `isValidCountryCode` ile denetlendiği için talep doğrudan ABD'ye ya da İran'a açılabiliyor. Davet edilen firma kayıt olsa bile onboarding'de ülkesini seçemiyor (web listede göstermiyor, API reddediyor). Üstelik yasak gerekçesi (ABD'li Resend vb. sağlayıcıların koşulları) tam da bu e-postaları kapsıyor.
- **Senaryo:** TR alıcı tüm ülkelere açık bir talepte AI keşfini çalıştırıyor. ABROAD geçişinde model güçlü üretici ülke olarak ABD'yi (ya da fıstık/safran/petrokimya kaleminde İran'ı) seçiyor. `country='US'` olan adaylar SUGGESTED geliyor ve Resend üzerinden davet gidiyor. Davetli linke tıklayıp hesap açıyor, e-postasını doğruluyor, onboarding'de ülke listesinde ABD'yi bulamıyor: ya kayıt yarıda kalıyor ya da gerçek dışı bir ülke seçiyor (ön doldurma US'yi bilerek atlıyor).
- **Düzeltme:** Keşifte (annotate veya :404 süzgeci) herhangi bir ülke ipucunda (etiket, e-posta ya da site uzantısı) REGISTRATION_BLOCKED'a düşen aday elenmeli, ABROAD istemindeki HARİÇ listesine de bu ülkeler eklenmeli. Davet gönderiminde (company-connections) ve talep targetCountries doğrulamasında bu ülkeler reddedilmeli.

### M-033 — AI kapanış tarihi ofsetsiz/tarih-only geldiğinde UTC sayılıyor, talep İstanbul 03:00'te ya da 3 saat geç kapanıyor

- `apps/api/src/modules/ai/tender-extract/ai-draft-sanitizer.ts:137` · S015, X13
- Çıkarım istemi tarihleri 'YYYY-MM-DD' istiyor, asistan aracı da yalnız 'ISO' diyor. `isoDate` bu değeri doğrudan `new Date()` ile okuyor. Render sunucusu UTC'de çalıştığı için '2026-10-15' 15 Ekim 00:00Z, yani İstanbul 03:00 oluyor; '2026-10-15T17:00:00' (ofsetsiz) ise 17:00Z, yani İstanbul 20:00. Asistanın `request_publish_tender` yolu bu değeri `draftToCreateDto` ile doğrudan canlı ilanın `closesAt`'ine yazıyor.
- **Senaryo:** Belgede 'son teklif 15.10.2026' yazıyor ya da kullanıcı asistana 'kapanış 15 Ekim' diyor. Talep 15 Ekim 03:00 (TR) kapanıyor: gün sonu (23:59) yerine yaklaşık 21 saat erken. Tedarikçiler son gün teklif veremiyor ve cron talebi değerlendirmeye alıyor. 'Saat 17:00' denirse talep 20:00'de kapanıyor.
- **Düzeltme:** `bidsCloseAt` için tarih-only değeri İstanbul 23:59'a, ofsetsiz datetime'ı da `zonedTimeToUtc(..., 'Europe/Istanbul')` ile İstanbul duvar saatine çevirin. İstem ve araç şemasında '+03:00 ofsetli ISO' isteyin, onay kartında tarihi İstanbul saatiyle biçimlendirilmiş gösterin.

### M-034 — AI CSV yolunda ayraç tespiti yok; Türkçe Excel'in noktalı virgüllü CSV'si virgülden bölünüp miktarlar bozuluyor

- `apps/api/src/modules/ai/tender-extract/ai-extract-router.ts:205` · S016
- `wb.csv.read(Readable.from(buffer))` varsayılan ',' ayraçla okunuyor; kardeş yollar (`listing-item-import.service.ts:236-237`, `common/files/spreadsheet-reader.ts:103-104`) `detectCsvDelimiter` ile ';'/','/TAB tespiti yapıyor. Türkçe Windows'ta Excel 'CSV' kaydı ';' ayraçlı ve ondalık ayırıcı ',' olduğundan satırlar ondalık virgülden bölünür. Modele giden tablo metninde miktar/fiyat parçalanmış olarak görünür ve yanlış miktar çıkarılır.
- **Senaryo:** Satır `Kablo NYA 2,5 mm²;120,5;metre` → ExcelJS hücreleri ["Kablo NYA 2", "5 mm²;120", "5;metre"] → prompt'a `| Kablo NYA 2 | 5 mm²;120 | 5;metre |` gider; AI kalem adını/miktarı (ör. 120 veya 5) yanlış doldurur, kullanıcı fark etmezse talep yanlış miktarla yayınlanır.
- **Düzeltme:** spreadsheet-reader.ts içindeki detectCsvDelimiter'ı export edin ve ai-extract-router.ts:205'te `wb.csv.read(Readable.from(buffer), { parserOptions: { delimiter: detectCsvDelimiter(buffer) } })` şeklinde kullanın. listing-item-import.service.ts'deki kopyayı da aynı ortak fonksiyona bağlayın.

### M-035 — HEIC çözme piksel sınırı olmadan yapılıyor; görsel bombası sharp'ın 60MP kapısından önce belleği tüketiyor

- `apps/api/src/modules/ai/tender-extract/ai-extract-router.ts:339`, `apps/api/src/modules/ai/tender-extract/ai-extract-router.ts:349` · S016, X15
- toResizedJpegPart HEIC dosyalarını sharp'a gelmeden önce heic-convert ile çözüyor. heic-decode başlıktaki genişlik/yükseklik değerine göre hiçbir kontrol yapmadan önce new Uint8ClampedArray(width*height*4) ayırıyor, ardından jpeg-js ile saf JS'te yeniden kodluyor. limitInputPixels (60MP) ancak bu adımdan sonra çalışıyor. Birkaç MB'lık, çok büyük boyut beyan eden bir HEIC, 512MB'lık tek süreci OOM'a sokabilir.
- **Senaryo:** SILVER+ paketli, AI erişimi olan bir kullanıcı ai/uploads/url ile 20000x20000 boyutlu, tek renkli ve sıkıştırılmış bir HEIC yükler (birkaç MB), sonra /company/ai/tender-extract çağırır. heic-decode 1.6GB'lık dizi ayırmaya çalışır, libheif de ayrıca bellek kullanır, süreç OOM ile ölür ve tüm kiracılar için API kesintiye girer.
- **Düzeltme:** heicConvert'ten önce heic-decode'un `all` API'siyle (decode etmeden, yalnızca image.get_width()/get_height() okuyarak) ya da ispe kutusunu ayrıştırarak w*h > MAX_IMAGE_PIXELS (tercihen HEIC için daha düşük, örn. 50 MP) ise 400 döndürün. Alternatif olarak HEIC decode'unu bellek sınırlı bir worker'a taşıyın.

### M-036 — Upload MIME allowlist'i Windows'taki CSV (application/vnd.ms-excel) ve HEIC (boş tip) dosyalarını reddediyor

- `apps/api/src/modules/ai/tender-extract/tender-extract.service.ts:95` · S016
- `uploadUrl` istemcinin `file.type` değerini katı listeyle karşılaştırıyor; web (`use-ai-tender-import.ts:16-17`, `use-bid-import.ts:72-73`) `file.type`'ı olduğu gibi gönderiyor ve dialog `accept=".pdf,...,.heic,.xlsx,.csv"` sunuyor. Excel kurulu Windows'ta tarayıcı .csv için `application/vnd.ms-excel`, HEIC codec'i yoksa .heic için boş string raporlar. Gerçek tür zaten sonradan magic-bytes ile (`routeExtractInput`) doğrulandığı için bu ön kontrol yalnızca meşru dosyaları engelliyor.
- **Senaryo:** Office kurulu Windows'taki alıcı 'Belgeden Doldur (AI)' ile `kalemler.csv` seçer → `mimeType: "application/vnd.ms-excel"` → 400 'Sadece PDF veya fotoğraf…' hatası; iPhone'dan PC'ye aktarılmış .heic fotoğraf da `mimeType: ""` ile aynı şekilde reddedilir.
- **Düzeltme:** ALLOWED_UPLOAD_MIMES'e "application/vnd.ms-excel" ekleyin. mimeType boş veya "application/octet-stream" geldiğinde dosya uzantısına (.csv/.heic/.heif/.xlsx) göre kabul edip presign için kanonik MIME'ı sunucuda türetin. Web'de de file.type boşsa uzantıdan MIME çıkarın, çünkü PUT Content-Type'ı presign ile eşleşmeli.

### M-037 — Herkese açık categories/search-tree sorgusu uzunluk/token sınırı olmadan binlerce koşullu SQL üretiyor

- `apps/api/src/modules/categories/controllers/category.controller.ts:69` · X01
- `GET /api/categories/search-tree?q=` kimliksiz ve `q` hiç kırpılmadan `searchHierarchical`'a gider; servis sorguyu `tokenizeQuery` ile bölüp her token için `searchText contains` + `nameTr ILIKE` çifti içeren bir AND listesi kurar (token sayısı sınırsız, tekrarlar elenmez). Diğer tüm herkese açık arama uçları `q`yu 80-120 karaktere kırpıyor (PublicListQueryDto, suggest vb.); bu uç istisna. Varsayılan 100/dk/IP hız sınırı dışında koruma yok.
- **Senaryo:** Saldırgan ~16 KB'lık `q=er er er ... er` (≈5.000 token) gönderir → tek istek ~10.000 ILIKE yüklemli bir Prisma/Postgres sorgusu (level 3-4 kategorilerin tamamı taranır) üretir; birkaç IP'den dakikada 100'er istekle DB CPU'su ve Prisma sorgu kurulum maliyeti tükenir, tüm kiracılar için API yavaşlar/zaman aşımına düşer.
- **Düzeltme:** Controller'da `(query ?? "").slice(0, 120)` uygulayın, serviste token'ları tekilleştirip ilk ~8 tanesiyle sınırlayın (`[...new Set(tokens)].slice(0, 8)`). İsterseniz bu uca daha sıkı bir @Throttle da ekleyin.

### M-038 — Onay fallback cron'u rol etiketine, onay kapısı izne bakıyor → sessiz kilitlenme

- `apps/api/src/modules/company-approvals/company-approvals.service.ts:1260`, `apps/api/src/modules/company-approvals/company-approvals.service.ts:1312` · S022, X11
- fallbackInactiveApprovers bir adımın onaycısını yalnız `roles` etiketinde SAHIP/YONETICI/ONAYLAYICI varsa uygun sayıyor; oysa /approve ve /reject uçları `approval:act` İZNİ istiyor ve findEligibleApprover/assertApproversValid de izne bakıyor. rolesFromPermissions, users:manage/company:manage taşıyan kişiye approval:act olmasa da YONETICI etiketi veriyor. Yorumdaki '(2) ROL KAYBI' düzeltmesi bu yüzden izin kaybını yakalamıyor.
- **Senaryo:** Akışta onaycı olarak atanmış Yönetici Y'nin 'Onaylama' tiki Kurucu tarafından yetki tablosundan kaldırılır (users:manage kalır, etiket YONETICI kalır) → bekleyen kazandırma onayında Y onaylamaya çalışınca 403 alır, cron Y'yi 'uygun' saydığı için başkasına devretmez → talep IN_AWARD_APPROVAL'da süresiz takılır; yeniden kazandırma da aynı akış adımıyla aynı Y'ye düşer.
- **Düzeltme:** Cron'daki uygunluk kontrolü hasCompanyPermission({isOwner: ownerUserId===id, permissions, roles}, "approval:act") ile yapılsın; bunun için companyUser select'ine permissions, sorguya da company.ownerUserId eklensin. İsteğe bağlı olarak requestApproval'da akış adımı onaycısının izni o anda da denetlensin.

### M-039 — findEligibleApprover Kurucu'yu (örtük approval:act) hiçbir zaman onaycı olarak seçmiyor

- `apps/api/src/modules/company-approvals/company-approvals.service.ts:1379` · S022
- İkame havuzu yalnız saklanan `permissions` dizisinde `approval:act` olanları ya da listesi BOŞ olanları arıyor. Kurucunun onay izni örtük (`OWNER_IMPLICIT_PERMISSIONS`); `setPermissions` Kurucu kendi satırını kaydettiğinde yalnız koltuk izinlerini saklıyor, kuruculuk devrinde de yeni kurucunun listesine approval:act yazılmıyor. Liste boş olmadığı ve approval:act içermediği için Kurucu hem ilk adım ikamesinde hem dakikalık fallback'te havuz dışında kalıyor. invariants.md INV-APPR-1 havuzun SAHIP'i kapsadığını söylüyor.
- **Senaryo:** Firmada Kurucu O (izin tablosundan kendi işlem tiklerini bir kez kaydetmiş), Yönetici Y (akışın tek onaycısı) ve satın almacı P var. Y pasifleştirilir. Cron Y ve P'yi dışlayıp O'yu bulamaz, `rejectForNoApprover` isteği REDDEDER ve P'ye 'uygun onaycı yok' e-postası gider. Oysa O onaylayabilirdi. Benzer biçimde Y kendi kazandırmasını başlatırsa 403 'sizden başka uygun onaylayıcı yok' alır. Kurucu bu durumu kendi satırından düzeltemez, çünkü onay izni saklanmıyor.
- **Düzeltme:** findEligibleApprover'daki OR koşuluna firmanın ownerUserId'si için `{ id: company.ownerUserId }` dalını ekleyin. Alternatif olarak adayları çekip assertApproversValid'deki gibi hasCompanyPermission({ isOwner, permissions, roles }, "approval:act") ile süzün.

### M-040 — Onay detayı rekabet özetinde alıcının elediği (LOST) teklifler 'Geçerli teklif' ve sıralamaya giriyor

- `apps/api/src/modules/company-approvals/company-approvals.service.ts:1685` · S022
- `getDetail` teklifleri `OWNER_VISIBLE_BID_STATUSES` (SUBMITTED, WON, AWARDED_PARTIAL, LOST) ile çekiyor. Onay anında (kazandırma öncesi) LOST teklifler alıcının elediği tekliflerdir. Bunlar `validBidCount`, `lowestTotal`/`secondLowestTotal` ve `winnerRank` hesabına giriyor. Ekran bu sayıyı 'Geçerli teklif' diye basıyor.
- **Senaryo:** Alıcı en ucuz teklifi (100.000 TRY) şartnameye uymadığı için eler ve 120.000 TRY'lik teklifi kazandırıp onaya gönderir. Onaycı 'Geçerli teklif: 3, En düşük: 100.000, Kazananın sırası: 2.' görür ve kazandırmayı gerekçesiz yere reddedebilir. Oysa geçerli en düşük teklif kazanandır.
- **Düzeltme:** Rekabet özeti sorgusunu yalnız talebin güncel turundaki (`round: listing.currentRound`) SUBMITTED/WON/AWARDED_PARTIAL tekliflerle sınırlayın, yani LOST ve eliminatedAt'i dolu olanları dışarıda bırakın. Elenenleri isterseniz ayrı bir `eliminatedCount` ile gösterin.

### M-041 — Onay detayında kazanan toplamı farklı para birimli kalemleri tek birimde topluyor

- `apps/api/src/modules/company-approvals/company-approvals.service.ts:1790` · X12
- Kalem-bazlı kazandırma onay detayında `perBid` teklif kimliğine göre gruplanıyor; ilk satırın birimi etiket olarak kalıyor ve sonraki farklı birimli kalem tutarları çevrilmeden aynı toplama ekleniyor. Siparişler `buildItemGroups`ta firma+birim bazında doğru bölünse de onaylayıcı yanlış tutar görerek karar veriyor.
- **Senaryo:** TRY ana birimli teklif: kalem 1 = 1.000 TRY, kalem 2 = 100 USD; ikisi de aynı teklife kazandırılıyor. Onay panelinde kazanan satırı '1.100,00 ₺' yazar (gerçekte ≈5.899 TRY).
- **Düzeltme:** `perBid` anahtarını `${bidId}::${currency}` yapın, böylece her teklif+birim çifti için ayrı bir winners satırı oluşur. `winnerBidIds` değerini de tekilleştirilmiş bid id'lerinden üretin, `winnerCurrency` birden fazla birim olduğunda null kalsın.

### M-042 — Onboarding'de kayıtlı vergi numarası girilince P2002 yakalanmıyor, kullanıcı 500 alıyor

- `apps/api/src/modules/company-auth/services/company-auth.service.ts:579`, `packages/db/prisma/schema.prisma:616` · S042, S046, X07
- `Company.taxNumber` global olarak @unique, ancak completeOnboarding ne ön kontrol yapıyor ne de P2002'yi yakalıyor. Global filtre (ServerErrorSentryFilter) Prisma hatalarını eşlemediği için yanıt 500 'Internal server error' oluyor. Kullanıcıya 'bu vergi no ile kayıtlı bir firma var, yöneticisinden davet isteyin' gibi bir yönlendirme gösterilmiyor. B2B'de aynı firmadan ikinci kişinin ayrıca kayıt olması olağan bir senaryo. Ülke öneki atıldığı için (normalizeTaxId) ülkeler arası çakışma da aynı 500'e düşüyor.
- **Senaryo:** A firmasının çalışanı kayıt olup vergi no 1234567890 ile onboarding'i tamamlıyor. Aynı firmadan ikinci bir çalışan ayrı hesap açıp aynı vergi no ile onboarding gönderiyor. `tx.company.update({taxNumber})` unique ihlaliyle düşüyor, kullanıcı 500 genel hata görüyor ve onboarding'de takılı kalıyor. Sentry'de de her denemede bir olay oluşuyor.
- **Düzeltme:** Transaction'dan önce `company.findFirst({ where: { taxNumber, id: { not: companyId } } })` ile kontrol edip, kayıt bulunursa yerelleştirilmiş bir 409 ConflictException döndürün ("bu vergi no ile kayıtlı firma var, yöneticisinden davet isteyin"). Yarış durumu için runTenantTx çağrısını try/catch'e alıp P2002'yi (target taxNumber) aynı 409'a çevirin.

### M-043 — Kayıtta iptal edilmiş dış talep davetleri de platform içi davete dönüşüyor

- `apps/api/src/modules/company-auth/services/company-auth.service.ts:810` · X02
- `attachExternalListingInvites`, kayıt olan e-postaya ait TÜM `external_listing_invites` satırlarını `state`e bakmadan `listing_invitations`a çeviriyor. Alıcının açıkça iptal ettiği davetler (`cancelReferralInvite` → `REFERRAL_CANCELLED`, paket düşümü → `INVITER_DOWNGRADED`) de dahil. Hemen üstteki `acceptReferralInvites` yalnız PENDING referral'ları alıyor, ama e-posta dalı (`OR: [{ email }]`) bu süzgeci tamamen atlıyor. B5-4 düzeltmesi yalnız kuyruğu ve jeton önizlemesini kapattı; kayıttaki bağlama yolu açık kaldı.
- **Senaryo:** Alıcı PRIVATE talebine AI_AUTO/MANUAL ile rakip@firma.com adresini dış davete ekliyor. Adresin yanlış olduğunu fark edip davet mesai penceresine kadar kuyrukta beklerken referral davetini iptal ediyor (satır CANCELLED/REFERRAL_CANCELLED oluyor, e-posta hiç gitmiyor). Sonra rakip@firma.com kendi isteğiyle Rothern'e kayıt oluyor. `attachExternalListingInvites` bu iptal edilmiş satırı buluyor ve `listingInvitation.upsert` yapıyor. Böylece alıcının davetini geri çektiği firma PRIVATE talebi görüyor ve teklif verebiliyor.
- **Düzeltme:** Sorguya `referralInvite: { status: { not: "CANCELLED" } }` ve `NOT: { state: "CANCELLED", cancelReason: { in: ["REFERRAL_CANCELLED", "INVITER_DOWNGRADED"] } }` koşullarını ekleyin. Referral koşulu, iptal öncesinde SENT olmuş satırları da kapsar. referral-signup.spec.ts'e iptal edilmiş davetin bağlanmadığını doğrulayan bir test ekleyin.

### M-044 — E-posta 2FA'da saatlik kod tavanı dolunca geçerli kod varken giriş 503 ile kilitleniyor

- `apps/api/src/modules/company-auth/services/company-auth.service.ts:941` · X17
- issueEmailCode son 60 dakikada 5 kod üretildiyse yeni kod üretmiyor ve {sent:false, capped:true} dönüyor; mevcut kullanılmamış kod geçerli kalıyor. login bu durumu gönderim hatasıyla aynı sayıp ServiceUnavailable fırlatıyor ve twoFactorRequired dönmüyor. Web bu yüzden kod giriş ekranına hiç geçemiyor.
- **Senaryo:** E-posta 2FA'lı kullanıcının kodu geç geliyor, kullanıcı 'Giriş'e 5 kez basıyor (her basışta yeni kod üretilip eskisi kapanıyor). 6. denemede API 503 'Doğrulama kodu şu anda gönderilemedi' dönüyor. Gelen kutusundaki 5. kod hâlâ geçerli ama form kod alanını açmadığı için girilemiyor. Kullanıcı yaklaşık 1 saat giriş yapamıyor.
- **Düzeltme:** login'de capped true ise ve süresi dolmamış, kullanılmamış bir kod varsa { twoFactorRequired: true, method: 'email' } dönün; kod yoksa 503 yerine ayrı bir 429 ve "saat başı kod sınırı" mesajı verin. Tavan sayımını yalnız kullanılmamış kodlarla ya da yalnız 'login' türüyle sınırlamayı da değerlendirin.

### M-045 — Authenticator (TOTP) 2FA kodunda hesap bazlı deneme sınırı yok

- `apps/api/src/modules/company-auth/services/company-auth.service.ts:1215` · S023
- `verifyTwoFactorCode` AUTHENTICATOR yönteminde kodu doğrudan `authenticator.verify` ile kontrol ediyor; yanlış denemeler sayılmıyor, hesap kilitlenmiyor, yalnız `auth.login_failed` audit'i yazılıyor. E-posta kodunda kod başına 5 deneme + saatte 5 kod tavanı varken (denetim 2026-08-23 #9) TOTP ve kurtarma kodu yolunda uygulama katmanında tek fren `login` ucundaki IP başına 10/dk throttle. otplib v12 varsayılanı `window: 0` olsa da her 30 sn'de 10^6 uzayda tahmin serbest; ayrıca aynı kod 30 sn içinde tekrar kullanılabiliyor (son adım saklanmıyor).
- **Senaryo:** Parolası sızmış (credential stuffing) ve TOTP 2FA açık bir hesaba saldırgan çok sayıda IP'den `POST company-auth/login {email,password,code}` gönderir; her IP dakikada 10 tahmin yapar, hesap hiç kilitlenmez ve sahibine uyarı gitmez. 1000 IP ile dakikada ~10.000 tahmin → beklenen ~50-100 dakikada doğru kod bulunur ve 2FA korumalı hesap ele geçirilir (Supabase'in kendi sign-in hız sınırı uygulamanın kontrolünde değil).
- **Düzeltme:** CompanyUser'a (veya ayrı bir tabloya) hesap bazlı başarısız 2FA sayacı ekleyin, örneğin 15 dakikada 5 hatalı TOTP veya kurtarma kodu denemesinden sonra 2FA doğrulamasını geçici olarak kilitleyip kullanıcıya e-posta ile bildirin. Başarılı TOTP adımını `lastTotpStep` olarak saklayıp aynı adımın tekrar kullanımını reddedin.

### M-046 — Yaptırım ülkesi kapısı yalnız bankCountry'ye bakıyor; IBAN'ın ülke öneki denetlenmiyor

- `apps/api/src/modules/company-bank-accounts/company-bank-accounts.service.ts:186`, `packages/shared/src/helpers/bank-details.ts:73` · S024, X24
- resolveDetails, REGISTRATION_BLOCKED kontrolünü yalnız istemcinin gönderdiği bankCountry üzerinde yapıyor. IBAN'ın kendi ülke öneki (iban.slice(0,2)) yalnız bankCountry boş olduğunda kullanılıyor. IR, IBAN_LENGTHS kaydında olmadığı için isValidIbanAny sadece mod-97'ye bakıyor ve geçerli bir İran IBAN'ı kabul ediliyor. Sonuçta yorumdaki 'tahsilat hesabı yaptırım ülkesinde olamaz' kuralı normal arayüzden bile aşılabiliyor.
- **Senaryo:** Kurucu Banka Hesapları formunda banka ülkesi olarak DE'yi seçip mod-97'si tutan bir 'IR..' IBAN giriyor. Web tarafında classifyBankAccountInput(DE) bunu IBAN olarak gönderiyor. bankCountry='DE' engelli listede olmadığı için kapıdan geçiyor, bankDetailsErrors da IBAN'ı geçerli sayıyor. Hesap bankCountry=DE, iban=IR... olarak kaydediliyor ve sipariş kabulünde alıcıya ödeme hesabı olarak bu İran IBAN'ı gidiyor. Hesap no alanına IR IBAN'ı yazılınca da aynı sonuç çıkıyor, çünkü 193. satırda IBAN'a çevriliyor.
- **Düzeltme:** resolveDetails'te IBAN normalize edilip hesap no dönüşümü de yapıldıktan sonra REGISTRATION_BLOCKED.has(iban.slice(0,2)) ve SWIFT için swift.slice(4,6) kontrol edilmeli, bu durumda BANK_COUNTRY_BLOCKED dönülmeli. En iyisi bu kuralı IBAN öneki ile bankCountry uyumuyla birlikte shared bankDetailsErrors'a koymak; böylece doğrulama, profil ve admin yüzeyleri de aynı kuraldan geçer.

### M-047 — Şikayet metni 120 karakteri aşınca 400: diyalog 1000 karaktere izin veriyor, `detail` hiç gönderilmiyor

- `apps/api/src/modules/company-complaints/company-complaints.controller.ts:25`, `apps/web/src/app/[locale]/company/(authed)/firma/[id]/page.tsx:130` · S057, X05
- Şikayet ReasonDialog'u (textarea maxLength=1000) tek metin topluyor ve bunu `reason` olarak yolluyor. DTO ise `reason`ı 120 karakterle sınırlıyor. Uzun anlatım için tasarlanmış `detail` (2000) alanını istemci hiç doldurmuyor. Aynı diyalogla gönderilen engelleme gerekçesinde de benzer uyumsuzluk var: UI 1000, `BlockDto.reason` 500.
- **Senaryo:** Kullanıcı firma sayfasında (firma/[id] veya bağlantılar listesi) 'Şikayet et' der ve 200 karakterlik bir açıklama yazar → POST /company/complaints `{rothernId, reason: <200 karakter>}` → 400 (reason en çok 120) → şikayet oluşmaz, kullanıcı hata toast'ı görür. 600 karakterlik engelleme gerekçesi de 400 alır.
- **Düzeltme:** İstemcide metnin ilk 120 karakterini `reason`, tamamını `detail` olarak gönderin, ya da ReasonDialog'a bir maxLength prop'u ekleyip şikayet için 120, engelleme için 500 verin. Alternatif olarak DTO'daki `reason` sınırını 1000'e çıkarabilirsiniz; bunu yaparsanız DB kolonunun uzunluğunu da kontrol edin.

### M-048 — Davet opt-out'u sayfa açılışında otomatik yazılıyor — link tarayıcıları adresi kalıcı çıkarır

- `apps/api/src/modules/company-connections/controllers/referral-optout.controller.ts:16` · S025
- Opt-out ucu GET ve yan etkili; web `/davet-kapat` sayfası `useEffect` içinde hiçbir kullanıcı eylemi beklemeden bu ucu çağırıyor. JS çalıştıran kurumsal e-posta güvenlik tarayıcıları (ör. Safe Links detonasyonu) bağlantıyı açtığında `referral_opt_outs`a kayıt düşer ve adres TÜM alıcıların davetlerinden kalıcı olarak çıkar. CLAUDE.md genel abonelikten çıkış için bu riski bilerek 'çıkış DÜĞMEYLE — güvenlik tarayıcıları bağlantıyı açar' kuralını koymuş; davet opt-out'u bu kurala bağlanmamış.
- **Senaryo:** AI keşfiyle bulunan tedarikçiye davet e-postası gider; kurumun e-posta ağ geçidi alt bilgideki opt-out bağlantısını sandbox'ta tarayıcıyla açar → sayfa yüklenince `GET /public/referral-optout?token=…` → `referralOptOut.upsert`. Tedarikçi hiçbir şeye tıklamadığı hâlde sonraki tüm davetler OPTED_OUT olarak düşer (dispatcher ve inviteExternalForListing).
- **Düzeltme:** `/davet-kapat` sayfası açılışta yalnızca bir onay ekranı göstersin; opt-out açık bir "Davet almak istemiyorum" düğmesine basılınca POST ile yazılsın. API ucu da POST'a çevrilsin (Throttle eklenerek); GET yazmamalı, tıpkı `public/email/unsubscribe` akışında olduğu gibi.

### M-049 — Panel firma profilinde başka firmanın ürün adları ve talep başlıkları çevrilmiyor

- `apps/api/src/modules/company-connections/services/company-connections.service.ts:1761` · S025
- `getProfile` başka firmanın tanıtım/sektörünü `localizeCompanies` ile okuyucunun diline çevirir ama aynı yanıttaki `products` (ad, özet) ve `listings` (başlık) ham döner. Herkese açık profil (`public-profile.service.ts:340`) ürünleri `localizeProducts` ile çevirdiği için EN/RU üye, ziyaretçinin gördüğünden daha kötü (Türkçe) içerik görür. CLAUDE.md: 'Yeni çapraz-firma okuma ucu = localize* çağrısı' ve 'üye, ziyaretçinin gördüğü her şeyi görür'.
- **Senaryo:** Arayüzü İngilizce olan üye `/en/company/firma/<RothernID>` sayfasını açar: tanıtım metni İngilizce gelir, ancak ürün ızgarasında 'M6 Cıvata Paslanmaz' ve açık talepler listesinde 'Çelik boru alımı' Türkçe görünür; aynı firmanın herkese açık `/en/companies/...` sayfasında ürünler İngilizce.
- **Düzeltme:** `!isSelf` olduğunda ürünler için `this.translations.localizeProducts(products.map(toProductIndexCard), products.map(p => p.id), currentLocale())` çağrılmalı. Talepler için de `localizeListings(listingRows, listings.map(l => l.id), currentLocale())` uygulanmalı; bunu kırmızı/yeşil bir spec ile birlikte ekleyin.

### M-050 — Üst üste binen dakikalık davet turları aynı kayıtsız adrese davet e-postasını iki kez gönderebiliyor

- `apps/api/src/modules/company-connections/services/external-invite-dispatcher.service.ts:136` · X09
- Dispatcher sırası gelen QUEUED davetleri sahiplenmeden (claim) okuyor ve ancak gönderimden SONRA SENT işaretliyor. @nestjs/schedule/cron varsayılanı `waitForCompletion=false` olduğundan tur 60 sn'yi aşınca yeni tur aynı süreçte başlar; CronLockService tek bağlantılı oturumda `pg_try_advisory_lock` kullandığı için aynı oturumdan ikinci istek de kilidi alır (oturum kilidi yeniden girişli). İkinci tur bellekteki eski listeyle ilerler; MANUAL kaynakta sıklık freni olmadığı için aynı davet ikinci kez gider.
- **Senaryo:** Alıcı İngilizce konuşan 60 tedarikçiyi (MANUAL) Türkçe talebe davet eder. Çeviri hazır olmadığı için her davette `ensureTranslated(…,1500)` beklenir → tur ~90 sn sürer. 1. dakikadaki ikinci tur aynı QUEUED satırları okur; çeviri tamamlanınca iki tur da aynı adreslere `tender_external_invite` gönderir → çift soğuk e-posta, şikâyet riski ve günlük tavan aşımı.
- **Düzeltme:** Göndermeden önce davetleri atomik olarak sahiplenin (`updateMany where {id in, state:'QUEUED'}` ile ara bir duruma ya da claim alanına geçirin, count eşleşmezse o adresi atlayın). Ek önlem olarak scheduler'a `waitForCompletion: true` verin veya CronLockService'e süreç içi `running` bayrağıyla yeniden giriş koruması ekleyin.

### M-051 — İptal edilen / paketi düşen davetin kapanış hatırlatması yine gönderiliyor

- `apps/api/src/modules/company-connections/services/external-invite-dispatcher.service.ts:433` · S025, X02
- `sendReminders` adayları yalnız `state: "SENT"` ile seçer; bağlı `referralInvite.status` (CANCELLED/ACCEPTED) kontrol edilmez. `cancelReferralInvite` ve `cancelOutgoingReferralInvites` yalnız QUEUED talep davetlerini iptal eder, SENT olanlar SENT kalır. Sonuç: kullanıcı daveti iptal ettikten ya da firma STANDART'a düştükten sonra kapanışa 6-48 saat kala davet edenin adıyla hatırlatma e-postası gider ve içindeki önizleme bağlantısı iptal edilmiş jeton yüzünden 404 ('Geçersiz bağlantı') açar.
- **Senaryo:** Alıcı x@firma.com'a talep daveti gönderir (MANUAL, hemen SENT). Ertesi gün Bağlantılar › Davetler'den bu daveti iptal eder (referral CANCELLED). Talebin kapanışına 40 saat kala dispatcher `sendReminders` bu SENT satırı seçer; adres kayıtlı/çıkmış değil → 'ABC İnşaat (Rothern üzerinden)' hatırlatması gider; alıcı 'Talebi görüntüle'ye basınca `invitePreview` inv.status CANCELLED olduğu için 404 döner.
- **Düzeltme:** `sendReminders` sorgusuna `referralInvite: { status: "PENDING" }` koşulunu ekleyin. İsterseniz iptal ya da paket düşüşünde SENT satırların `reminderSentAt` alanını da doldurun ki hatırlatma bir daha seçilmesin.

### M-052 — Tasarruf sekmesi kategori kırılımı EN/RU'da Türkçe ad ve sabit 'Kategorisiz' basıyor

- `apps/api/src/modules/company-dashboard/company-dashboard.service.ts:504`, `apps/api/src/modules/company-dashboard/company-dashboard.service.ts:505`, `apps/api/src/modules/company-dashboard/company-dashboard.service.ts:728` · S026, X06, X12
- `satinalmaTasarruf` kategori etiketini `resolveCategoryLabels` ile `nameTr`den okuyor (CATEGORY_NAME_SELECT/categoryName kullanılmıyor) ve boşta sabit "Kategorisiz" yazıyor; web `BreakdownCard` `r.label`i doğrudan basıyor. Ayrıca yorum 'segment (level 1)' dese de talebin ilk (L3/L4) kodunun adı kullanılıyor; web tutarı `analytics.categorySavings` (segment adı) ile `label` eşleştirerek arıyor, bu yüzden tutar etiketi hiçbir zaman eşleşmiyor.
- **Senaryo:** EN arayüzlü alıcı Şirketim › Genel Bakış › Tasarruf sekmesini açar → 'Ana kategori bazlı tasarruf' kartında Türkçe kategori adları (ör. 'Rulmanlar ve burçlar') ve kategorisiz talepte 'Kategorisiz' görünür; satırlarda tutar hiç çıkmaz çünkü L3 adı segment adıyla eşleşmez.
- **Düzeltme:** `resolveCategoryLabels` içinde kodu `${code.slice(0,2)}000000` segmentine yuvarlayın, adı `...CATEGORY_NAME_SELECT` + `categoryName()` ile okuyucunun dilinde üretin ve 'Kategorisiz' için `tApi` anahtarı kullanın; böylece etiket analitikteki `categorySavings` etiketiyle de eşleşir.

### M-053 — Pano analitiği tasarruf/hacim hesabı kalem bazlı kazandırmada kalemleri çift sayıyor

- `apps/api/src/modules/company-dashboard/dashboard-analytics.service.ts:381`, `apps/api/src/modules/company-dashboard/dashboard-analytics.service.ts:388` · S026, X12
- `savingsVolumeOf` her WON/AWARDED_PARTIAL teklifin TÜM kalemlerini topluyor; oysa AWARDED_PARTIAL teklif fiyatladığı ama kazanmadığı kalemleri de taşır ve aynı kalem birden çok kazanan teklifte yer alır. Ayrıca `awardedQuantity` yerine hep `quantity` çarpılıyor. Tasarruf sekmesi (`satinalmaTasarruf`) ve rapor (`company-reports`) kalem başına EN İYİ kazanan fiyatı + awardedQuantity kullanıyor; aynı ekranda iki farklı tasarruf rakamı çıkıyor (Parça 12 #9'da kapatıldığı söylenen ayrışma analitik ucunda duruyor).
- **Senaryo:** Talep: A ve B kalemi, hedef 100/100. X teklifi A=90,B=100; Y teklifi A=95,B=80. awardByItem A→X, B→Y (ikisi de AWARDED_PARTIAL). Doğru tasarruf 10+20=30, hacim 170; analitik tasarruf 10+0+5+20=35, hacim 365 hesaplar → 'Gerçekleşen tasarruf' KPI'ı, tasarruf trendi, kategori tasarrufu ve Top-5 yanlış (şişik) gösterilir.
- **Düzeltme:** `satinalmaTasarruf` içindeki kalem başına en iyi kazanan TRY fiyatı × (awardedQuantity > 0 ? awardedQuantity : quantity) hesabını ortak bir yardımcıya (ör. report-currency.ts) taşıyın. Analitik sorgusunda items select'ine `awardedQuantity` alanını ekleyip `savingsVolumeOf` hesabını bu yardımcıyla yapın.

### M-054 — Bekleyen KYC revizyonu yeniden yüklenince eski belge R2'da öksüz kalıyor (KVKK imhasından kurtuluyor)

- `apps/api/src/modules/company-docs/company-docs.service.ts:341` · S026
- VERIFIED firmanın bekleyen revizyonu varken yeni yükleme `companyKycRevision.update` ile yalnız `key`i eziyor; önceki nesne silinmiyor ve hiçbir satırda referansı kalmıyor. `purgeCompanyObjects` yalnız güncel kolonları + revizyon satırlarındaki anahtarları topladığı için bu kimlik/imza taramaları silme talebinden sonra da private bucket'ta kalır. Parça 9 #8 düzeltmesi ana yol ve revizyon onayı için yapıldı, bu yol kapsanmadı.
- **Senaryo:** Doğrulanmış firma kimlik ön yüzü için revizyon yükler (key1, PENDING), sonra düzeltip tekrar yükler (key2) → satır key2'yi gösterir, key1 nesnesi R2'da kalır. Firma KVKK silme ister; `purgeCompanyObjects` key2'yi siler, key1'deki kimlik kartı taraması süresiz saklanır ve silme 'temizlendi' sayılır.
- **Düzeltme:** submitRevision'da findFirst'e `key: true` ekleyin. update tamamlandıktan sonra eski anahtar yenisinden farklıysa `storage.deleteObject("private", oldKey)` ile best-effort silin ve hatayı logger.warn ile kaydedin (:289-301'deki #8 deseni).

### M-055 — Talep belgeleri listesi Faz O taraf kapısını (hasReadContext) uygulamıyor

- `apps/api/src/modules/company-listing-documents/company-listing-documents.service.ts:141` · S027
- `getOne` sahip dalında `assertOwnerReadContext` ile `buy:view` istiyor, sahip olmayan dalda `hasReadContext(user, "sell")` istiyor; ikisi de yoksa 404 dönüyor. Belge servisinin `assertCanView`'ı ise sahip firmanın üyesini hiçbir izne bakmadan geçiriyor, sahip olmayanda da taraf kontrolü yapmıyor. Controller any-of `["buy:view","sell:view"]` kabul ettiği için taraf ayrımı deliniyor ve talep detayında 404 alan üye aynı talebin şartname/çizimlerini presigned URL ile indirebiliyor.
- **Senaryo:** (a) Gold alıcı firmada yalnız `sell:view` izni olan Satışçı, firmanın satın alma talebinin id'si ile `GET /api/company/listings/<id>/documents` çağırıyor: `getOne` 404 verirken bu uç satın alma şartnamelerini ve çizimleri indirme bağlantılarıyla döndürüyor. (b) Başka firmada yalnız `buy:view` olan üye, `getOne`'da 404 aldığı açık talebin belgelerini bu uçtan alıyor. Bu, 'taraflar birbiri hakkında bilgi edinemez' kuralına aykırı.
- **Düzeltme:** `assertCanView` içinde sahip dalında `hasReadContext(user, "buy")`, sahip olmayan dalda (davetli erişimi dahil, ilk adımda) `hasReadContext(user, "sell")` şartı eklenmeli, yoksa 404 dönülmeli. Böylece getOne ile birebir aynı kural uygulanır. Kuralı sabitlemek için Satışçı ve Satın Almacı rol matrisiyle bir spec yazılmalı.

### M-056 — İçe aktarmada talebin ana birimi null'a çevriliyor, teklifçinin seçtiği farklı ana birime yazılıyor

- `apps/api/src/modules/company-listings/import/bid-import.service.ts:466` · S028
- Şablon ve AI yolu satırın para birimi talebin primaryCurrency'sine eşitse currency=null döndürüyor (bid-import.service.ts:466, bid-matching.ts:384). Oysa null 'teklifin ana birimi' demek ve teklifin ana birimini teklifçi formda başka bir izinli birim olarak seçebiliyor (teklif-ver/page.tsx:298 effectiveCurrency). Şablon üstelik her satıra primaryCurrency'yi hazır yazıyor (satır 267). Sonuç: açıkça talebin ana biriminde girilen fiyatlar teklifçinin seçtiği birime taşınıyor.
- **Senaryo:** Talebin ana birimi TRY, izinli birimler TRY ve USD. Teklifçi formda ana birim olarak USD seçip şablonu indiriyor, her satırda 'TRY' hazır yazılı. Fiyatları TRY olarak girip yüklüyor. Parse cur=TRY===primaryCurrency olduğu için null döndürüyor. applyImportedPrices `canItemCurrency && r.currency ? r.currency : prev.currency` ile kalemi ana birim USD'ye bırakıyor ve 1.500 TRY'lik fiyat 1.500 USD olarak gönderiliyor. Başka bir örnek: kaleme elle EUR seçilmişse, TRY yazan satır null geldiği için EUR korunuyor.
- **Düzeltme:** Tanınan para birimi her zaman açık ISO kodu olarak dönmeli, null'a indirilmemeli. Web'de r.currency effectiveCurrency'ye eşitse kalem birimi boş bırakılmalı, farklıysa kalem birimi olarak yazılmalı; canItemCurrency false iken farklı birim gelen satır uyarıyla dışarıda bırakılmalı. Şablon da hücreyi boş bırakabilir ya da seçili birimle doldurabilir.

### M-057 — AI ile fiyat okumada belgenin para birimi kayboluyor, fiyat teklifin ana birimine yazılıyor

- `apps/api/src/modules/company-listings/import/bid-matching.ts:382` · S028
- applyDocRowValues satırın para birimi talepte izinli değilse yalnız uyarı ekliyor. unitPrice dolu kalıyor, currency null kalıyor ve null 'teklifin ana birimi' demek. Ayrıca fromDocRows modelin döndürdüğü docCurrency'yi yalnız bildirim için kullanıyor, para birimi olmayan satırlara aktarmıyor. Bu yüzden para birimi yalnız belge başlığında yazan proformalarda (çok yaygın) tüm fiyatlar sessizce teklifin ana birimine geçiyor. Web tarafındaki dialog (bid-import-dialog.tsx:120) uyarılı satırları da 'uygulanabilir' sayıyor, docCurrency'yi hiç okumuyor.
- **Senaryo:** Talep TRY+EUR kabul ediyor, teklifçinin ana birimi TRY. Proformada 'Para birimi: EUR' yalnız başlıkta yazıyor, satırlarda '185,00' var. Sonuçta docCurrency=EUR ama satırlarda currency=null, EUR izinli olduğu için bildirim de çıkmıyor. Önizleme '185,00 TRY' gösteriyor, 'Forma uygula' 185 TRY yazıyor ve teklif yaklaşık 40 kat düşük fiyatla gönderilip kazanabiliyor. Başka bir örnek: talep yalnız TRY kabul ediyor, satırda 'EUR' yazıyor. Bu durumda yalnız uyarı çıkıyor ve fiyat yine TRY olarak uygulanıyor.
- **Düzeltme:** applyDocRowValues içinde izinli olmayan satır birimini warnings yerine errors'a yazın. Satırda birim yoksa normalize edilmiş docCurrency'yi satır birimi olarak kullanın, bu da izinli değilse hata sayın. Ana birimle karşılaştırmayı teklifin efektif birimine göre yapın ya da açık ISO kodu döndürün.

### M-058 — CSV yolunda ExcelJS varsayılan map'i miktarı ve termini yerel ayrıştırıcıdan önce yanlış dönüştürüyor

- `apps/api/src/modules/company-listings/import/listing-item-import.service.ts:236` · S029
- `wb.csv.read(…, { parserOptions })` çağrısına `map` verilmediği için ExcelJS her hücreye `Number(datum)` ve `dayjs(datum, 'MM-DD-YYYY', true)` uyguluyor; değer parseLocaleNumber/parseImportDate'e zaten dönüştürülmüş gelir. Sonuç: servisin kendi kuralı "1.234" → 1234 (TR binlik) iken CSV'de "1.500" 1.5 olur; parseImportDate GG-AA-YYYY desteklediğini söylerken "05-09-2026" CSV'de ABD sırasıyla 9 Mayıs'a çevrilir. xlsx metin hücresinde aynı girdiler doğru ayrıştığı için iki yol sessizce ayrışıyor.
- **Senaryo:** TR kullanıcı kendi listesini `;` ayraçlı CSV olarak yükler: `Çelik sac;1.500;kg;…;05-09-2026` → önizleme ve oluşan talep kalemi miktarı 1,5 kg (1.500 kg değil), termini 2026-05-09 (5 Eylül değil) olur; satır hata vermediği için tedarikçiler 1000 kat eksik miktara ve yanlış termine teklif verir.
- **Düzeltme:** csv.read çağrısına ham metni koruyan bir map verilmeli: `map: (d) => (d === '' ? null : d)`. Böylece sayı ve tarih yalnız parseLocaleNumber/parseImportDate ile, xlsx metin yoluyla aynı kurala göre yorumlanır. Aynı desen bid-import.service.ts:241, ai-extract-router.ts:205 ve spreadsheet-reader.ts:103'te de var; oralar da kontrol edilmeli.

### M-059 — İlanı açan kullanıcı çıkarılınca talep kalıcı olarak yönetilemez/kazandırılamaz

- `apps/api/src/modules/company-listings/listing-manage-access.ts:33` · X11
- listingManageDenial yalnız `createdById === user.userId` kabul ediyor; SAHİP istisnası yok (docs/invariants.md INV-AZ-1 ise 'VEYA user.isOwner — SAHİP emniyet supabı' diyor). company-users.remove kullanıcıyı soft-delete edip e-postasını tombstone'luyor, ilanların createdById'sini devretmiyor; admin tarafında da oluşturanı değiştiren/kazandıran bir uç yok (kod yorumu 'destek kanalı (admin) devreye girer' diyor ama böyle bir uç bulunmuyor). Sonuç: award, awardByItem, cancel, closeNoAward, eliminate, createNextRound, changeClosingTime firmada KİMSE tarafından yapılamaz.
- **Senaryo:** Satın almacı X 20 teklif almış OPEN talebi varken işten ayrılır, Kurucu onu 'Kullanıcıyı çıkar' ile siler → kapanış cron'u talebi IN_AWARD'a alır → Kurucu ve diğer satın almacılar 'Kazandır'a basınca 403 'Bu ilanı yönetme yetkiniz yok' → talep sonsuza dek IN_AWARD'da, tedarikçilerin bağlayıcı teklifleri askıda; admin de yalnız kapatabilir/yeniden açabilir, kazandıramaz.
- **Düzeltme:** Kullanıcı çıkarma/pasifleştirme akışında açık ilanları (DRAFT/OPEN/IN_AWARD) buy:listing:manage izni olan başka bir kullanıcıya devretmeyi zorunlu kılın ya da çıkarmayı engelleyin; ya da kod yorumundaki sözü karşılayan bir admin "ilan sorumlusunu değiştir" (createdById devri + audit) ucu ekleyin. INV-AZ-1 metnini de SAHİP istisnası olmadığını söyleyecek şekilde güncelleyin.

### M-060 — Geçerlilik hatırlatması: sırasız take:200 + damgalanmayan satırlar kuyruğu kalıcı tıkıyor

- `apps/api/src/modules/company-listings/schedulers/listing.scheduler.ts:205` · X08, X11
- `doEvaluationValidityReminders` IN_AWARD ∧ `evaluationReminderSentAt: null` ilanlardan `orderBy` olmadan 200 tanesini alıp JS'te süzüyor. Süresi dolmak üzere teklifi olmayan ilanlar (teklifsiz kapanan ya da `validityDays` null teklifli) hiç damgalanmıyor ve IN_AWARD'dan otomatik çıkış yok, yani her saat aynı pencereyi dolduruyor. 200 bu tür ilan biriktiğinde yeni ilanlar pencereye hiç girmez ve özellik platform genelinde sessizce durur.
- **Senaryo:** Aylar içinde 200+ teklifsiz talep süresi dolup IN_AWARD'da bırakılır (sahip işlem yapmaz). Yeni bir talepte tedarikçi teklifinin geçerliliği 2 gün içinde dolacaktır; saatlik iş yine aynı 200 eski teklifsiz ilanı çeker, hepsinde `expiring === 0` → `continue`; yeni talebin sahibine 'karar verin/uzatma isteyin' hatırlatması hiçbir zaman gitmez ve teklif geçerliliği fark edilmeden düşer.
- **Düzeltme:** Uygunluk süzgecini sorguya taşıyın (`bids: { some: { status: "SUBMITTED", validityDays: { not: null } } }`) ve deterministik bir `orderBy` ekleyin, ya da tüm adayları imleçle tarayın. Böylece uygun olmayan ilanlar pencereyi dolduramaz.

### M-061 — Yayındaki talepte sonradan açılan AI keşfi hiç tur üretmiyor, ekran sonsuza dek 'aranıyor' diyor

- `apps/api/src/modules/company-listings/services/company-listings.service.ts:1149` · S090
- `enqueueDiscoveryRun` yalnız `announceListingOpen` içinde, `openNotifiedAt` claim'i başarılı olunca çağrılıyor. OPEN talep düzenlenip `aiDiscovery` false'tan true'ya çevrildiğinde (quick-request düzenleme formunda toggle var, `map-detail-to-form.ts:68`) update sonrası `announceListingOpen` (satır 2022) claim alamıyor ve tur kuyruğa hiç girmiyor. Embargolu talepte de (`bidsOpenAt` ileride) açılışa kadar tur yazılmıyor. Bu durumda web tarafında `use-supplier-discovery.ts:210` `aiDiscovery && runs.length === 0 && listingStatus === 'OPEN'` koşuluyla 5 sn'de bir süresiz yokluyor, `listing-suggestions.tsx` ise `runs.length === 0` iken 'bandSearching' gösteriyor.
- **Senaryo:** Alıcı görünürlüğü PRIVATE olan açık talebini (teklif yok) PUBLIC yapıp AI keşfini açarak kaydediyor. `openNotifiedAt` zaten dolu olduğu için claim count=0 dönüyor, tur oluşmuyor. Talep sayfasında 'Tedarikçi aranıyor' bandı talep kapanana kadar kalıyor, sekme açık kaldıkça her 5 sn'de bir `GET /company/ai/supplier-discovery/listings/:id` atılıyor ve hiçbir öneri gelmiyor.
- **Düzeltme:** updateListing'de önceki aiDiscovery false iken yenisi true ise ve talep açık, embargosu bitmiş durumdaysa (bidsOpenAt null veya geçmiş) `enqueueDiscoveryRun` claim'den bağımsız doğrudan çağrılsın. Web'de boş-tur yoklaması embargo süresince (bidsOpenAt ileride iken) kapatılmalı veya bir süreyle sınırlanmalı.

### M-062 — Doğrudan yayın (create asDraft:false) 'company.listing.published' audit izi yazmıyor

- `apps/api/src/modules/company-listings/services/company-listings.service.ts:1727` · S030
- INV-AUDIT-1'e göre ilan durum geçişleri `company.listing.published` ile iz bırakmalı. Bu iz yalnızca publishListing'de yazılıyor (2173). Hızlı talep kartının birincil yayın yolu olan create(asDraft:false) talebi doğrudan OPEN açıyor ama hiç audit kaydı üretmiyor. Bu nedenle yayınların çoğu audit trail'de ve firma aktivite akışında görünmüyor.
- **Senaryo:** Kullanıcı hızlı talep kartından 'Talebi Yayınla'ya basıyor (create, asDraft yok). Talep OPEN oluyor, AuditLog'a hiçbir kayıt düşmüyor. Sonradan insider incelemesi ya da aktivite günlüğü bu yayını göstermiyor. Taslaktan yayınlanan talepler ise gösteriliyor, yani iz tutarsız.
- **Düzeltme:** create'te `!dto.asDraft` dalında, commit sonrasında publishListing ile aynı `company.listing.published` audit kaydını yazın (from: null/"CREATE", to: "OPEN", critical: true).

### M-063 — updateListing davetleri sil-yaz yaparken AI ile davet edilen (bağlantısız) üyeleri sessizce siliyor

- `apps/api/src/modules/company-listings/services/company-listings.service.ts:2006` · S030
- updateListing tüm listingInvitation satırlarını siliyor (2006), sonra yalnızca bağlantılı firmaları geri yazıyor (1847: `connectedIds.includes(id)`). inviteDiscoveredMembers ise bağlantı şartı olmadan `origin:"AI"` davet oluşturup davetliye e-posta/zil bildirimi gönderiyor (6970-6995). Düzenleme formu davetlileri detaydaki rothernId'lerden yeniden gönderse de (map-detail-to-form.ts:147) bağlantısız AI davetlileri filtrede düşüyor; origin/aiReason da kayboluyor.
- **Senaryo:** Alıcı OPEN, PRIVATE (ya da CONNECTIONS) bir talepte AI keşfinden bağlantısı olmayan X üyesini davet ediyor, X davet e-postasını alıyor. Henüz teklif gelmemişken alıcı başlıktaki bir yazım hatasını düzeltmek için düzenle ekranından kaydediyor. X'in davet satırı siliniyor ve geri yazılmıyor. X e-postadaki bağlantıya tıklayınca getOne 404 dönüyor, talep sellerTenders listesinden de kayboluyor. Alıcıya hiçbir uyarı gösterilmiyor.
- **Düzeltme:** Davetleri toptan silmek yerine farkı uygulayın: formdan çıkarılan davetleri silin, yalnız yeni eklenenlerde bağlantı şartını arayın. Böylece mevcut `origin:"AI"` satırları origin ve aiReason bilgisiyle korunur. Alternatif olarak, mevcut davetlileri bağlantı filtresinden muaf tutup kalan satırları olduğu gibi bırakın.

### M-064 — Yayındaki talebi düzenlerken eklenen yeni davetlilere hiç bildirim gitmiyor

- `apps/api/src/modules/company-listings/services/company-listings.service.ts:2021` · S030
- OPEN talep düzenlenince yeni davetliler invitation satırı olarak yazılıyor, ama tek bildirim yolu `announceListingOpen` çağrısı. Bu çağrı `openNotifiedAt: null` koşullu atomik claim yaptığı için ilk yayında damga zaten basılmışsa hemen dönüyor (1075-1084). addInvitations aynı durumda yeni davetliye e-posta ve zil bildirimi gönderiyor, updateListing göndermiyor.
- **Senaryo:** Alıcı OPEN, PRIVATE bir talepte (teklif yokken) düzenle ekranından bağlantılı Y firmasını davetlilere ekleyip kaydediyor. Y'nin davet satırı oluşuyor. announceListingOpen claim.count=0 alıp dönüyor, Y'ye ne e-posta ne in-app bildirim gidiyor. Y talepten haberdar olmadan kapanış geçiyor.
- **Düzeltme:** Transaction'dan önce mevcut invitedCompanyId kümesini okuyun. Commit'ten sonra talep OPEN ve embargosuzsa yalnız yeni eklenen davetlilere addInvitations'taki notify + pushToCompanies yolunu çalıştırın; bu yolu ortak bir yardımcıya çıkarın.

### M-065 — Yönetici tarafından askıya alınan firmanın talepleri ve teklifleri akışta kalıyor

- `apps/api/src/modules/company-listings/services/company-listings.service.ts:2507` · X11
- Askı (admin suspend → Company.isBlocked=true) yalnız JWT'yi, pazar yeri vitrinini, kategori duyurusunu ve AI önerilerini kesiyor. Panel tarafında sellerVisibleWhere, getOne (non-owner) ve placeBid ilan sahibinin isActive/isBlocked durumuna bakmıyor; askıdaki firmanın OPEN talepleri 'Açık Talepler'de listelenip teklif almaya devam ediyor. Ters yönde askıdaki tedarikçinin SUBMITTED teklifleri alıcının teklif listesinde kalıyor ve award() bunu da kazandırıp giriş yapamayan firmaya sipariş yazıyor.
- **Senaryo:** Admin dolandırıcılık şüphesiyle A firmasını askıya alır → A'nın açık talebi tedarikçilerin panelinde görünmeye devam eder, tedarikçi B teklif verir (KYC'li bağlayıcı teklif), talep IN_AWARD'da sahipsiz kalır; aynı şekilde askıdaki tedarikçi C'nin teklifine alıcı kazandırır → C giriş yapamadığı için sipariş PENDING'de takılı kalır.
- **Düzeltme:** `sellerVisibleWhere`'e `company: { isActive: true, isBlocked: false }` eklenmeli. `getOne` (sahip olmayan için) ve `placeBid` ilan sahibi askıdaysa 404 dönmeli. `award`/`awardByItem`/`runFullAward` kazanan firma askıdaysa veya pasifse reddetmeli, sahibin teklif listesinde de bu teklifler işaretlenmeli.

### M-066 — RFQ 'Yeni Tur'da taşınan teklifler güncellenemiyor; e-posta 'fiyatınızı düşürebilirsiniz' diyor

- `apps/api/src/modules/company-listings/services/company-listings.service.ts:4145` · X11
- Web 'Yeni Tur' her zaman carryBids:"AUTO" gönderiyor (tender-actions-menu.tsx:201) ve createNextRound AUTO modunda önceki turun tekliflerini SUBMITTED olarak yeni tura taşıyor (6387-6396). placeBid ise RFQ formatında SUBMITTED teklifin her değişikliğini reddediyor (4144-4151); web teklif formu da aynı durumda 'Teklif zaten verildi' bloğu çiziyor. Oysa taşıma bildirimi (nextRoundCarried.body) 'yeni tur açıldı… dilerseniz fiyatınızı düşürebilirsiniz' diyor ve kod yorumu (6299) 'sahibi turda güncelleyebilir' vaat ediyor.
- **Senaryo:** Alıcı RFQ talebi IN_AWARD'dayken 'Yeni Tur' açar ve tipi RFQ seçer → 3 tedarikçinin teklifi SUBMITTED taşınır, tedarikçiler 'fiyatınızı düşürebilirsiniz' e-postası alır → teklif-ver sayfası 'Teklif zaten verildi' der, doğrudan POST /bids 400 'Gönderilmiş teklif düzenlenemez' döner → turun amacı olan revize fiyatlar hiç toplanamaz (tek yol alıcının her teklifi tek tek elemesi).
- **Düzeltme:** Yeni tur RFQ ise AUTO yerine LAZY taşıyın (teklifler taslağa düşsün, tedarikçi yeniden göndersin) ya da placeBid'de taşınmış teklif için turda bir kez revizyona izin verin. Bunlardan biri yapılmayacaksa, en azından RFQ turunda "fiyatınızı düşürebilirsiniz" cümlesini bildirim metninden çıkarın.

### M-067 — Onay akışı üzerinden kazandırmada teklif geçerliliği yeniden denetlenmiyor

- `apps/api/src/modules/company-listings/services/company-listings.service.ts:4978`, `apps/api/src/modules/company-listings/services/company-listings.service.ts:5043` · S032, X11
- CLAUDE.md Mimari Karar 6: 'Geçerliliği dolmuş teklif KAZANDIRILAMAZ'. assertBidValidityAlive yalnız award()/awardByItem() başlangıcında (onay isteği oluşturulurken) çağrılıyor; onay sonrası finalizasyon (onAwardApproved → runFullAward/runItemAward/buildItemGroups) geçerliliği hiç kontrol etmiyor. Onay istekleri süresiz bekliyor (yalnız günlük hatırlatma var), yani onay günler sonra verildiğinde süresi dolmuş teklife sipariş yazılıyor.
- **Senaryo:** Tedarikçi 7 gün geçerlilikle teklif verir; alıcı 5. gün kazandırır, eşik aşıldığı için talep IN_AWARD_APPROVAL'a düşer; onaycı 9. gün onaylar → runFullAward sipariş (PENDING) oluşturur, teklif WON olur — tedarikçinin artık bağlı olmadığı fiyata sipariş doğar (tedarikçi reddederse revert zinciri çalışır).
- **Düzeltme:** runFullAward ve buildItemGroups içinde, transaction'dan önce submittedAt/validityDays alanlarını seçip assertBidValidityAlive çağrılmalı. Böylece onay kararı, company-approvals'ın fail-closed geri alma akışıyla anlaşılır bir hata verir. İsteğe bağlı olarak, teklif geçerliliği dolan bekleyen LISTING_AWARD onaylarını otomatik reddeden bir cron da eklenebilir.

### M-068 — Genel rapor özetindeki 'Yanıt oranı' davetsiz teklifleri de sayıyor, %100'ü aşıyor

- `apps/api/src/modules/company-reports/company-reports.service.ts:358` · S035
- Satır seviyesinde responseRate, Parça 8 #8(a) düzeltmesiyle yalnız davetli yanıtlarını payda alıyor. Özetteki overallResponseRate ise hâlâ totalSubmittedBids / totalInvited hesaplıyor: davetsiz (PUBLIC/CONNECTIONS) teklifler ve hiç daveti olmayan taleplerin teklifleri de paya giriyor. Yani düzeltme özet seviyesine uygulanmamış. Değer hem ekranda (general-report-view 'yanitOrani') hem de Excel özetinde gösteriliyor.
- **Senaryo:** RANGE raporunda iki talep var. A talebinde 1 davet ve 1 davetli teklifi, B (PUBLIC) talebinde 0 davet ve 5 teklif var. totalInvited=1, totalSubmittedBids=6 olduğundan özette 'Yanıt oranı %600' görünüyor.
- **Düzeltme:** generalRow sonucuna invitedResponses alanını ekleyin. summarizeGeneral içinde overallResponseRate'i rows.reduce(s + r.invitedResponses) / totalInvited ile hesaplayın. avgBidsPerListing totalSubmittedBids ile kalabilir.

### M-069 — Talep Şartları şeması CUSTOM/ADVANCE koşullarını denetlemiyor, hızlı talep yayınlanamıyor

- `apps/api/src/modules/company-request-defaults/company-request-defaults.service.ts:99` · S035
- superRefine yalnız vade günü ve LC alt tipini zorunlu tutuyor. CUSTOM (not zorunlu, ama şemada paymentNote alanı yok), advancePercent'i null ADVANCE ve paymentDays'i olmayan LC-USANCE kaydediliyor. Talep yayınında buildPaymentPlan bu üç durumu 400 ile reddediyor (company-listings.service.ts ADVANCE/USANCE/CUSTOM dalları). Oysa servis yorumu tam da bunu önlemeyi hedefliyor ('tutarsız şart saklanırsa her talep yayında patlardı'). Arayüz (request-defaults-form) CUSTOM'u listeliyor, hızlı talepte ise paymentNote girişi yok.
- **Senaryo:** Firma Talep Şartları'nda ödeme koşulu olarak 'Özel'i (CUSTOM) seçip kaydediyor. Sonraki her hızlı talepte form doğrulaması paymentNote hatası veriyor ve bu alan ekranda bulunmuyor. Kullanıcı kategoriyi değiştirmedikçe ya da detaylı forma geçmedikçe talep yayınlayamıyor. Benzer şekilde peşin yüzdesi kutusu boşaltılınca (Number('')||null) advancePercent null kaydediliyor ve yayın 400 alıyor.
- **Düzeltme:** Hızlı talep kartındaki ödeme bölümüne CUSTOM seçildiğinde paymentNote alanı ekleyin (veya CUSTOM'u listeden çıkarın). Talep Şartları zod şemasına şu kuralları ekleyin: ADVANCE için advancePercent, LC+USANCE için paymentDays zorunlu, CUSTOM reddedilsin. Peşin yüzdesi kutusunda boş değer gösterilirken `?? 100` kullanmayın.)

### M-070 — Kuruculuk devrinde eski Kurucu'nun yeni rolü koltuk ve Gold kapısından geçmiyor

- `apps/api/src/modules/company-users/company-users.service.ts:1501` · X23
- resolveOwnership, eski Kurucu'ya previousOwnerRoles'tan gelen rolleri doğrudan permissionsForRoles(demoted) ile yazıyor ve assertSeatAvailable çağırmıyor. Koltuk kapısı yalnızca devrin HEDEFİ için çalışıyor (updateUser 862-866). Web tarafı da (company-users-section.tsx 742-750) canGrantBuy'a bakmadan 'Satın Almacı' ve 'Her ikisi' seçeneklerini gösteriyor. Sonuç olarak 'satınalma yetkisi yalnız Gold'da verilir' kuralı ve SEAT_LIMITS (2/4/6) aşılabiliyor.
- **Senaryo:** Kurucu A'nın satış koltuğu ve B'nin satış koltuğu olan bir STANDART firmada 2/2 koltuk dolu. Koltuk tüketmeyen ONAYLAYICI C davet ediliyor, A kuruculuğu previousOwnerRoles=[SATIN_ALMACI,SATISCI] ile C'ye devrediyor. A'ya satınalma izni yazılıyor (STANDART firmada) ve toplam koltuk 3 oluyor. C de kuruculuğu yeni bir izleyici D'ye previousOwnerRoles=[SATISCI] ile devredince 4 satış koltuğu oluşuyor. Zincir sürdükçe ücretsiz pakette sınırsız satışçı açılabiliyor.
- **Düzeltme:** resolveOwnership içinde, eski Kurucu'yu güncellemeden önce aynı tx içinde assertSeatAvailable(tx, companyId, { groups: newSeatGroups(seatGroupsOf(eski izinler, isOwner:true), seatGroupsOf({permissions: permissionsForRoles(demoted)})), context: "assign" }) çağrılmalı. Ek olarak web'de canGrantBuy false iken SATIN_ALMACI/BOTH seçenekleri gizlenmeli.

### M-071 — Gece yanıt süresi cron'u Company.updatedAt'i her gece ilerletiyor (sitemap lastmod + kapsam denetimi bozuluyor)

- `apps/api/src/modules/company-views/company-views.service.ts:398` · S037
- `recomputeReplyTimes` her firma için Prisma `company.update` çağırıyor; `Company.updatedAt` `@updatedAt` olduğu için değer değişmese bile her gece şimdiye çekiliyor. Sitemap firma `lastmod`u (`public-sitemap.service.ts` companies → `updatedAt`) ve içerik çevirisi kapsam denetimi (`t.updatedAt >= e.updatedAt`) bu kolondan okuyor. CLAUDE.md bu tuzağı açıkça yazıyor (searchTextI18n bu yüzden HAM SQL ile yazılıyor); yorum 'Ölçüsü DEĞİŞEN firmayı yaz' dese de kod hepsini yazıyor.
- **Senaryo:** Son 90 günde en az bir bilgi talebi almış (ya da medianReplyHours'ı dolu) her firma için her gece 04:35'te updatedAt=now olur → sitemap'teki profil lastmod'u her gün 'değişti' der (Google lastmod'a güvenmeyi bırakır), ensureCoverage bu firmaların hepsini her gece yeniden kuyruğa alıp enqueue/damga turu yapar.
- **Düzeltme:** Mevcut medianReplyHours değerini de oku, yalnız değeri değişen firmaları yaz. Yazımı `$executeRaw` ile yap (`UPDATE "companies" SET "medianReplyHours"=…, "medianReplyComputedAt"=… WHERE "id"=…`), böylece `@updatedAt` ilerlemez.

### M-072 — enqueueQuiet `this.kick`'i singleton üzerinde geçici olarak eziyor — eşzamanlı çağrıda kalıcı olarak no-op kalabilir

- `apps/api/src/modules/content-translation/content-translation.service.ts:1060` · S037
- `enqueueQuiet` paylaşılan servis örneğinde `this.kick`'i no-op ile değiştirip await sonrası geri yüklüyor. İki enqueueQuiet döngüsü (5 dk'lık cron `ensureCoverage` + yönetici `backfill`/`enqueueAllPublic`) iç içe geçerse ikincisi no-op'u 'orijinal' diye saklar ve en son onu geri yazar; bu andan sonra süreç yeniden başlayana dek anında çeviri (kick, dirty yeniden tetik, ensureTranslated kick'i) hiç çalışmaz. Ayrıca pencere açıkken gelen normal kullanıcı enqueue'larının kick'i de sessizce yutulur.
- **Senaryo:** Yönetici POST admin/content-translations/backfill'e basar (yüzlerce kayıt, dakikalarca süren döngü); bu sırada cron sweep ensureCoverage→enqueueQuiet çalışır. Sıra A:kaydet(gerçek)→B:kaydet(noop)→A:geri(gerçek)→B:geri(noop) → `kick` kalıcı no-op; yeni ürün/talep çevirileri yalnız 5 dk'lık sıralı süpürücüyle (4 paralel yerine tek tek) işlenir, dış davet e-postaları ensureTranslated 60 sn'de dolup özgün dilde gider.
- **Düzeltme:** Paylaşılan `this.kick`'i ezmek yerine `enqueue(type, id, { kick: false })` gibi çağrı başına bir seçenek ekleyin. enqueueQuiet bu seçenekle enqueue'yu çağırsın, içteki `this.kick` çağrısı da bu bayrağa göre atlansın.

### M-073 — Akşam özeti (kategori/davet) kayıtlı kullanıcının tercihini ve tek tık çıkışını yok sayıyor

- `apps/api/src/modules/email-programs/email-programs.service.ts:152` · X09
- Kayıtlı kullanıcının tek tık çıkışı yalnız `notificationPrefs[kapsam]=false` yazar; EmailService kapısı ise yalnız `email_opt_outs`a bakar, tercih kontrolü çağırana bırakılmıştır. `sendDigests` kuyruktaki kalemleri gönderirken alıcının tercihine hiç bakmıyor; kuyruğa alma anında açık olan tercih sonradan kapatılsa da özet gider. RFC 8058/ETK açısından çıkış işlenmemiş olur.
- **Senaryo:** Tedarikçi gün içinde 3 anlık kategori e-postası alır, 4.-6. talepler özete düşer. 14:00'te e-postadaki 'abonelikten çık' (categoryMatch) veya 'tümü'ne basar → prefs güncellenir. 18:00'de `listing_category_digest` yine gönderilir (INVITATION özeti için `invitation` tercihi de aynı şekilde atlanır).
- **Düzeltme:** sendDigests'te her grup için e-postaya ait aktif companyUser'ın notificationPrefs'ini okuyun. isNotificationEnabled(prefs, CATEGORY/INVITATION_DIGEST_CONTEXT) false dönerse kalemleri göndermeden markSent yapın (alternatif olarak EmailService.isOptedOut kayıtlı kullanıcı tercihlerini de adresle kontrol edebilir).

### M-074 — Karşılama serisi sıralamasız take:500 ile çekiliyor, yerel saat filtresi sonradan uygulanıyor; fazladan firmalar hiç e-posta almıyor

- `apps/api/src/modules/email-programs/email-programs.service.ts:249` · X08, X13
- `sendLifecycle` son 30 günde onboarding'i biten firmaları `orderBy` olmadan `take: 500` ile alıyor. Yerel 10:00 penceresi (`inLifecycleWindow`) ve 'bugün gönderildi mi' kontrolü bellekte, bu kesimden SONRA yapılıyor. 500'den fazla uygun firma olduğunda her tickte aynı alt küme dönüyor, geri kalanlar hiçbir tickte işlenmiyor. Pencere dışı ya da o gün e-posta almış firmalar da kotayı tüketiyor.
- **Senaryo:** Soğuk davet rampasıyla 30 günde 700 firma onboarding'i tamamlıyor. Postgres her seferinde aynı 500 satırı (çoğunlukla indeks sırasıyla en eskileri) döndürüyor. Yeni kayıtlı 200 firma profil (gün 1) ve ilk ürün (gün 3) e-postalarını hiç almıyor, günlük e-posta programının en kritik adımları sessizce düşüyor.
- **Düzeltme:** Firmaları `orderBy: { id: 'asc' }` ve cursor ile sayfalayarak tamamını gezin. Ya da yerel saat penceresine giren ülkeleri ve o gün lifecycle e-postası almış firmaları sorgu aşamasında eleyin; tavan kalacaksa en azından `orderBy: { onboardingCompletedAt: 'desc' }` ekleyin.

### M-075 — E-posta 'Yeniden gönder' locale ve context'i düşürüyor: Türkçe içerik, çıkış kapısı ve List-Unsubscribe yok

- `apps/api/src/modules/email/admin-email-logs.service.ts:57` · X06, X09, X18
- resend() emailService.send'e `locale` ve `context` geçmiyor. Bu yüzden renderEmail DEFAULT_LOCALE (tr) ile çiziliyor, konu da şablondan Türkçe üretiliyor. Context olmadığı için stream TRANSACTIONAL sayılıyor: isOptedOut kapısı atlanıyor, List-Unsubscribe başlıkları ve çıkış bağlantısı eklenmiyor, gönderim işlem (şifre/kod) göndericisinden yapılıyor. Yeni log satırında contextType da boş kalıyor.
- **Senaryo:** RU dilli bir kullanıcıya giden 'order_status_changed' ya da lifecycle e-postası teslim edilemedi. SALES 'Yeniden gönder' der ve kullanıcıya tamamen Türkçe bir e-posta gider. Kullanıcı daha önce lifecycle akışından çıkmışsa e-posta yine gider, üstelik çıkış bağlantısı olmadan.
- **Düzeltme:** EmailLog'a gönderim locale'ini yazan bir kolon ekleyin. resend() içinde `locale: log.locale` ve `context: { type: log.contextType, id: log.contextId }` geçirin; bunun için select'e contextId'yi de ekleyin. Böylece opt-out kapısı, akış göndericisi ve çıkış başlıkları orijinal gönderimle aynı olur.

### M-076 — Fatura e-postası bir kullanıcının adresiyle aynıysa tek tık çıkış hiç uygulanmıyor

- `apps/api/src/modules/email/email-unsubscribe.service.ts:80`, `apps/api/src/modules/email/email-unsubscribe.service.ts:87` · S038, X09
- `apply()` adreste aktif kullanıcı bulursa yalnız o kullanıcının `notificationPrefs`ini yazıp döner, `email_opt_outs` yazılmaz. Oysa firmanın `billingEmail`i doluysa pickCompanyRecipients fatura dalını seçer ve `prefs: null` döner; notify() tercihi uygulamaz, EmailService de yalnız `email_opt_outs`a bakar. Tercihler sayfası 'çıkış yapıldı' gösterir ama e-postalar gelmeye devam eder.
- **Senaryo:** Yönetici bir firmanın fatura e-postasını kurucunun giriş adresiyle aynı girer (billingEmail = ayse@firma.com). Kategori duyurusu fatura dalından gider; Ayşe başlıktaki tek tık çıkışa basar → kullanıcı bulunduğu için yalnız prefs.categoryMatch=false yazılır. Sonraki duyurular yine billingEmail dalından (tercihsiz) gönderilir; RFC 8058 çıkışı işlenmemiş olur.
- **Düzeltme:** apply() içinde kullanıcı bulunsa bile email_opt_outs satırını da upsert edin. Ayarlar'da yeniden açma bu satırı zaten siliyor. Alternatif olarak EmailService.isOptedOut'ta adresin kullanıcı notificationPrefs'ine de bakın.

### M-077 — Şehir dizini yalnız açılışta yükleniyor, runbook tohumlamayı API açıldıktan sonra yapıyor

- `apps/api/src/modules/geo/geo-city.service.ts:18` · X07, X20
- GeoCityService dizini yalnız onModuleInit'te yüklüyor, tablo boşsa TR+KKTC yedeğinde kalıyor. Kodda `reload()` çağıran başka bir yol (cron ya da admin ucu) yok. Runbook sırası: API dağıtılır (migration + boş geo_cities ile açılış), ardından seed-geo-cities koşulur. Bu durumda API yeniden başlatılana kadar yabancı şehirler bellekte hiç olmuyor.
- **Senaryo:** Adım 6'da API açılıyor, adım 7'de seed ve backfill-city-ids doğru DB'ye koşuluyor. Doğrulama `/urunler/sehir/de-munich` yine 404 veriyor. Daha önemlisi, yayın günü kayıt olan yabancı firmaların ve eklenen adreslerin `resolveCityId` sonucu null oluyor (dizinde yalnız TR var). backfill-city-ids zaten koşulmuş olduğundan bu firmalar kalıcı olarak şehir sayfaları, şehir süzgeci ve 'Yakınımda' dışında kalıyor.
- **Düzeltme:** Runbook §15.2'nin 7. adımına (ve staging'deki 2. adıma) "seed-geo-cities → Render'da API'yi yeniden başlat → backfill-city-ids → backfill-price-base" sırasını yazın. Kalıcı çözüm olarak, dizin yedekteyken periyodik reload yapın ya da admin'e yetkili bir reload ucu ekleyin.

### M-078 — before imleci verilince portal/izin süzgeci ezilerek düşüyor

- `apps/api/src/modules/notifications/notification.service.ts:497` · S039, X09
- listForUser içindeki where nesnesinde portalReadFilter bir `OR` anahtarı üretiyor. Hemen ardından `before` imleci için yayılan nesne de `OR` anahtarı taşıyor ve JS nesne yaymasında sonraki anahtar kazandığı için portal süzgeci tamamen siliniyor. İmleçli her istekte, kişinin artık göremediği portalın bildirimleri ve istenen portal dışındaki bildirimler geri dönüyor. Bu, 'Rol/izin değişince eski satırlar görünmez olur' kuralını ve portal ayrımını bozuyor.
- **Senaryo:** sell:view izni geri alınmış (ya da onaylayıcı-only olup audience ile satinalma portallı satır almış) bir kullanıcı `GET /notifications?portal=satinalma&before=2100-01-01T00:00:00Z_zzzz` çağırıyor. portalReadFilter devre dışı kaldığı için eski 'satis' bildirimlerinin tamamı (talep başlıkları, teklif/sipariş bilgileri) listede geliyor. Web ileride sayfalamayı kullanmaya başlarsa portal=satis sekmesinin 2. sayfası satınalma bildirimleriyle karışık gelecek.
- **Düzeltme:** where içinde iki koşulu `AND: [portalReadFilter(viewer, opts.portal), ...(opts.before ? [{ OR: [...] }] : [])]` biçiminde birleştirin. İmleçli sayfada portal süzgecinin korunduğunu doğrulayan bir birim testi ekleyin.

### M-079 — Engellenen firma bilgi talebiyle engeli aşabiliyor

- `apps/api/src/modules/public-inquiry/public-inquiry.service.ts:211` · S039
- createAsCompany yalnız kendi ürününe talep gönderimini engelliyor, iki firma arasındaki engel (CompanyBlock) durumuna hiç bakmıyor. Mesajlaşma (company-messages send/thread) aynı durumda iki yönlü engeli uygulayıp 404 dönüyor; kod yorumu da bilgi talebini 'mesaj sınıfından bir eylem' olarak tanımlıyor. Sonuç olarak engellenmiş alıcı, satıcının ürünlerine her gün yeni talep açıp satıcı kullanıcılarına e-posta yağdırabiliyor. Satıcı da engellediği firmanın talebini 'received' listesinde görmeye devam ediyor.
- **Senaryo:** Satıcı S, taciz eden alıcı B'yi engelliyor. B, `POST /company/inquiries` ile S'nin 30 farklı ürününe günde 30 talep gönderiyor (ürün başına 24 saatte 1 kuralı yalnız aynı ürünü sınırlıyor). Her talep anında notifySeller ile S'nin 5 kullanıcısına e-posta düşüyor ve engel hiçbir işe yaramıyor.
- **Düzeltme:** PublicInquiryModule'e CompanyBlocksModule eklenmeli. `createAsCompany` içinde `blockedCompanyIds(input.companyId)` sonucu `product.companyId`'yi içeriyorsa `urunBulunamadi` ile 404 dönülmeli. İsteğe bağlı olarak `listForCompany`, `listClaimed` ve `reply` da engelli `claimedCompanyId` satırlarını gizleyecek şekilde düzenlenebilir.

### M-080 — Satıcı bilgi talebi e-postası izinsiz ve rastgele 5 kullanıcıya gidiyor

- `apps/api/src/modules/public-inquiry/public-inquiry.service.ts:687`, `apps/api/src/modules/public-inquiry/public-inquiry.service.ts:688` · S039, X09
- notifySeller alıcı seçerken yalnız `companyId, isActive` süzgecini kullanıyor. İzin süzgeci (sell:view / sell:inquiry:reply) yok, sıralama yok, `take: 5` uygulanıyor. Bu yüzden satınalma-only ya da onaylayıcı-only üyeler, ücretli satıcıda ziyaretçi adını da içeren satış bildirimini alıyor. Asıl satış temsilcisi ise keyfi ilk 5 kişinin dışında kalabiliyor. Bu, CLAUDE.md'deki 'bildirim alıcıları izinden / pickCompanyRecipients tek kaynak' ve 'biri diğeri hakkında bilgi edinememeli' kurallarına aykırı.
- **Senaryo:** Gold firmada Kurucu, 5 satın almacı/onaylayıcı ve 1 satışçı var (görüntüleme/onay koltuk tüketmediği için kullanıcı sayısı 6'yı geçebilir). Bir misafir ürüne soru sorup doğruluyor. Sorgu Postgres'in döndürdüğü keyfi 5 satırı alıyor: satın almacılar 'Ahmet Y., X ürününüz hakkında bilgi istedi' e-postasını alıyor, satışçı hiç e-posta almıyor ve talebi zamanında göremiyor.
- **Düzeltme:** Alıcıları elle çekmek yerine sell:view izniyle süzün. Kullanıcıların permissions/roles alanlarını ve firmanın ownerUserId'sini birlikte çekip hasCompanyPermission(subject, [viewPermissionForPortal("satis")]) ile filtreleyin, orderBy createdAt asc verin. Alternatif olarak NotificationService'in portal:"satis" alıcı çözümünü (pickCompanyRecipients ile aynı mantığı) yeniden kullanın.

### M-081 — Ürün facet yanıtı satıcı ülkesi sayaçlarını (countries) hiç döndürmüyor

- `apps/api/src/modules/public-marketplace/public-marketplace.service.ts:813` · S019
- `contextualFacetCounts` (product-index.ts:463) `countries` sayaçlarını hesaplıyor, ama hem herkese açık `productFacets` hem panel `company-items.service.ts:702` facet yanıtı `ctx.countries`i yanıta koymuyor. `git grep ctx.countries` boş çıkıyor, yani alan hiçbir zaman bağlanmamış. Web `ProductFacets.countries` alanını okuyor: `CountryGroup` (product-filters.tsx:412), `CountryLinks` (product-index.tsx:288, urunler/ulke/[ulke]/page.tsx:114) ve llms.ts:160 hep boş dizi alıyor. CLAUDE.md'deki "?ulke= SATICI ÜLKESİ süzgeci + facet'i (ürün ve firma dizini, panel dahil)" kararı ürün tarafında çalışmıyor.
- **Senaryo:** TR ve DE satıcılarının ürünleri olan /urunler (ya da panel Ürün Ara) sayfası açılır. API facet yanıtında `countries` alanı yok, web `facets.countries ?? []` ile boş liste alıyor. Bu yüzden "Satıcı ülkesi" süzgeç grubu hiç çizilmiyor, ülke sayfalarına iç bağlantı şeridi boş kalıyor, llms-full.txt'de ülke listesi çıkmıyor. Ülkeye göre süzmek yalnızca adrese elle ?ulke= yazarak mümkün.
- **Düzeltme:** public-marketplace.service.ts productFacets ve company-items.service.ts facet dönüşüne `countries: ctx.countries` ekleyin (dönüş tipine de `{ country: string; count: number }[]` ekleyin). Ürün facet'inde ülke sayacını doğrulayan bir spec testi yazın.

### M-082 — Supabase zayıf/sızmış parola reddi 503 'birazdan tekrar deneyin' olarak dönüyor

- `apps/api/src/modules/supabase-auth/supabase-auth.service.ts:141` · X17
- CLAUDE.md'ye göre iki Supabase projesinde de sızmış parola koruması AÇIK. createUser yalnız /registered|exists|taken|already/ desenini 409'a çeviriyor; weak_password (422) dahil diğer tüm hatalar 503 'Hesap oluşturulamadı, lütfen birazdan tekrar deneyin' oluyor. updatePassword de her hatayı 503 'Şifre değiştirilemedi' olarak dönüyor (satır 190). Kod tabanında weak/pwned için hiçbir eşleme yok.
- **Senaryo:** Kullanıcı kayıtta 'Password123!' giriyor (DTO kuralının hepsini geçiyor ama HIBP'de var). Supabase admin.createUser reddediyor → API 503 'birazdan tekrar deneyin'. Kullanıcı aynı parolayla tekrar tekrar deniyor ve hep aynı hatayı alıyor. Aynı durum davet kabulünde, parola değiştirmede ve sıfırlamada da yaşanıyor; sıfırlamada jeton da yanıyor (ayrı bulgu). Not: GoTrue admin uçlarının parola gücünü denetlediği varsayılıyor, bu yüzden güven orta.
- **Düzeltme:** createUser ve updatePassword içinde error.code === 'weak_password' ya da status 422 gelirse 400/422 dönülmeli ve yerelleştirilmiş "Bu parola sızıntı listelerinde geçiyor, başka bir parola seçin" mesajı gösterilmeli. 503 yalnızca 0/429/≥500 durumlarında dönülmeli. Parola sıfırlamada da güncelleme başarısız olursa jeton geri açılmalı (usedAt=null).

### M-083 — Kuruculuk devri, yeni Kurucunun işlem (koltuk) izinlerini sessizce siliyor

- `apps/web/src/app/[locale]/company/(authed)/ayarlar/_components/company-users-section.tsx:605`, `apps/web/src/app/[locale]/company/(authed)/ayarlar/_components/company-users-section.tsx:608` · S055
- confirmTransfer hedefe yalnız `roles: ["SAHIP"]` gönderiyor. Backend updateUser (company-users.service.ts ~l.853) bu durumda `permissions: permissionsForRoles(roles)` yazıyor; SAHIP hazır seti = MANAGEMENT_PRESET olduğu için hedefin buy/sell işlem izinleri siliniyor. Faz R'den beri Kurucu işlem iznini örtük taşımıyor (CLAUDE.md 'İzin modeli': işlem izinleri açıkça yazılır). roles-ownership.spec'teki 'Kurucu tam yetkilidir, yalnız SAHIP' beklentisi Faz R öncesinden kalma.
- **Senaryo:** GOLD firmada, açık talepleri olan SATIN_ALMACI kullanıcı Ayşe'ye kuruculuk devrediliyor. Devirden sonra Ayşe'nin permissions değeri MANAGEMENT_PRESET oluyor ve buy:listing:manage / buy:award / buy:order:manage siliniyor. Ayşe kendi talebini kazandıramıyor, siparişini yönetemiyor; ekranda hiçbir uyarı yok. Düzeltmek için kendi satırındaki işlem tiklerini (koltuk müsaitse) elle yeniden açması gerekiyor.
- **Düzeltme:** Backend'deki devir dalında (transferring) hedefin mevcut işlem (koltuk) izinleri korunmalı: `permissions` değeri MANAGEMENT_PRESET ile hedefin mevcut BUY_SEAT/SELL_SEAT izinlerinin birleşimi olmalı. Bir alternatif, frontend'in hedefin SATIN_ALMACI/SATISCI rollerini SAHIP'e eklemesi. İlgili spec beklentisi de güncellenmeli.

### M-084 — Davet diyaloğu GOLD olmayan firmada varsayılan olarak satınalma yetkisi seçiyor → davet 400 ile düşüyor

- `apps/web/src/app/[locale]/company/(authed)/ayarlar/_components/invite-user-dialog.tsx:71` · S056
- Katalog gelince yetki kümesi koşulsuz `presets.SATIN_ALMACI` (buy:listing:manage, buy:award… işlem izinleri) ile dolduruluyor; `canGrantBuy`/`seatsFull` hesaba katılmıyor. PermissionTable'da `tierBlock`/`seatBlock` yalnız `!has(c.key)` iken kilitlediği için önceden işaretli satınalma tikleri işaretli ve gönderilebilir kalıyor. Backend `assertSeatAvailable` STANDART/SILVER'da buy grubunu `satinalmaYetkisiYalnizGoldPaketteVerilebilir` ile reddediyor; tüm yeni firmalar STANDART (schema default) olduğundan lansmanda her ücretsiz firmanın ilk daveti varsayılan hâliyle başarısız olur.
- **Senaryo:** STANDART firma kurucusu Ayarlar › Kullanıcılar › Üye davet et açar, yalnız e-postayı yazıp 'Davet gönder'e basar → POST /company/users permissions=[buy:view, buy:listing:manage, buy:award, ...] → 400 'Satınalma yetkisi yalnız GOLD pakette verilebilir'. Aynısı koltuk doluyken (freeSeats=0) 'koltuk dolu' hatasıyla olur; kullanıcı tikleri elle kaldırmak zorunda.
- **Düzeltme:** Varsayılan seti `seats` yüklendikten sonra pakete göre seç (canGrantBuy false ise buy işlem izinlerini çıkar, ör. GORUNTULEYICI/SATISCI; seatsFull ise koltuklu izinleri düşür) ve aynı filtreyi reset (:92) ile PermissionTable `applyPreset` içinde de uygula.

### M-085 — Belge yüklenince kaydedilmemiş KYC alanları (MERSİS/sicil/IBAN/SWIFT) sıfırlanıyor

- `apps/web/src/app/[locale]/company/(authed)/ayarlar/dogrulama/page.tsx:58` · S056
- KYC alanları `useEffect(() => {...}, [data])` ile `data` her değiştiğinde sunucu değerleriyle üzerine yazılıyor. `useUploadDoc` başarıda `["company-docs"]` sorgusunu geçersiz kılıyor; yanıt her seferinde yeni presigned URL taşıdığı için `data` referansı her refetch'te değişiyor ve effect yeniden çalışıyor. Alanlar yalnız `submit` ile kalıcılaşır, yani ilk gönderimde sunucu değeri null → kullanıcının yazdığı her şey boş stringe dönüyor.
- **Senaryo:** UNVERIFIED/REJECTED firma: kullanıcı üstteki formda MERSİS, ticari sicil no, IBAN, hesap sahibi ve SWIFT alanlarını doldurur, sonra aşağıdan eksik vergi levhasını yükler → upload başarılı → company-docs refetch → effect tüm alanları "" (veya eski red edilmiş değer) yapar; 'Gönder' eksik alan listesiyle kapanır, kullanıcı her şeyi yeniden yazmak zorunda kalır (her yüklemede tekrarlanır).
- **Düzeltme:** Ön-doldurmayı yalnız ilk data gelişinde bir kez yapın (initializedRef), ya da effect bağımlılığını KYC alanlarının kendisine daraltın (data?.mersisNo, data?.iban vb.). Alternatif olarak kullanıcının değiştirdiği (dirty) alanları sunucu değeriyle ezmeyin.

### M-086 — Bildirimler sayfası yalnız son 30 kaydı gösteriyor; eski bildirimlere ulaşmanın yolu yok

- `apps/web/src/app/[locale]/company/(authed)/bildirimler/page.tsx:40` · S057
- useNotifications, `/notifications` ucunu take/before göndermeden çağırıyor; servis bu durumda varsayılan olarak 30 satır döndürüyor. API'ye 'Dalga B (P7)' kapsamında 31. satır ve sonrası erişilebilsin diye `before` imleci eklenmiş, ama web tarafı bu imleci hiç kullanmıyor ve sayfada 'daha fazla yükle' yok. hasUnread ile portal filtresi de yalnız bu 30 kayıt üzerinden hesaplanıyor.
- **Senaryo:** Yoğun bir firmada kullanıcının 80 bildirimi var; en yeni 30'u okunmuş, daha eskilerde okunmamışlar duruyor. Zil rozeti okunmamış sayısını (count) gösterirken Bildirimler sayfası yalnız 30 okunmuş kaydı listeler: 'Tümünü okundu işaretle' düğmesi gizlenir (hasUnread=false) ve eski bildirimlere hiçbir şekilde ulaşılamaz.
- **Düzeltme:** Bildirimler sayfasını useInfiniteQuery'ye geçirin; son satırın `<createdAt ISO>_<id>` değerini `before` olarak gönderip 'Daha fazla yükle' ekleyin. 'Tümünü okundu' düğmesini listeye göre değil, useUnreadCount() > 0 koşuluna göre gösterin.

### M-087 — Tedarikçinin kendi teklif özetinde kalem fiyatları teklifin ana birimiyle etiketleniyor

- `apps/web/src/app/[locale]/company/(authed)/ilan/[id]/_components/my-bid-status-panel.tsx:332` · S058, X12
- `BidSummaryCard` tüm kalem birim fiyatlarını ve satır toplamlarını `withSym` ile teklifin ana biriminde (`bid.currency`) basıyor; API `myBid.items[].currency` alanını dönmesine rağmen kullanılmıyor. Çok-birimli teklifte tedarikçi kendi gönderdiği fiyatları yanlış birimde görür (gönderilmiş teklif düzenlenemediği için itiraz/karışıklık yolu).
- **Senaryo:** Teklif ana birimi EUR, kalem 3 TRY ile 5.000 fiyatlandı. Özet kartı kalem satırında '5.000 €' ve satır toplamını € olarak gösterir; alt 'Toplam' ise (ana birime çevrilmiş bid.amount) çok farklı çıkar.
- **Düzeltme:** Kalem satırlarında birim fiyat ve satır toplamını affixCurrency(..., bi.currency ?? cur, intl) ile basın. Kalem birimi ana birimden farklıysa, alt Toplam'ın ana birime çevrilmiş tutar olduğunu da belirtin.

### M-088 — Taslakta bekletilen dış/üye davetleri talep detaydan yayınlanınca hiç gönderilmiyor

- `apps/web/src/app/[locale]/company/(authed)/ilan/[id]/page.tsx:435` · X22
- Hızlı talep 'Taslak kaydet' AI'ın bulduğu dış adresleri ve Rothern üyelerini `pendingInvitesKey/pendingMemberInvitesKey` altında sessionStorage'a yazıp kullanıcıyı talep detayına götürür ('yayında gider' varsayımı). Detay sayfasındaki birincil 'Yayınla' düğmesi yalnız POST /publish çağırır; bu anahtarları okuyan tek yer QuickRequest edit yolu olduğundan davetler sessizce düşer (sekme kapanınca da kaybolur).
- **Senaryo:** Alıcı hızlı talepte AI ile 5 tedarikçi e-postası seçer, 'Taslak kaydet'e basar, açılan talep detayında sağ üstteki 'Yayınla'ya basar → talep OPEN olur, 'yayımlandı' toast'ı görünür ama 5 davetin hiçbiri kuyruğa girmez; alıcı teklif bekler.
- **Düzeltme:** Bekleyen davetleri sunucu tarafında talebe bağlı sakla ve yayınlanınca gönder. Daha basit bir çözüm olarak detay sayfasındaki handlePublish başarılı olduktan sonra aynı session anahtarlarını okuyup external-tender-invite ve invite-members uçlarını çağır, ardından anahtarları temizle.

### M-089 — Sahip görünümünde Yayınla ve Onayı iptal et düğmesi sayfa kaydırılana kadar görünmüyor

- `apps/web/src/app/[locale]/company/(authed)/ilan/[id]/page.tsx:1808` · S059
- Sahip görünümünde "Yayınla" (l.canPublish) ve "Onayı iptal et" (pendingApprovalId) yalnız yapışkan eylem şeridinde çiziliyor. Şerit, başlık görünümden çıkana kadar `invisible h-0` sınıfında kalıyor. TenderActionsMenu'de yayınlama eylemi yok. Teklifçi görünümünde aynı hata 2026-09-10'da düzeltilmiş (CTA başlık kartına da eklenmiş), sahip görünümünde düzeltilmemiş.
- **Senaryo:** Kullanıcı Taleplerim'den taslak bir talebin detayını açıyor. İlk ekranda başlık kartı, meta şeridi ve işlemler menüsü var, "Yayınla" düğmesi hiçbir yerde yok. Başlığı tamamen yukarı kaydırmadan düğme görünmüyor. Yüksek ekranda ve kısa sayfada kaydırma olmayabilir, o zaman düğme hiç çıkmıyor. Aynısı onayı bekleyen kazandırmada "Onayı iptal et" için de geçerli. Tek yol "Düzenle" formundan yayınlamak.
- **Düzeltme:** Teklifçi dalındaki düzeltmedeki gibi `canManage && l.canPublish` ile Yayınla ve `canManage && l.pendingApprovalId` ile Onayı iptal et düğmelerini sahip başlık kartına da ekleyin, örneğin TenderActionsMenu bölümünün yanına. Yapışkan şerit yalnız kaydırınca devralsın.

### M-090 — Elendikten sonra yeniden teklifte yeni dosya eklenirse gönderim çıkmaza giriyor

- `apps/web/src/app/[locale]/company/(authed)/ilan/[id]/teklif-ver/page.tsx:964` · S060, X22
- CLAUDE.md'nin tek revizyon yolu 'alıcı eler (LOST) → tedarikçi yeniden teklif verir'. Formda dosya seçici her durumda açık; submit, `l.myBid` varsa taslak adımını atlayıp doğrudan dosya yüklemeye geçer. API belge ekleme/yükleme URL'sini yalnız DRAFT teklife izin verdiği için LOST (ve pazarlıkta SUBMITTED) teklifte yükleme 400 alır, `uploadStaged` başarısız döner ve gönderim iptal edilir; kullanıcı dosyayı kaldırmadan ya da önce 'Taslak kaydet'e basmadan teklif veremez.
- **Senaryo:** Tedarikçinin teklifi elenmiştir (LOST); güncel proforma PDF'ini ekleyip 'Teklifi gönder'e basar → POST bid-documents/upload-url 'Gönderilmiş teklifin belgeleri değiştirilemez' 400 → 'dosya yüklenemedi, listede kaldı' hatası, teklif gönderilmez; her denemede aynı sonuç.
- **Düzeltme:** submit içinde `l.myBid` yoksa ya da durumu LOST ise dosya yüklemeden önce `placeBid(buildPayload(true))` ile teklif taslağa çekilmeli. Pazarlıktaki SUBMITTED teklifte (isAuctionRebid) ise dosya seçici gizlenmeli ya da devre dışı bırakılıp yanına açıklama eklenmeli.

### M-091 — Ana akış (kapalı zarf RFQ) kart görünümünde muadil beyanı alanları hiç çizilmiyor

- `apps/web/src/app/[locale]/company/(authed)/ilan/[id]/teklif-ver/page.tsx:1231`, `apps/web/src/components/tenders/wizard/step-2-items.tsx:120` · S060, S085
- Muadil onay kutusu ile marka/parça no girdileri yalnız `renderItemExtras` içinde (721-766) ve bu fonksiyon yalnız pazarlık çalışma masasına (`AuctionBidWorkbench`) veriliyor. Pazarlık dışı kart listesi (1231-1287) teslim süresi, kalem para birimi ve soruları kendi elle çiziyor ve muadil alanlarını atlıyor; yorumdaki 'kart görünümüyle aynı bileşenler, tek kaynak' iddiası tutmuyor. Sonuçta ana akışta `isAlternative` hep false gidiyor.
- **Senaryo:** Alıcı kalemde muadile izin verir (varsayılan). Tedarikçi RFQ teklif formunu açar; kalem kartında muadil seçeneği yoktur, eşdeğer ürün teklif ettiğini beyan edemez. Ya orijinal marka sanılan bir teklif verir ya da not alanına serbest metin yazar; alıcı karşılaştırmada ayırt edemez.
- **Düzeltme:** Kart listesindeki elle çizilmiş ek alanlar bloğunu (1231-1287) `renderItemExtras(it)` çağrısıyla değiştirin. Ya da en azından muadil onay kutusunu ve marka/parça no alanlarını buraya da ekleyin; böylece "tek kaynak" iddiası gerçekten doğru olur.

### M-092 — Teklif detayındaki Kazandır, ana sayfadaki korumaları atlıyor: süresi dolmuş teklifte aktif, onay notu yok, geri alınamazlık uyarısı yok

- `apps/web/src/app/[locale]/company/(authed)/ilan/[id]/teklif/[bidId]/page.tsx:207` · S060
- CLAUDE.md: geçerliliği dolmuş teklifte 'ekranda Kazandır pasif + ipucu'; ilan detayı `bidExpired` ile düğmeyi pasifleştiriyor ama bu sayfa yalnız `award.isPending`e bakıyor. Ayrıca `handleAward` `useAwardPreview` çağırmıyor, yani onaya takılan kazandırmada onaycılara not girilemiyor; onay metni 'Sipariş oluşacak' diyor, denetim #6'da ana sayfaya eklenen 'GERİ ALINAMAZ' uyarısı burada yok.
- **Senaryo:** 30 gün geçerlilikli teklif 35. günde teklif detayından açılır; Kazandır aktiftir, tıklanınca sunucu 400 'geçerlilik süresi dolmuş' döner. Onay akışı olan firmada kazandırma notsuz onaya gider; kullanıcı işlemin geri alınamaz olduğunu okumadan onaylar.
- **Düzeltme:** Ana sayfadaki `handleAward`/`bidExpired` mantığını ortak bir hook'a alıp bu sayfada da kullanın: süresi dolmuşta düğme pasif + ipucu, önce `useAwardPreview`, onaya takılırsa not diyaloğu, onay metni `kazandirilsinMiBuIslemGeri`.

### M-093 — Onaycı listesi users:manage isteyen uçtan geliyor; yalnız approvals:manage taşıyan kişi akış kuramıyor

- `apps/web/src/app/[locale]/company/(authed)/onaylar/_components/approval-flows-section.tsx:119` · S061
- `ApprovalFlowsSection` onaycı adaylarını `useCompanyUsers()` ile `GET /company/users` ucundan çeker, bu uç ise `@RequireCompanyPermission("users:manage")` ister (company-users.controller.ts:43). Yetki tablosunda "Onay akışı tanımlama" (approvals:manage) tiki olup "Kullanıcı ve yetki" (users:manage) tiki olmayan bir üyede sorgu 403 döner, `approvers` boş kalır. Sayfa kapısı ve API akış uçları yalnız approvals:manage istediği için ekran açılır ama işlev çalışmaz. Adım düzenleyici de kullanıcıyı Ayarlar › Kullanıcılar'a yönlendirir, oysa o sayfa da bu kişiye kapalıdır.
- **Senaryo:** Kurucu, bir üyeye yalnız approvals:manage (+approval:act) verir. Üye Onaylar › Onay akışlarını düzenle › Yeni onay akışı açar. 2. adımda "Onaycı olabilecek aktif kullanıcı yok" yazar, adım diyaloğunda seçici yerine uyarı çıkar, `step2Valid` hiç true olmaz ve akış kaydedilemez. Mevcut bir akışı düzenlerken de onaycı adları "—" görünür.
- **Düzeltme:** approvals:manage ile erişilebilen hafif bir aday ucu ekleyin (örneğin GET company/approvals/approver-candidates: yalnızca aktif ve approval:act sahibi kullanıcıların id/ad/rol bilgisini dönsün) ve web tarafında useCompanyUsers yerine bunu kullanın. Alternatif olarak GET company/users ucunu ["users:manage","approvals:manage"] any-of yapın, ama bu tüm kullanıcı verisini açığa çıkaracağı için tercih 

### M-094 — A1-DISPUTED akreditifli siparişte LC adımları gizleniyor, satıcının sevk çıkışı kilitleniyor

- `apps/web/src/app/[locale]/company/(authed)/siparis/[id]/_components/lc-step-panel.tsx:58` · S062
- Panel LC açılış/kabul adımlarını yalnız `order.status === "ACCEPTED"` iken çiziyor; DISPUTED için `step` null dönüyor. Oysa backend `lcMarkOpened`/`lcMarkAccepted` A1 ihtilafında da (`isA1Dispute`) bu adımlara açıkça izin veriyor (company-orders.service.ts:1190, 1228), çünkü bunlar satıcının 'mal bulundu → sevk' çıkışının ön koşulu. Sayfada `shipUnlocked` (page.tsx:190) `lcAcceptedAt` istediğinden sevk butonu da hiç çıkmıyor; iki yönlü çıkış (invariants §A1) UI'da tek yönlü kalıyor.
- **Senaryo:** LC siparişi ACCEPTED, alıcı henüz akreditifi açmamış → satıcı iptal talebi açar → alıcı reddeder → DISPUTED. Artık alıcı 'Akreditif Açıldı', satıcı 'Akreditifi Kabul Ettim' butonunu göremez; satıcıya 'Siparişi Tamamla' (sevk) hiç sunulmaz ve 'Sıradaki adım' 'karşı tarafın işlemi bekleniyor' der. Tek çıkış alıcının iptali onaylaması; API izin verse de sipariş teslim yoluna dönemez.
- **Düzeltme:** lc-step-panel.tsx'teki açılış/kabul dalının koşulunu `order.status === "ACCEPTED" || (order.status === "DISPUTED" && !order.defectNotifiedAt)` olarak genişletin. page.tsx:383-386'daki LC bekleme ipucuna da aynı A1-DISPUTED koşulunu ekleyin.

### M-095 — E-posta doğrulama yoluyla girişte 'Oturumumu açık bırak' tercihi yok sayılıyor, 30 günlük kalıcı çerez basılıyor

- `apps/web/src/app/[locale]/company/login/_components/login-form.tsx:127` · S063, X17
- Girişte EMAIL_NOT_VERIFIED alan kullanıcı doğrulama moduna geçiyor. `verify.mutateAsync({ email, code })` gövdesinde `rememberMe` yok, `VerifyEmailDto` da bu alanı kabul etmiyor. `AuthCookieInterceptor.resolvePersistent` rememberMe yoksa ve eski çerez de yoksa varsayılan olarak kalıcı (30 gün) çerez yazıyor. İstemci yalnız UI anlık görüntüsünü `setCompanyRemember(false)` ile sessionStorage'a alıyor, oturum çerezi kalıcı kalıyor.
- **Senaryo:** Paylaşılan bir bilgisayarda kullanıcı kutuyu işaretsiz bırakıp giriş yapıyor. E-postası doğrulanmamış olduğu için kodu girip doğrulama yoluyla giriş yapıyor. Tarayıcıyı kapatınca UI anlık görüntüsü siliniyor ama httpOnly `rk_company` çerezi 30 gün geçerli kalıyor. Sonraki kişinin tarayıcıdan yaptığı API istekleri (ör. konsoldan `fetch` ile `credentials`) o hesabın oturumuyla yetkilendiriliyor.
- **Düzeltme:** VerifyEmailDto'ya `@IsOptional() @IsBoolean() rememberMe?: boolean` ekleyin. useVerifyEmail girdisine rememberMe alanını ekleyip login-form'daki submitVerify içinde `remember` değerini gönderin (signup doğrulama akışı alanı göndermediği için varsayılan davranışını korur).

### M-096 — Dış davet çıkış sayfası açılır açılmaz çıkışı yazıyor, e-posta tarayıcıları alıcıyı kalıcı olarak davet dışı bırakabilir

- `apps/web/src/app/[locale]/davet-kapat/page.tsx:24`, `apps/web/src/app/[locale]/davet-kapat/page.tsx:25` · S095, X09
- /davet-kapat sayfası yüklenince useEffect içinde `GET /public/referral-optout` çağrılıyor. Bu uç `referralOptOut` kaydını upsert ediyor ve kaydı adrese bağlı ve kalıcı yazıyor. Aynı ekipteki e-posta-tercihleri sayfası tam da bu riski gerekçe gösterip çıkışı düğmeye bağlamıştı ("kurumsal güvenlik tarayıcıları bağlantıyı önceden açar"). Kayıtsız firmalara giden soğuk davet e-postaları (tender-external-invite, tender-invite-digest, referral-invite) bu bağlantıyı taşıyor ve JS çalıştıran sandbox tarayıcılarının (Defender Safe Links, Proofpoint vb.) açtığı sayfa çıkışı tetikliyor.
- **Senaryo:** Alıcı, kurumsal adresi olan bir tedarikçiye dış talep daveti gönderiyor. Posta geçidinin sandbox'ı e-postadaki tüm bağlantıları gerçek bir tarayıcıda açıyor. /davet-kapat?token=... yüklenince useEffect GET isteğini atıyor ve adres ReferralOptOut'a yazılıyor. O firmaya giden sonraki bütün davetler kimse istemeden OPTED_OUT durumuna düşüyor.
- **Düzeltme:** Sayfa açılışı hiçbir şey yazmamalı: e-posta-tercihleri'ndeki gibi yalnızca jetonu doğrulayıp maskeli adresi göstermeli, çıkış ise düğmeyle gönderilen bir POST ile yapılmalı. API'de GET salt-okur hale getirilmeli, upsert yeni bir POST ucuna (throttle'lı) taşınmalı.

### M-097 — Gizlilik Politikası firma profilinin yalnız üyelere göründüğünü söylüyor, oysa profil herkese açık

- `apps/web/src/app/[locale]/sozlesmeler/gizlilik/page.tsx:51` · S096
- Madde 3'te "Firma adınız ve profiliniz yalnız giriş yapmış üyelere görünür." yazıyor. CLAUDE.md'ye göre profil onboarding bitince kendiliğinden yayına alınıyor (`publicEnabled=true`), `/firma/<slug>` üzerinden giriş yapmadan açılıyor, sitemap'e giriyor ve dizinleniyor; `/firmalar` vitrini de firma kartlarını anonim ziyaretçiye gösteriyor. Aydınlatma/gizlilik metni kişisel ve ticari verinin kamuya açılmasını olduğundan dar anlatıyor. KVKK m.10 kapsamındaki şeffaflık yükümlülüğüne aykırı.
- **Senaryo:** Bir firma, gizlilik politikasına güvenip kaydoluyor. Profili (firma adı, logo, tanıtım, web sitesi, LinkedIn) giriş yapmamış herkese ve Google'a açılıyor. Politika bunun tersini söylediği için firma şikâyet edebilir ve yanlış bilgilendirme hukuken sorun olur.
- **Düzeltme:** Cümleyi şöyle değiştirin: "Herkese açık talep sayfasında firma adınız gösterilmez; firma profiliniz (/firma/…) ise kayıt tamamlanınca herkese açık yayımlanır ve arama motorlarınca dizinlenebilir." Profilin yayından nasıl kaldırılacağını ekleyin, KVKK aydınlatma metnini de buna göre güncelleyip H-1 avukat incelemesine dahil edin.

### M-098 — Eşleşmeyen belge satırı elle seçilince para birimi/fiyat denetimi atlanıyor, önizleme ile forma yazılan değer farklı

- `apps/web/src/components/bids/bid-import-dialog.tsx:107` · S063
- Elle seçimde (override) değer doğrudan `unmatchedDocRows` satırından alınıyor. Bu satırların `currency` alanı sunucuda izinli birimler listesine göre süzülmüyor, `unitPrice` da `validUnitPrice`/MONEY_DECIMALS yuvarlamasından geçmiyor (bid-matching.ts:324-333). Otomatik eşleşmede kabul edilmeyen birim `currency=null` olur ve uyarı basılır, elle seçimde ikisi de yok. Önizleme `${fmt(unitPrice)} ${e.currency}` ile belgedeki birimi gösteriyor, ama `applyImportedPrices` birimi yalnız `canItemCurrency` açıksa yazıyor.
- **Senaryo:** Talep yalnız TRY kabul ediyor (ya da açık eksiltme). AI eşleşmeyen '185,00 USD' satırını kullanıcı elle bir kaleme bağlıyor. Önizlemede '185,00 USD' görünüyor ve uyarı yok. 'Uygula'dan sonra forma 185 TRY yazılıyor, teklif USD fiyatının TL karşılığı yerine 185 TL olarak gidebiliyor. Çok birimli talepte izin listesinde olmayan 'GBP' state'e yazılıyor: Select bunu 'Ana birim' diye gösteriyor ama gönderim backend'de reddediliyor.
- **Düzeltme:** Sunucuda `unmatched` satırlarına da `applyDocRowValues` ile aynı birim ve fiyat kurallarını uygulayın: izinli birime göre süzün, ana birime eşitse null yapın, fiyatı `validUnitPrice` ile yuvarlayıp doğrulayın. İstemcide elle seçilen satırın birimi ana birimden farklıysa ve `canItemCurrency` kapalıysa bir uyarı gösterin ya da o satırın uygulanmasını engelleyin.

### M-099 — Modal varsayılan açıklaması iki gerçek kullanımda da yanlış kitleye yazılmış

- `apps/web/src/components/categories/category-selector-modal.tsx:168` · S065
- Modal `description` verilmediğinde açıklamayı `mode`'a göre seçiyor: multi için "Tedarik edebildiğiniz kategorileri işaretleyin — ilgili satın alma taleplerine davet alırsınız", single için "Satın Alma Talebi için 1 kategori seçin — tedarikçi eşleşmesi bu seçime göre yapılır". Oysa multi modu kullanan tek yer alıcının talep formu (quick-request.tsx:736), single modu kullanan tek yer satıcının ürün formu (product-showcase-form.tsx:455); ikisi de `modalDescription` geçmiyor. Yani alıcıya tedarikçi metni, satıcıya satın alma talebi metni gösteriliyor (TR/EN/RU üç dilde).
- **Senaryo:** Alıcı hızlı talep formunda Kategori seç'e basar → modal başlığı "Talep kategorisi", altında "Tedarik edebildiğiniz kategorileri işaretleyin — ilgili satın alma taleplerine davet alırsınız" yazar. Satıcı ürün vitrininde kategori seçerken "Satın Alma Talebi için 1 kategori seçin — tedarikçi eşleşmesi bu seçime göre yapılır" görür.
- **Düzeltme:** quick-request.tsx:736 ve product-showcase-form.tsx:455'e bağlama uygun ve üç dile çevrilmiş bir modalDescription verin. Ya da modaldaki varsayılan açıklamayı mode yerine amaca bağlayın veya tamamen kaldırın.

### M-100 — Kalem Kataloğu arşivle düğmesi yanlış izne bağlı — Satın Almacı her tıklamada 403 alır

- `apps/web/src/components/company/catalog-items-view.tsx:41` · S066
- Arşivle/Geri al düğmesi `templates:manage` ile gösteriliyor, ancak API `PATCH company/items/:id/active` `sell:product:manage` istiyor. SATIN_ALMACI ve Yönetici hazır setlerinde `templates:manage` var fakat `sell:product:manage` yok; bu yüzden satınalma portalındaki (Şablonlar › Kalem Kataloğu) sayfanın tek yönetim eylemi bu kullanıcılar için her zaman başarısız olur. Tersine, satış izinli ama templates:manage'siz kullanıcı düğmeyi hiç görmez.
- **Senaryo:** Gold firmada SATIN_ALMACI rolündeki kullanıcı /company/satinalma/sablonlar/kalemler sayfasında bir kalemin "Arşivle" düğmesine basar → API 403 döner, "İşlem başarısız" tostu çıkar; katalog temizlenemez.
- **Düzeltme:** `PATCH :id/active` için izni `["sell:product:manage", "templates:manage"]` any-of yapın ya da web kapısını API ile aynı izne bağlayın. Yayındaki vitrin ürününün satınalma tarafından arşivlenmesi istenmiyorsa bunu serviste isPublic kontrolüyle ayırın.

### M-101 — ICU plural mesajına biçimlenmiş string verildiği için EN/RU'da 1000+ sonuçta "NaN companies" basılıyor

- `apps/web/src/components/company/market/panel-company-index.tsx:144` · S067
- EN/RU katalogda `firma` ve `urun` mesajları `{n, plural, one {# ...} other {# ...}}` biçiminde, ama kod `n` olarak `formatNumber(total, locale)` ile üretilmiş bir STRING veriyor. intl-messageformat plural dalında `value - offset` hesaplıyor: "1,234" (EN) ya da "1 234" (RU) sayıya çevrilince NaN çıkıyor, `other` dalı seçiliyor ve `#` yerine `NaN` basılıyor. Aynı hata panel-product-index.tsx:172'de `t("urun", { n: formatNumber(total, locale) })` çağrısında da var. TR mesajı düz `{n}` olduğu için Türkçede sorun görünmüyor.
- **Senaryo:** EN arayüzde, sonucu 1000 ve üzeri olan ürün ya da firma dizini açılınca başlığın yanında "NaN products" / "NaN companies" yazıyor; RU'da "NaN товара" görünüyor. 1000'in altında da RU'da sayı gruplaması plural kuralına uymuyor.
- **Düzeltme:** İki çağrıda da `n: total` (sayı) verilmeli; `#` sayıyı zaten yerel ayara göre grupluyor. TR mesajları da `{n, number} firma` / `{n, number} ürün` biçimine çekilmeli ki TR'de basamak gruplaması kaybolmasın.

### M-102 — İhtilaflı (DISPUTED) sipariş kartında "Sipariş iptal edildi" yazıyor

- `apps/web/src/components/company/orders-list.tsx:311` · S068
- `orderStageIndex` DISPUTED için `terminated: true` döndürür. Kart alt satırı yalnızca REJECTED ile diğer durumları ayırıyor, bu yüzden DISPUTED sipariş de `siparisIptalEdildi` ("Sipariş iptal edildi" / "Order canceled") metnini ve CircleSlash ikonunu alıyor. Oysa DISPUTED canlı ve geri dönebilen bir durum: API A1-DISPUTED'dan sevke izin veriyor (`from: ["ACCEPTED","CREATED","DISPUTED"]`), ayıp ihbarı geri alınınca da önceki duruma dönülüyor. Aynı kartta rozet "İhtilaflı", alt satır "iptal edildi" diyor; iki bilgi birbiriyle çelişiyor.
- **Senaryo:** Satıcı iptal talebi gönderir, alıcı reddeder ve sipariş DISPUTED olur (ya da alıcı ayıp ihbarı açar). Siparişler listesinde iki taraf da kartın altında "Sipariş iptal edildi" görür ve siparişi bitmiş sanar. Oysa satıcı hâlâ sevk edebilir, alıcı da ihbarı geri çekebilir.
- **Düzeltme:** orders-list.tsx:311'de DISPUTED için ayrı bir dal açılmalı. Burada amber tonlu bir "Sipariş ihtilaflı" metni gösterilmeli, bunun için mevcut siparisIhtilafli anahtarına benzer yeni bir ordersList anahtarı eklenebilir. "Sipariş iptal edildi" metni yalnız CANCELLED durumunda çıkmalı.

### M-103 — Hazır set çipi paket ve koltuk kapısını atlıyor; Gold olmayan firmada davet varsayılanı hataya düşüyor

- `apps/web/src/components/company/permission-table.tsx:199` · S068
- `applyPreset` hazır seti olduğu gibi uyguluyor. `canGrantBuy=false` iken de SATIN_ALMACI çipi buy işlem izinlerini işaretliyor; `freeSeats` doluyken de koltuk isteyen izinleri işaretliyor. `tierBlock` ve `seatBlock` yalnız `!has(c.key)` durumunda kilit koyduğu için işaretli buy tikleri kilitsiz görünüyor ve "Gold pakette" gerekçesi basılmıyor. Davet diyaloğu (invite-user-dialog.tsx:69-72) da varsayılan olarak `catalog.presets.SATIN_ALMACI` yüklüyor; backend `assertSeatAvailable` ise buy grubunu GOLD altında 400 ile reddediyor.
- **Senaryo:** Açılışta firmaların neredeyse hepsi STANDART ya da SILVER olacak. Kurucu Ayarlar › Kullanıcılar › Üye davet et'i açar, e-postayı yazıp doğrudan "Davet gönder"e basar. Tabloda buy tikleri işaretli ve kilitsiz, gerekçe yazmıyor. İstek "Satınalma yetkisi yalnız Gold pakette verilebilir" hatasıyla düşer. Aynı hata Satın Almacı çipine her tıklamada da tekrarlanır.
- **Düzeltme:** Davet diyaloğundaki varsayılan hazır set (ve gönderim sonrası sıfırlama) `canGrantBuy ? SATIN_ALMACI : SATISCI` olmalı. `applyPreset` içinde `!canGrantBuy` iken buy grubunun koltuklu izinleri setten çıkarılmalı, `seatLockedFor` doluysa o grubun işlem izinleri de düşürülmeli.

### M-104 — 'Ücretsiz doğrulanın' kartı yalnız düzenleme yetkisi OLMAYANLARA çiziliyor

- `apps/web/src/components/company/profile-editor.tsx:238` · S069
- Doğrulama çağrısı kartı `if (!canEdit)` salt-okunur dalının içine konmuş; düzenleme dalının sağ rayında (satır 398-468) yok. `canEdit` = `company:manage`; kartın bağlantısı `/company/ayarlar/dogrulama` da `company:manage` kapılı. Böylece kartı görenler eylemi yapamıyor (bağlantı 'yetki gerektirir' ekranına düşüyor), doğrulamayı yapabilecek Kurucu/Yönetici ise kartı hiç görmüyor. CLAUDE.md'nin 'rozet satan üç yüzey'inden biri fiilen çalışmıyor.
- **Senaryo:** Doğrulanmamış ücretsiz firmanın Kurucusu Profilim'i açar: sağ rayda yalnız Profil durumu, Arama görünürlüğü, Ürünlerim var; doğrulama teşviki yok. Aynı firmanın yalnız sell:view'lı çalışanı kartı görür, 'Belgeleri yükle'ye basar ve yetki hatası ekranına düşer.
- **Düzeltme:** Kartı ayrı bir bileşene çıkarıp düzenleme dalının rayına, StatusCard'ın altına ekleyin. Salt-okunur dalda kartı kaldırın ya da bağlantısız bir bilgi metni olarak bırakın (ör. "firma yöneticinizden doğrulama isteyin").

### M-105 — AI profil doldurma 80 karakterlik hizmet üretiyor, kayıt DTO'su 60'ta reddediyor

- `apps/web/src/components/company/profile-editor.tsx:872` · S069
- profile-enrich servisi hizmet başlıklarını 80 karaktere kırpıyor, ancak PATCH /company/profile DTO'su her hizmet için `@MaxLength(60)` istiyor. Editör AI sonucunu doğrudan taslağa yazıyor (`services: data.services`) ve ChipEditor elle eklenen hizmette de uzunluk sınırı uygulamıyor. Sonuç: 'Kaydet' 400 ile düşer, kullanıcı hangi çipin sorun olduğunu bilmeden hata alır; ücretsiz pakette AI doldurma firma başına tek hak olduğundan ilk izlenim bozulur.
- **Senaryo:** Kullanıcı 'Web sitemden AI ile doldur'a basar; model 'Endüstriyel otomasyon sistemleri kurulumu ve periyodik bakım hizmetleri' (≈70 karakter) gibi bir hizmet döner. Kaydet → API 400 'each value in services must be shorter than or equal to 60 characters'; profil kaydedilmez.
- **Düzeltme:** profile-enrich'teki kırpmayı 60'a indirin; sınırı DTO ile ortak bir sabitten alın. ChipEditor'da Input'a maxLength={60} ekleyin ve add içinde de uzunluğu denetleyin.

### M-106 — Teklif karşılaştırma matrisinde farklı para birimleri etiketsiz yan yana basılıyor

- `apps/web/src/components/company/reports/bid-comparison-view.tsx:312` · S069
- Matriste 'Hedef' sütunu ve 'Genel toplam' hedef hücresi sunucunun rapor biriminde (`baseCurrency`) çevrilmiş değerken, tedarikçi sütunları ham `ip.unitPrice` ve `p.totalAmount` (teklifin kendi birimi) gösteriyor. Birim etiketi yalnız 'Teklif para birimlerini göster' işaretliyse çıkıyor (varsayılan kapalı); payload'daki çevrilmiş `totalTry` hiç kullanılmıyor. `allowedCurrencies` ile çok birimli teklif alınabildiğinden aynı satırda EUR ve TRY sayıları birimsiz kıyaslanıyor. Denetim part8 #1 API tarafını düzeltti, ekran hâlâ ham değeri basıyor.
- **Senaryo:** TRY rapor birimli firma, USD talep açar; teklifler 1.000 USD ve 36.000 TRY gelir. Varsayılan görünümde 'Genel toplam' satırı '1.000' ve '36.000' gösterir, hedef '38.000' (TRY) — kullanıcı USD teklifi 38 kat ucuz sanır; birim fiyat hücresinin yanındaki '-%2,5' ise TRY bazında doğru olduğundan sayılarla çelişir.
- **Düzeltme:** Genel toplam satırında `p.totalTry` değerini `money(..., sym)` ile gösterin; ham tutar ve birim fiyat basılacaksa teklif birimi etiketi her zaman görünsün ya da API rapor birimine çevrilmiş birim fiyatı da döndürsün. Hedef sütununa da `sym` eklensin.

### M-107 — Rapor tarih aralığı başlangıcı UTC, bitişi tarayıcı yerel saatiyle yorumlanıyor

- `apps/web/src/components/company/reports/general-report-view.tsx:100` · S069, X13
- `new Date(rangeStart)` ('YYYY-MM-DD') UTC gece yarısı, `new Date(`${rangeEnd}T23:59:59`)` ise tarayıcının yerel saati oluyor. Türkiye'de başlangıç günü 00:00–03:00 arasında oluşturulan talepler rapordan düşüyor. Negatif ofsetli kullanıcıda ise Excel başlığındaki (İstanbul saatiyle basılan) bitiş tarihi bir sonraki gün görünüyor. Aynı kalıp savings-report-view.tsx:71-72'de de var.
- **Senaryo:** TR kullanıcı 1–30 Eylül aralığını seçiyor. 1 Eylül 01:30'da açılan talep (31 Ağu 22:30Z) `createdAt >= 2026-09-01T00:00Z` filtresine takılıp genel/tasarruf raporunda yer almıyor, toplamlar eksik çıkıyor.
- **Düzeltme:** İki bileşende de iki ucu `parseAppWallClockInput(`${rangeStart}T00:00`)` ve `parseAppWallClockInput(`${rangeEnd}T23:59:59`)` ile Europe/Istanbul saatine göre çevirin. İsterseniz bitişi bir sonraki günün 00:00'ı yapıp backend'de `lt` kullanın.

### M-108 — Bağlantısı kopan üyesi olan tedarikçi grubu düzenlenemiyor

- `apps/web/src/components/company/templates-view.tsx:129` · S070
- Düzenleme dialogu `selected` kümesine şablonun TÜM üyelerini koyuyor (`detail.data.members`). Ama `findOne` üyeleri bağlantı durumuna bakmadan döndürüyor, onay kutuları ise yalnız `useConnections()` içindeki ACTIVE ve tier'ı geçerli bağlantılar için çiziliyor. Böylece bağlantısı kopan üye görünmez olduğu hâlde seçili kalıyor ve kullanıcı onu listeden çıkaramıyor. Kaydet'e basınca bu gizli id de gönderiliyor ve API'deki `assertMembersConnected` isteği reddediyor.
- **Senaryo:** Grupta 5 firma var. Bunlardan birinin bağlantısı kaldırılıyor ya da bağlantıyı kuran tarafın paketi bitiyor (INV-TIER-1). Kullanıcı grubu düzenleyip yalnız adını değiştiriyor ve Kaydet'e basıyor. PATCH /company/supplier-templates/:id 404 dönüyor ("bağlantınız olmayan 1 firma"). Dialogda o firma görünmediği için onu çıkaramıyor, sayaç da '5 seçili' diyor. Grup artık hiç düzenlenemiyor, tek çare silip baştan kurmak.
- **Düzeltme:** Dialogu tohumlarken üyeleri aktif bağlantı id'leriyle kesiştirin (`members.filter(m => connectedIds.has(m.id))`) ve düşen üye sayısını bilgi notuyla gösterin. Alternatif olarak update, bağlantısı kopan id'leri reddetmek yerine sessizce ayıklayabilir.

### M-109 — Döngü süresi grafiğinde t("gun") parametresiz çağrılıyor, 'saat' ve 'Ortalama' sabit Türkçe

- `apps/web/src/components/dashboard/satinalma-ihale-tab.tsx:551` · S073, X06
- `CycleTrendChart` birim etiketini `t("gun")` ile değer vermeden alıyor, oysa katalog metni `{n} gün` (EN `{n} days`). use-intl üretim derlemesinde değer verilmeyen mesajı derlemeden olduğu gibi döndürüyor, bu yüzden grafiğin altında ve tooltip'te ham `{n} gün` görünüyor; geliştirmede anahtar yolu görünüyor. Değerlerin hepsi 1 günün altındaysa birim olarak sabit Türkçe `"saat"` kullanılıyor. Tooltip başlığı `"Ortalama"` da sabit Türkçe; bu ASCII sözcükler cırcır sezgiselinin dışında kaldığı için yakalanmadı.
- **Senaryo:** En az 3 ayı dolu döngü verisi olan bir Gold alıcı panosunu İngilizce açıyor. Satın alma talebi sekmesindeki döngü trendi grafiğinin altında '{n} days' yazıyor, tooltip'te '12 {n} days' ve 'Ortalama' görünüyor. Değerler 1 günün altındaysa birim her dilde 'saat' oluyor.
- **Düzeltme:** Birim etiketi için parametresiz yeni katalog anahtarları (ör. `unitDays`/`unitHours`) ve tooltip başlığı için `ortalama` anahtarı ekleyin (TR/EN/RU). Tooltip değerini de `t("gun", { n })` / `t("saat", { n })` ile biçimlendirin.

### M-110 — Kategori kırılımında tutar ile yüzde farklı dönemlerden geliyor

- `apps/web/src/components/dashboard/tasarruf-tab.tsx:258` · S073
- `categoryRows` yalnız ay ya da yıl verisi (çeyrek ve özel aralıkta yıl) gösteriyor. Satırın yanındaki tutar ise analytics `categorySavings` alanından alınıyor ve bu alan seçili dönemin penceresinde (çeyrek ya da özel aralık) hesaplanıyor. Sonuçta çeyrek veya özel aralık seçiliyken aynı satırda yıl yüzdesi ile çeyrek/özel aralık tutarı yan yana basılıyor. Sayfa üstündeki "yıl verisi gösteriliyor" notu da tutar için yanlış oluyor.
- **Senaryo:** Firma 2026-Q3 (çeyrek) seçiyor. "Ana Kategori Bazlı Tasarrufum" kartında Elektronik satırı yıl başından beri olan payı (ör. %62,00) gösteriyor. Yanındaki "12.000 €" ise yalnız Q3 tasarrufu. Özel aralıkta da overview TasarrufTab'a period="year" geçiyor ama analytics özel aralıkla hesaplanıyor, aynı uyumsuzluk oluşuyor. Analytics ilk 6 kategori dışında kalan satırlarda tutar hiç görünmüyor.
- **Düzeltme:** Tutar yalnız `period === costPeriod` olduğunda (yani ay ya da yıl seçiliyken) eşleştirilsin, çeyrek ve özel aralıkta gizlensin. Daha iyi çözüm: tasarruf ucunun `byKey` çıktısına `amount` alanı eklenip yüzde ile tutar aynı kaynaktan ve aynı dönemden gösterilsin.

### M-111 — Gelen bilgi talepleri yalnız ilk 20 kayıtla sınırlı; sayfalama yok, eski talepler görülemez/yanıtlanamaz

- `apps/web/src/components/inquiries/inquiries-view.tsx:62`, `apps/web/src/hooks/use-inquiries.ts:58` · S074, X05, X22
- API `listForCompany` sayfa başına 20 kayıt döndürüyor (`pageSize = 20`, `?page=`), ama `useReceivedInquiries` hiçbir zaman `page` göndermiyor ve InquiriesView'da sayfalama/"daha fazla" yok; dönen `total` alanı da hiç kullanılmıyor. 21. ve daha eski talepler satıcı panelinde hiçbir yoldan açılamıyor, dolayısıyla yanıtlanamıyor. "Tümü/Yanıt bekleyen/Yanıtlanan" sayaçları ve kilit kartındaki `threads.length` sayısı da gerçek toplamı değil ilk 20'yi gösteriyor. Alıcı tarafında `listClaimed` da `take: 50` ile sessizce kırpılıyor.
- **Senaryo:** Satıcıya 25 doğrulanmış bilgi talebi gelmiş olsun; en eski 5 tanesi (verifiedAt desc sıralamada 21-25) hiç listelenmez, arama da onları bulamaz (istemci tarafı arama yalnız ilk 20'de). Bu 5 alıcı hiç yanıt alamaz; ücretsiz satıcının kilit kartı "25" yerine "20 bilgi talebi" der.
- **Düzeltme:** useReceivedInquiries'e page parametresi (ya da useInfiniteQuery) ekleyip InquiriesView'a "Daha fazla yükle"/sayfalama koyun; sayaçlar ve kilit kartı için API'nin `total` değerini (gerekirse açık/yanıtlı sayılarını da API'den) kullanın.

### M-112 — Misafir bilgi talebi dili sayfa dilinden değil tarayıcı dilinden belirleniyor

- `apps/web/src/components/marketplace/inquiry-dialog.tsx:59` · X06
- Herkese açık ürün sayfasındaki bilgi talebi formu API'ye yalın fetch ile gidiyor ve `Accept-Language` başlığı koymuyor. Bu yüzden tarayıcının kendi başlığı gönderiliyor. API `create` içinde `const locale = currentLocale()` ile bu başlığı `PublicInquiry.locale` olarak yazıyor. Doğrulama e-postası, doğrulama bağlantısının dil öneki, satıcının sonraki yanıt bildirimi ve formdaki API hata mesajları bu yanlış dilden üretiliyor. Servisteki yorum ('formu hangi dilde doldurduysa o') web tarafında karşılanmıyor.
- **Senaryo:** Çince ya da Arapça tarayıcılı yabancı bir alıcı (Accept-Language: zh-CN,zh) /en/companies/x/products/y sayfasından talep gönderiyor. Başlıkta desteklenen dil yok, negotiateLocale 'tr' döndürüyor. Doğrulama e-postası Türkçe gidiyor, bağlantı Türkçe /talep-onayla sayfasına açılıyor. Alıcı okuyamadığı için talebi onaylamıyor ve talep satıcıya hiç ulaşmıyor. Benzer şekilde İngilizce tarayıcılı bir Rus ziyaretçi /ru sayfasından İngilizce e-posta alıyor.
- **Düzeltme:** inquiry-dialog.tsx içindeki fetch başlıklarına `"Accept-Language": useLocale()` (next-intl) eklenmeli. Daha sağlam bir çözüm için DTO'ya isteğe bağlı bir `locale` alanı (`@IsIn(LOCALES)`) açılıp servis bunu `currentLocale()`'dan önce kullanabilir.

### M-113 — Portal parametresiz e-posta linki mesajı yanlış yönde (boş konuşma) açıyor

- `apps/web/src/components/messaging/company-inbox-view.tsx:70` · S080
- Yeni mesaj e-postasının CTA'sı `appRoutes.messagesWith(baseUrl, senderCompanyId, locale)` ile `?with=` üretir, `portal` eklemez (company-messages.service.ts:102). Gelen kutusu portal yoksa `myPortals[0]` yani iki izni olan kullanıcıda her zaman 'satinalma' seçer. Alıcıdan mesaj alan satıcı taraf (recipientSide='sell') linke tıkladığında gerçek konuşma 'satis' yönündeyken 'satinalma' yönündeki boş thread açılır; kullanıcı buradan cevap yazarsa ayrı, ters yönlü yeni bir thread oluşur.
- **Senaryo:** Alıcı firma A, tedarikçi B'ye satınalma portalından mesaj atar → B'nin Kurucusu (buy:view + sell:view + sell:bid:submit) e-postadaki 'Mesajı gör' linkine tıklar → /company/mesajlar?with=A → selected={id:A, portal:'satinalma'} → 'Henüz mesaj yok' + 'Bu konuşmada alıcısınız' görünür; okunmamış mesaj görünmez, cevap yanlış konuşmaya (B alıcı, A satıcı) gider.
- **Düzeltme:** `appRoutes.messagesWith`'e opsiyonel portal parametresi ekleyin ve e-postada `recipientSide === "sell" ? "satis" : "satinalma"` geçirin. Web tarafında da portal verilmemişse threads yüklendikten sonra bu firmayla var olan thread'in portalını seçin.

### M-114 — Nitelik seçenekleri EN/RU satıcıya Türkçe gösteriliyor (optionLabels yok sayılıyor)

- `apps/web/src/components/products/attribute-fields.tsx:79` · S081
- API `/company/items/attributes/:categoryId` çağrısı (resolveCategoryAttributes, i18n Faz 4b) tr dışı dillerde `optionLabels` döndürüyor. Ancak web AttributeDef tipinde bu alan yok ve AttributeFields SINGLE_SELECT/MULTI_SELECT seçeneklerini ham kanonik Türkçe değer `o` ile basıyor. Aynı şekilde product-preview.tsx:363 attributeList değerleri de ham Türkçe; bu yüzden önizleme, alıcının gördüğü yerelleştirilmiş sayfadan ayrışıyor.
- **Senaryo:** İngilizce arayüzlü bir satıcı nitelik tanımı olan bir kategori seçiyor. Başlıklar İngilizce geliyor (nameTr yerel adı taşıyor) ama açılır menü ve çip seçenekleri 'Paslanmaz çelik', 'Galvaniz' gibi Türkçe metinler oluyor. Önizlemede de değerler Türkçe görünüyor.
- **Düzeltme:** AttributeDef tipine `optionLabels?: Record<string,string>` ekleyin. Seçenek ve çip metnini `d.optionLabels?.[o] ?? o` ile basın, value kanonik `o` olarak kalsın. product-preview.tsx attributeList değerlerini de aynı eşlemeden geçirin.

### M-115 — Yeni ürün 'Onaya gönder' sonrası kullanıcı bayat TASLAK formunda kalıyor

- `apps/web/src/components/products/product-showcase-form.tsx:354` · S081
- handleSave yeni üründe thenSubmit=true olsa bile önce onCreated(saved) çağırıyor. Bu çağrı üst bileşende setCreating(false) + setEditing({showcase: created}) yapıyor (products-view.tsx:181-193), yani DRAFT kopyayla düzenleme formu açılıyor. Ardından publish başarılı olunca çağrılan onClose, create modunun kapanışı olan () => setCreating(false) (products-view.tsx:180); bu da no-op olduğu için editing kapanmıyor. Sunucuda ürün PENDING durumunda ama ekranda 'Taslak' rozeti ve 'Onaya gönder' düğmesi kalıyor.
- **Senaryo:** Firma Yeni ürün açıyor, alanları doldurup 'Onaya gönder'e basıyor. 'Onaya gönderildi' toast'ı çıkıyor ama ekran listeye dönmüyor; form hâlâ Taslak gösteriyor. Kullanıcı bir alanı düzeltip tekrar gönderince PATCH 409 PRODUCT_IN_REVIEW alıyor ve 'kaydedilemedi' hatası görüyor.
- **Düzeltme:** Yeni üründe thenSubmit ise onCreated'ı publish'ten sonra, publish yanıtındaki güncel kayıtla (PENDING) çağırın; ya da publish başarılı olunca doğrudan listeye dönün. Alternatif: products-view'da create modunun onClose'u setEditing(null) de yapsın.

### M-116 — Kullanıcının seçimini kaldırdığı Rothern üyesi web araması dönünce yeniden seçiliyor

- `apps/web/src/components/tenders/ai-suppliers/form-supplier-panel.tsx:221` · S082
- `preselect` seçimi kaldırılmış adayları `deselectedRef.current.has(r.key)` ile eliyor. Ancak web sonucundaki üye satırının anahtarı hâlâ e-posta (`toRow`: `(c.email ?? c.name).toLowerCase()`), panelde işaretin kaldırıldığı anahtar ise `m:<companyId>` (`combineRows`/`memberKey`). Bu yüzden kullanıcının bilerek çıkardığı üye, web araması bitince (ya da 'Yeniden ara' ile) sessizce `memberInvites`'a geri ekleniyor. Satır 172'deki 'bilerek çıkarılanlar yeniden seçilmez' sözü üyeler için tutulmuyor.
- **Senaryo:** Otomatik arama başlar, platform üyeleri hızlıca gelir ve seçili olur. Kullanıcı üye X'in işaretini kaldırır (deselected = {'m:X'}). Yaklaşık 60 sn sonra web araması X'in sitesini de bulur (memberCompanyId=X, status=MEMBER, key='satis@x.com'). `preselect` bu satırı deselected'da görmez, `addM` X'i yeniden ekler. Kullanıcı fark etmeden yayınlarsa X doğrudan talebe davet edilir.
- **Düzeltme:** preselect içinde eleme anahtarını normalize edin: `const k = r.memberCompanyId ? memberKey(r.memberCompanyId) : r.key; !deselectedRef.current.has(k)`. İsterseniz toRow'da üye satırının anahtarını baştan `m:<id>` yapın.

### M-117 — 50'den fazla bağlantısı olan alıcı 'Bağlantılarım' ile yayın yapamıyor

- `apps/web/src/components/tenders/quick/quick-request.tsx:196`, `apps/web/src/lib/tenders/form-schema.ts:299` · S083, S095
- CONNECTIONS kipinde `invitedSupplierIds` tüm bağlantılarla dolduruluyor (satır 196 ve 997), ama form şeması `invitedSupplierIds` için `.max(50)` uyguluyor; backend DTO ise `@ArrayMaxSize(200)`. Hiç kimseyi çıkarmayan ve 50'den fazla bağlantısı olan alıcı 'Maksimum 50 tedarikçi' hatası alıyor. Yayınlayabilmek için bağlantı çıkarması gerekiyor, bu da `applyConnectionsScope` ile talebi PRIVATE'e çevirip çıkarılan firmaları talebi hiç göremez hale getiriyor.
- **Senaryo:** 60 bağlantılı alıcı 'Bağlantılarım' kartını seçer (60 firma otomatik işaretlenir) ve 'Talebi Yayınla'ya basar. `form.trigger()` başarısız olur, 'Eksik: Maksimum 50 tedarikçi' mesajı çıkar ve yayın mümkün olmaz. Tek yol 10 bağlantıyı çıkarmak, bu da görünürlüğü daraltır.
- **Düzeltme:** CONNECTIONS kipinde `.max(50)` sınırı uygulanmamalı; sınır yalnız PRIVATE/davet listesi için geçerli olmalı (superRefine ile visibility'ye göre). Kimse çıkarılmamışsa davet listesi hiç gönderilmemeli ya da backend 200 sınırına göre parçalanmalı.

### M-118 — Varsayılan teslimat adresi sorgu sırasına göre seçilmiyor veya fatura adresi seçiliyor

- `apps/web/src/components/tenders/quick/quick-request.tsx:223` · S083
- Effect `appliedRef` ile tek sefer çalışıyor. `defaultsQ.data` adres sorgusundan önce gelirse `addresses.data` undefined olduğu için varsayılan TESLİMAT adresi hiç seçilmiyor; adresler sonradan geldiğinde effect erken dönüyor. Geri düşüş olarak kullanılan `addresses.data[0]` FATURA tipinde olabiliyor; bu adres AddressPicker'da gizli olduğundan (`type !== "FATURA"`) seçili kart görünmüyor, ama özet ve gövdede teslimat adresi olarak gidiyor.
- **Senaryo:** Soğuk açılışta request-defaults yanıtı adreslerden önce gelir: varsayılan depo adresi seçilmez ve alıcı elle seçmek zorunda kalır. Yalnız FATURA adresi olan firmada ise fatura adresi teslimat adresi olarak kaydedilir, ama seçicide hiçbir kart seçili görünmez.
- **Düzeltme:** Adres seçimini ayrı bir effect'e taşıyın (adresler yüklenince ve `deliveryAddressId` boşsa bir kez çalışsın). Geri düşüşte FATURA tipini dışlayın.

### M-119 — Düzenlenen talebin içeriği yeni talep formuna 'taslak' olarak sızıyor

- `apps/web/src/components/tenders/quick/quick-request.tsx:251`, `apps/web/src/components/tenders/quick/quick-request.tsx:255` · S083, X22
- Taslak otomatik saklama effect'i `isEdit` kontrolü yapmadan `QUICK_DRAFT_KEY`'e yazıyor, edit kipinde kaydet/yayınla sonrasında da bu anahtar silinmiyor (yalnız yeni kipte `clearSession(QUICK_DRAFT_KEY)` var). Aynı sekmede boş 'Yeni talep' açıldığında (`initialValues` undefined) bu kayıt okunuyor ve başka bir talebin başlığı, kalemleri, kategorileri, adresi, davetlileri ile bekleyen dış/üye davetleri 'Kaldığınız taslak geri yüklendi' bandıyla forma doluyor.
- **Senaryo:** Alıcı mevcut X talebini düzenleyip kaydeder ya da yayınlar, ardından 'Yeni talep'e tıklar. Form X'in kalemleri, invitedSupplierIds'i ve bekleyen e-posta davetleriyle dolu açılır. Alıcı fark etmeden yayınlarsa X'in kopyası oluşur ve X için seçilmiş dış adreslere yeni talep daveti gider.
- **Düzeltme:** Otomatik saklama effect'inin başına `if (isEdit) return;` eklenmeli. Ek güvence olarak edit kipindeki yayınla/kaydet dallarında da clearSession(QUICK_DRAFT_KEY) çağrılabilir.

### M-120 — 'Yeni talep aç' sonrası form şartsız kalıyor, taslak saklama da duruyor

- `apps/web/src/components/tenders/quick/quick-request.tsx:541` · S083
- `onNew`, `appliedRef.current = false` yapıp formu çıplak `DEFAULT_FORM_VALUES` ile sıfırlıyor. Yükleme effect'inin bağımlılıkları (`defaultsQ.data`, `addresses.data` ...) değişmediği için effect yeniden çalışmıyor; `create` de request-defaults sorgusunu tazelemiyor. Bu yüzden deliveryTerm undefined, bidsCloseAt boş, para birimi TRY, adres boş kalıyor; oysa Şartlar paneli eski `terms` state'ini gösterip teslim şeklini 'seçili' sunuyor. Ayrıca `appliedRef` false kaldığı için taslak otomatik saklama effect'i o oturumda bir daha hiç yazmıyor.
- **Senaryo:** Alıcı bir talebi yayınlar, panelde 'Yeni talep aç'a basar, kalemleri girip 'Talebi Yayınla'ya basar. 'Sağdaki ticari şartlar panelinde teslim…' hatası çıkar, ama panel teslim şeklini seçili gösterdiği için alıcı sebebi anlayamaz. Süre çipi seçili görünse de kapanış boştur. Profilde EUR varsa şartlara dokunulmadan kalan alanlar TRY varsayılanıyla kalır. Sayfa yenilenirse girilenler de kaybolur.
- **Düzeltme:** `onNew` içinde `reset(applyRequestDefaults({ ...DEFAULT_FORM_VALUES }, terms ?? fallback))` kullanıp `appliedRef.current`'i true bırakın, varsayılan teslimat adresini de yeniden seçin. `externalInvites`, `memberInvites` ve `stagedDocs` state'lerini de sıfırlayın. Daha basit bir yol: sayfanın `key` değerini değiştirip bileşeni yeniden mount etmek.

### M-121 — Tur geçmişi penceresi her teklifi ilanın birimiyle gösteriyor (teklif birimi yok sayılıyor)

- `apps/web/src/components/tenders/round-history-dialog.tsx:38`, `apps/web/src/components/tenders/round-history-dialog.tsx:86` · S084, X12
- API `roundHistory` her satırda `currency` dönüyor (P12 #11 düzeltmesi), ancak web `RoundHistoryEntry` tipi bu alanı düşürüyor ve pencere tüm tutarları ilanın birim etiketiyle basıyor. Çok-birimli pazarlıkta (izinli birimler serbest) USD teklif TRY gibi görünür; sembol de dilin yazım kuralını izlemiyor.
- **Senaryo:** TRY ana birimli pazarlıkta bir tedarikçi 100 USD, diğeri 4.000 TRY verdi. Sahip tur geçmişinde '100 ₺' ve '4.000 ₺' görür; 100 USD'lik teklif absürt ucuz görünür.
- **Düzeltme:** `RoundHistoryEntry.bids` tipine `currency: string` ekleyin. Satırda da ilan birimi yerine `b.currency ?? currency` kullanarak locale'e uygun para biçimlendiricisiyle (formatMoney) gösterin.

### M-122 — Katalog seçicide önceki aramalarda seçilen kalemler eklenirken sessizce düşüyor

- `apps/web/src/components/tenders/wizard/catalog-picker-dialog.tsx:84` · S084
- `selected` durumu arama değişince korunuyor ve düğme `selectedCount` ile "N kalemi ekle" diyor. Ancak `apply` yalnız o anki arama sonucundaki `items` listesini süzüyor. Başka bir aramada işaretlenmiş kalemler listede olmadığı için eklenmiyor ve `setSelected({})` ile kayboluyor.
- **Senaryo:** Kullanıcı "vida" araması yapıp 2 kalemi işaretliyor, sonra "somun" arayıp 1 kalem daha işaretliyor. Düğme "3 kalemi ekle" diyor, tıklanınca talebe yalnız somun ekleniyor; vidalar uyarı vermeden kayboluyor. Talep eksik kalemle yayınlanabilir.
- **Düzeltme:** `selected` durumunda miktarla birlikte tüm `CatalogItem` nesnesi saklanmalı (ör. `Record<string, { item: CatalogItem; qty: number }>`) ve `apply` o anki `items` yerine bu kayıttan kurulmalı. Diğer yol: arama değişince seçim açıkça sıfırlanmalı, sayaç da buna göre güncellenmeli.

### M-123 — "Listede yok" serbest birim alanı ilk harfte bilinen birime kilitleniyor

- `apps/web/src/components/ui/unit-select.tsx:130` · S086
- Serbest metin kutusunda her tuşta `normalizeUnit(t)` kodu üst forma yazılıyor; birim takma adları tek harfleri ve kısa ekleri de içeriyor ("t"→TON, "g"→GRM, "l"/"л"→LTR, "m"→M, "h"→HUR, "ad"→PCE, "sa"→HUR). İlk harf eşleşince `resolved` dolar, `isOther` false olur ve kutu kaybolur. Ardından "Listede yok…" yeniden seçildiğinde `onChange({ unit: freeText, unitCode: null })` gönderiliyor ama `resolved = unitCode ?? normalizeUnit(value)` aynı harfi yine tanıdığı için liste bilinen birimde kalıyor. Böylece kullanıcı bu serbest birime bir daha giremiyor.
- **Senaryo:** Kalem ekleyen alıcı birim olarak "Listede yok…" seçip "teneke", "tüp", "galon", "levha" ya da RU "лист" yazmaya başlıyor. İlk harf olan "t", "g", "l" veya "л" girildiği anda metin kutusu kayboluyor ve seçim ton/gram/litre oluyor. "Listede yok" tekrar seçilince de ton/gram/litre olarak kalıyor. Talep yanlış birimle (ör. 50 ton) yayınlanabiliyor ya da kullanıcı birimi giremiyor; tek çıkış yolu kelimeyi tamamen yapıştırmak.
- **Düzeltme:** Serbest mod bileşen içinde ayrı bir durumda tutulsun (`const [otherMode, setOtherMode] = useState(!resolved)`) ve metin kutusu `otherMode` açıkken görünsün. Yazarken `unitCode: null` gönderilsin; kod eşlemesi yalnız alan odaktan çıkınca (onBlur) ve tam eşleşmede yapılsın.

### M-124 — Çıkışta AI tedarikçi keşfi sonuçları silinmiyor (B5-9 düzeltmesi eksik)

- `apps/web/src/lib/company-auth/tenant-storage.ts:15` · S092
- `TENANT_SESSION_PREFIXES` listesinde `quick-request`, `tender-product-seed`, `ai-tender-draft`, `ai-search-intent` ve `rothern:invite-prefill` var. Ama `FormSupplierPanel`in sonuç anahtarları `rothern:quick-ai-suppliers` ve `rothern:quick-ai-suppliers:auto` (components/tenders/ai-suppliers/form-supplier-panel.tsx:43-44) bu öneklerin hiçbiriyle başlamıyor. Bu yüzden ne `clearTenantSessionData` (çıkış) ne de `bindSessionOwner` (kullanıcı değişimi) bu kayıtları siliyor. Denetim kaydı B5-9 'çıkış AI'ın bulduğu adresleri silinir' diye DÜZELTİLDİ olarak işaretli; `1343f135` commit'inde anahtar zaten bu adla vardı, yani düzeltme hiç tamamlanmamış.
- **Senaryo:** Ortak bilgisayarda X firmasının kullanıcısı Hızlı Talep formunda AI tedarikçi keşfi çalıştırıyor. Sonuçta bulunan dış tedarikçilerin adı, e-postası ve web sitesi, ayrıca eşleşen Rothern üyeleri sessionStorage'a yazılıyor. Kullanıcı talebi yayınlamadan çıkış yapıyor. Aynı sekmede Y firmasının kullanıcısı giriş yapıp 'Yeni talep'i açınca `FormSupplierPanel` mount olurken `readSession(RESULTS_KEY)` X'in aday listesini geri yüklüyor ve ekranda gösteriyor. AUTO_KEY de kaldığı için Y'nin kendi otomatik araması da başlamıyor.
- **Düzeltme:** `TENANT_SESSION_PREFIXES` listesine `"rothern:quick-ai-suppliers"` öneki eklenmeli; bu `:auto` anahtarını da kapsar. tenant-storage.test.ts'e de bu anahtarın silindiğini doğrulayan bir test eklenmeli.

### M-125 — SSR hız sınırı muafiyeti herkese açık: sorgu dizesi değiştirilerek API throttle'ı tamamen atlanabiliyor

- `apps/web/src/lib/public/marketplace-api.ts:177` · X16
- B11-1 düzeltmesiyle web sunucusu tüm `/api/public/*` GET çağrılarına sır başlığını ekliyor ve API bu isteklerde throttle uygulamıyor. Web'in kendisinde hız sınırı yok. Veri önbelleği anahtarı URL'ye bağlı olduğu için her benzersiz sorgu dizesi, sır başlığıyla API'ye yeni bir çağrı üretiyor. `?onizleme=1` de herkes için `cache: "no-store"` açıyor. Sonuçta anonim bir istemcinin API'ye giden trafiğini sınırlayan hiçbir katman kalmıyor ve ağır uçlar (5.000 satır tarayan facet'ler) sınırsız tetiklenebiliyor.
- **Senaryo:** Saldırgan tek bir IP'den saniyede 50 istekle `https://www.rothern.com/urunler?q=<rastgele>` veya `/firma/<slug>?onizleme=1` çağırır. Her istek Vercel'den API'ye `x-rothern-ssr` ile `/public/products` (count + findMany) ve `/public/products/facets` (FACET_SCAN_CAP=5001 satırlık tarama) gönderir. ClientIpThrottlerGuard `shouldSkip=true` döndüğü için hiçbirine 429 verilmez; Supabase CPU ve Render API doyar, sayfalar 500 vermeye başlar. B11-1 öncesinde bu trafik Vercel IP'si başına 600/dk ile sınırlıydı.
- **Düzeltme:** SSR çağrısında gerçek istemci IP'sini ayrı bir başlıkla iletin (API bu başlığa yalnız sır doğrulanınca güvensin) ve throttle tracker'ı bu IP'ye çevirin. Ya da SSR için yüksek ama sonlu ayrı bir kova tanımlayın. Buna ek olarak Vercel Firewall'da /urunler ve ?onizleme=1 için IP başına bir hız kuralı ekleyin.

### M-126 — Arama önerisi ve mega menü sayfa dilini göndermiyor; kategori adları tarayıcı diline göre (desteklenmeyen dilde Türkçe) geliyor

- `apps/web/src/lib/public/suggest-client.ts:27`, `apps/web/src/lib/public/suggest-client.ts:51` · S093, X05, X06
- `fetchSuggest` ve `fetchCategoryMenu` istemci tarafında çıplak `fetch` kullanıyor ve dil başlığı eklemiyor. API `categoryName(row, currentLocale())` ile adları Accept-Language'a göre yerelleştiriyor; tarayıcı başlığı sayfa diliyle uyuşmayabiliyor. Ek olarak `menuCache` modül düzeyinde tutuluyor ve dile göre anahtarlanmıyor: istemci tarafında dil değiştirildiğinde eski dildeki menü kalıyor. Aynı dosyadaki geo-client locale'i açıkça geçiriyor, bu iki çağrı ise geçirmiyor.
- **Senaryo:** İşletim sistemi/tarayıcısı İngilizce olan Türk kullanıcı /tr sayfasında 'Kategoriler' mega menüsünü açar → API 'en' görür → menüde İngilizce UNSPSC adları çıkar. Tarayıcısı Almanca olan ziyaretçi /en'de hem mega menüde hem typeahead'de Türkçe kategori adları görür.
- **Düzeltme:** fetchSuggest ve fetchCategoryMenu'ya `locale` parametresi ekleyip `headers: { "accept-language": locale }` gönderin ve menuCache'i locale anahtarlı bir Map yapın. Çağıranlar (mega-menu.tsx, search-typeahead.tsx) dili useLocale() ile geçirsin.

### M-127 — Web Sentry süzgeci contexts.nextjs.request_path ve query_string alanlarını temizlemiyor: davet/çıkış jetonu sızar

- `apps/web/src/lib/sentry-scrub.ts:38` · S091, X19
- `onRequestError = Sentry.captureRequestError`, Next'in `req.url` değerini (yol ve sorgu dizesi dahil; next/dist/server/base-server.js:455 `path: req.url`) olayın `contexts.nextjs.request_path` alanına koyuyor. `scrubEvent` yalnız `event.request.url` ile breadcrumb url/from/to alanlarını süzüyor. `contexts` alanına, `event.request.query_string` alanına ve fetch breadcrumb'larının `http.query` alanına hiç dokunmuyor. B4-7/B5-7 kapsamında API tarafı düzeltildi, bu yol ise açık kaldı. Bu açık şu an etkin değil, çünkü Sentry hiç başlamıyor (yukarıdaki bulgu). instrumentation dosyası taşındığı anda devreye girer.
- **Senaryo:** `/tr/company/davet/<jeton>` ya da `/tr/talep-davet?ref=<jeton>&l=...` sayfası SSR sırasında hata veriyor (ör. API 5xx). Sentry olayında `contexts.nextjs.request_path = "/tr/company/davet/AbC..."` görünüyor ve jeton Sentry'de düz metin kalıyor. Bu jetonla ekibe katılma veya davet edenle bağlanma yapılabiliyor.
- **Düzeltme:** scrubEvent'e şunlar eklenmeli: `event.contexts.nextjs.request_path` alanı scrubUrl ile süzülsün, `request.query_string` silinsin ya da `scrubUrl('?'+qs)` ile maskelensin, breadcrumb `data['http.query']` alanı da süzülsün. Bu değişiklik instrumentation dosyasının `src/`e taşınmasıyla aynı committe yapılmalı. Web ve admin için birer test eklenmeli.

### M-128 — Talep SEO/OG miktarı tekil birimle yapıştırılıyor ('1500 piece')

- `apps/web/src/lib/seo/entities.ts:579` · S094
- `listingSeo` miktarı `${totalQuantity} ${unitLabelWith(...)}` ile kuruyor; aynı kalıp `og/content.ts:295` `listingOgContent`te de var. CLAUDE.md bu yapıştırmayı açıkça yasaklıyor (EN/RU'da tekil etiket + biçimlenmemiş sayı); aynı veri sayfa gövdesinde `quantity()` hook'uyla doğru basılıyor. Sonuç meta açıklaması, `summary`, JSON-LD ve OG kartına yanlış metin olarak giriyor.
- **Senaryo:** Tek birimli (ADET) kalemleri toplam 1500 olan herkese açık talep `/en/buying-requests/<slug>` açılınca meta açıklaması ve OG kartı "Quantity: 1500 piece" (doğrusu "1,500 pieces"), RU'da "Количество: 1500 пара" basar; ondalıklı toplamda ("12.5") RU/TR ayraç kuralı da bozulur.
- **Düzeltme:** entities.ts:579 ve og/content.ts:90'da yapıştırma yerine `quantityWith(ts, l.itemSummary.totalQuantity, l.itemSummary.unit)` kullanılmalı. JSON-LD `unitText` için tekil etiket aynen kalabilir.

### M-129 — Firma OG kartında EN/RU'da 'NaN employees' basılıyor

- `apps/web/src/lib/seo/og/content.ts:281` · S094
- `companyOgContent`, `p.employeeCount` metnini ("10-49", "250+" gibi bir aralık, bkz. `EMPLOYEE_BUCKETS`) ICU çoğul mesajına `n` olarak veriyor. EN/RU `web.seo.og.employees` = `{n, plural, one {# employee} other {# employees}}`; intl-messageformat 11 çoğul değeri `value - offset` ile sayıya çeviriyor ("10-49" - 0 = NaN) ve `#` yerine `NumberFormat.format(NaN)` yazıyor. CLAUDE.md de biçimlenmiş/metin değerin çoğul mesaja verilmesini yasaklıyor.
- **Senaryo:** Çalışan sayısı "10-49" seçilmiş ve kapak görseli olmayan bir firma (companySeo bu durumda `ogCardPath` ile firmanın kendi kartını og:image yapar) `/en/companies/<slug>` sayfası LinkedIn/WhatsApp'ta paylaşılınca kartta "NaN employees", RU'da "NaN сотрудника" çipi görünür. TR'de ("{n} çalışan") sorun yok.
- **Düzeltme:** `web.seo.og.employees` mesajını üç dilde çoğulsuz düz yer tutucuya çevirin (ör. "Employees: {range}" / "Сотрудников: {range}" / "{range} çalışan") ve content.ts:76'da `{ range: p.employeeCount }` geçin.

### M-130 — Kalem 'istenen teslim tarihi' negatif UTC dilimindeki tarayıcılarda her düzenleme ve kopyalamada bir gün geri kayıyor

- `apps/web/src/lib/tenders/map-detail-to-form.ts:29` · S095
- `map-to-input.ts` tarih girdisini `new Date("YYYY-MM-DD").toISOString()` ile UTC gece yarısı olarak kaydediyor. `toDateInput` ise bu değeri tarayıcının yerel `getDate()` değeriyle geri okuyor. UTC'nin gerisindeki dilimlerde (Amerika) 00:00Z bir önceki güne düşüyor. Form bir gün önceki tarihi gösteriyor ve kaydedince kaydırılmış tarih sunucuya yazılıyor. Kod tabanının geri kalanı ürün saat dilimini (wallClock) kullanıyor, bu fonksiyon kullanmıyor.
- **Senaryo:** Amerika'daki (UTC-5) bir alıcı kalem teslim tarihini 5 Ekim seçip talebi kaydediyor (2026-10-05T00:00Z). Düzenle ya da Kopyala'yı açınca alan 4 Ekim gösteriyor. Kaydedince sunucuya 2026-10-04T00:00Z gidiyor ve tedarikçiler artık 4 Ekim görüyor. Her yeni düzenleme bir gün daha kaydırıyor. AI taslağındaki (map-ai-draft-to-form) tarih de aynı fonksiyondan geçiyor.
- **Düzeltme:** `toDateInput` içinde tarih-only değerlerde yerel alanlar yerine `iso.slice(0,10)` ya da `getUTCFullYear/getUTCMonth/getUTCDate` kullanılmalı. Böylece kayıt tarafındaki UTC gece yarısı ile birebir simetrik olur.

### M-131 — looksLikeProse Kiril/Yunan/Arap vb. alfabeli metni her zaman 'çöp' sayıyor

- `packages/shared/src/helpers/public-text-quality.ts:24` · S053
- Sesli harf kontrolü yalnız Latin/Türkçe sesli harfleri tanıyor (`/[aeıioöuüâîû]/i`). Rusça (RU arayüz dili desteklenen bir dil ve kayıt tüm ülkelere açık), Kazakça, Yunanca, Arapça gibi metinlerde hiçbir sözcük eşleşmediği için `withVowel/words.length` 0 çıkıyor ve metin reddediliyor. Bu helper herkese açık profil, firma dizini kartı, panel içi firma görünümü (company-connections), indeks kapısı (`isProfileIndexable`), dizin tamlık eşiği ve e-posta programındaki `hasProfileText` tarafından kullanılıyor.
- **Senaryo:** Rus bir firma 'Hakkında' alanına 'Компания производит стальные трубы и фитинги для промышленности с 2005 года.' yazar -> looksLikeProse false -> public-profile.service aboutText=null döner, dizin kartında açıklama çıkmaz, başka firmalar panelde tanıtımı görmez, profil hiçbir zaman sitemap'e girmez/noindex kalır, dizin tamlığında 'Hakkında' boş sayılır ve firma 'profil metni yok' hatırlatma e-postaları alır.
- **Düzeltme:** VOWELS sınıfına Kiril sesli harfleri (аеёиоуыэюяіїєөүұә, büyük/küçük) ekleyin ya da `\p{Script=Latin}` içermeyen sözcüklerde sesli harf oranı kontrolünü atlayın. Ardından public-text-quality.spec.ts'e bir Rusça/Kazakça düzyazı örneği ekleyin.

## DÜŞÜK — backlog

| # | Yer | Bulgu | Bulan |
|---|---|---|---|
| L-001 | `.github/workflows/health-prod.yml:58` | Sürüm sonrası sağlık koşumu inen sürümü doğrulamıyor, eski dağıtımı yoklayıp yeşil verebilir | X20 |
| L-002 | `.github/workflows/test-docs-only.yml:22` | Aynı adlı sahte 'Test (api + typecheck)' işi, kod+belge içeren PR'da zorunlu kontrolü gerçek testler bitmeden karşılayabilir | X20 |
| L-003 | `apps/admin/src/app/admin/audit-logs/page.tsx:24` | Denetim Kaydı 'Eylem' filtresi sistemde artık üretilmeyen eski eylemleri listeliyor | S001 |
| L-004 | `apps/admin/src/app/admin/dashboard/page.tsx:31` | Genel Bakış SUPPORT rolüne her açılışta yetki hatası gösteriyor ve 'Firma yok' diyor | S001 |
| L-005 | `apps/admin/src/app/admin/dashboard/page.tsx:80` | 'İnceleme Bekleyen' KPI sayısı ile tıklanınca açılan liste uyuşmuyor | S001 |
| L-006 | `apps/admin/src/app/admin/duyuru/page.tsx:92` | Hata durumunda çift bildirim, biri İngilizce 'Request failed with status code …' | S001 |
| L-007 | `apps/admin/src/app/admin/duyuru/page.tsx:152` | Duyuru ülke segmenti yalnız en kalabalık 10 ülkeyi sunuyor | S001 |
| L-008 | `apps/admin/src/app/admin/email-logs/_components/detail-drawer.tsx:46` | Yeniden gönderim onay durumu başka bir e-posta kaydına taşınıyor | S001 |
| L-009 | `apps/admin/src/app/admin/email-logs/page.tsx:5` | E-posta Kayıtları sekme başlığında 'Rothern Admin' iki kez yazıyor | S001 |
| L-010 | `apps/admin/src/app/admin/firmalar/[id]/_components/company-detail-view.tsx:175` | Hata durumunda çift toast ve İngilizce 'Request failed with status code …' mesajı | S002 |
| L-011 | `apps/admin/src/app/admin/firmalar/[id]/_components/tabs/complaints-tab.tsx:27` | Şikayetler sekmesi yalnız ilk 25 kaydı gösteriyor, sayfalama yok | S002 |
| L-012 | `apps/admin/src/app/admin/firmalar/[id]/_components/tabs/connections-tab.tsx:58` | Bağlantılar / Üyelik geçmişi / Notlar sekmelerinde hata durumu 'boş' olarak gösteriliyor | S002 |
| L-013 | `apps/admin/src/app/admin/firmalar/[id]/_components/tabs/summary-tab.tsx:95` | KVKK silme/anonimleştirme sonrası firma listesi ve KPI önbelleği tazelenmiyor | S002 |
| L-014 | `apps/admin/src/app/admin/firmalar/page.tsx:241` | CSV dışa aktarımında hata yakalanmıyor, yükleniyor durumu yok | S003 |
| L-015 | `apps/admin/src/app/admin/ilanlar/[id]/page.tsx:105` | SUPPORT rolüne ilan kapat/uzat/yeniden aç ve sipariş iptal düğmeleri gösteriliyor, API 403 dönüyor | S004 |
| L-016 | `apps/admin/src/app/admin/ilanlar/[id]/page.tsx:325` | Süre Uzat ve Yeniden Aç tarih seçicilerinin alt sınırı UTC ISO'dan kesiliyor, TR'de 3 saat geride | S004 |
| L-017 | `apps/admin/src/app/admin/siparisler/[id]/page.tsx:604` | Onaylı ödemesi olan siparişte iptal düğmesi ve 'iade gerekebilir' uyarısı gösteriliyor, backend her seferinde reddediyor | S004 |
| L-018 | `apps/admin/src/app/admin/sistem/page.tsx:167` | SALES'e 'Engeli Kaldır', SUPPORT'a 'Kurları Şimdi Yenile' gösteriliyor, API 403 dönüyor | S004 |
| L-019 | `apps/admin/src/app/admin/urunler/[id]/page.tsx:80` | SALES rolüne ürün onay/red/toplu onay düğmeleri gösteriliyor, API 403 dönüyor | S004 |
| L-020 | `apps/admin/src/app/admin/urunler/[id]/page.tsx:88` | Admin UI, API'nin yasakladığı aksiyonları rol kontrolü olmadan gösteriyor | X18 |
| L-021 | `apps/admin/src/app/admin/uyelik-raporu/page.tsx:91` | Hazır aralıklar 'bugün'ü UTC tarihiyle hesaplıyor; TR gece 00:00-03:00 arası aralık bozuluyor | S005 |
| L-022 | `apps/admin/src/app/api/client-error/route.ts:31` | Admin /api/client-error tavanı sahte cf-connecting-ip ile aşılıyor, toplam tavan da yok (B5-9 yalnız web'de düzeltilmiş) | S001, X03, X19 |
| L-023 | `apps/admin/src/app/globals.css:3` | Google Fonts @import admin CSP tarafından engelleniyor, Inter fontu prod'da hiç yüklenmiyor | S001 |
| L-024 | `apps/admin/src/components/layout/admin-shell.tsx:131` | SUPPORT rolü E-posta Kayıtları'nı görüyor, API 403 veriyor ve 5 saniyede bir yetki hatası bildirimi çıkıyor | S001 |
| L-025 | `apps/admin/src/components/list/pagination.tsx:45` | Sayfa, toplam sayfa sayısını aşınca "25 kayıt içinden 26-25 arası" gibi tutarsız bir aralık çıkıyor | S006 |
| L-026 | `apps/admin/src/components/list/search-input.tsx:30` | URL'e bağlı aramada gecikmeli gelen value, kullanıcının yeni yazdığı karakterleri siliyor | S006 |
| L-027 | `apps/admin/src/hooks/use-admin-companies.ts:583` | Şikayet çözümünde 'askıya al' seçilince firma detayı önbelleği tazelenmiyor | S007 |
| L-028 | `apps/admin/src/lib/email-logs/status.ts:114` | E-posta Kayıtları 'Şablon' filtresi yalnız artık var olmayan demo şablonlarını sunuyor | S001 |
| L-029 | `apps/admin/src/lib/status-labels.ts:18` | DISPUTED sipariş ve AWARDED_PARTIAL teklif durumları için etiket yok, ekranda ham enum görünüyor | S004, S007 |
| L-030 | `apps/api/src/common/company/company-directory.ts:130` | Anonim firma dizini aramasında Rothern ID eşleşiyor: üyeye ayrılmış kimlik → firma eşlemesi dışarıdan çıkarılabiliyor | S040, X16 |
| L-031 | `apps/api/src/common/company/company-slug.ts:24` | Firma slug'ı 'sitemap'/'directory'/'summary' olursa herkese açık profil rotası gölgeleniyor | X01 |
| L-032 | `apps/api/src/common/company/product-index.ts:350` | Ürün dizini sıralamasında benzersiz eşitlik bozucu yok, sayfalamada ürün tekrar ediyor ya da kayboluyor | S019 |
| L-033 | `apps/api/src/common/company/related-products.ts:29` | İlişkili ürünler ucu firma profil kapısını eziyor (company anahtarı üzerine yazılıyor) | S019, X16 |
| L-034 | `apps/api/src/common/error-messages.ts:21` | IsInt / Matches / IsPositive mesajları çevrilmiyor, ham İngilizce gösteriliyor | S017 |
| L-035 | `apps/api/src/main.ts:238` | CORS Content-Disposition'ı expose etmiyor; indirilen dosyalar hep Türkçe sabit adla iniyor | S088, S089, S090 |
| L-036 | `apps/api/src/modules/admin-audit/admin-audit.controller.ts:21` | Sayısal olmayan veya ondalık page/pageSize değerleri 500 hatasına yol açıyor | S008 |
| L-037 | `apps/api/src/modules/admin-audit/dto/list-audit.dto.ts:5` | Denetim kaydı görüntüleyicisinde 'company' aktör filtresi yok (DTO reddediyor, UI eski değerleri sunuyor) | S008, X18 |
| L-038 | `apps/api/src/modules/admin-auth/admin-staff.service.ts:112` | Son SUPER_ADMIN koruması READ COMMITTED transaction'da serileşmiyor | S008, X14 |
| L-039 | `apps/api/src/modules/admin-auth/admin-staff.service.ts:161` | Personel pasifleştirme tokenVersion artırmıyor; yeniden aktifleştirmede eski oturumlar diriliyor | S008 |
| L-040 | `apps/api/src/modules/admin-companies/admin-companies.controller.ts:521` | Admin şikayet listesi ve denetim izi sayfalama/durum parametreleri doğrulanmıyor; bozuk değer 500 veriyor | S009, X01 |
| L-041 | `apps/api/src/modules/admin-companies/admin-companies.service.ts:545` | KYC kuyruk yaşı (oldestPendingSince) yeniden gönderimlerde çok eski çıkıyor | S009 |
| L-042 | `apps/api/src/modules/admin-companies/admin-companies.service.ts:1004` | Başka firmada kayıtlı vergi numarası girilince 409 yerine 500 dönüyor | S009 |
| L-043 | `apps/api/src/modules/admin-companies/admin-companies.service.ts:1742` | Geçersiz tarih/durum/sayfa parametreleri admin uçlarında 500 döndürüyor | S010 |
| L-044 | `apps/api/src/modules/admin-companies/admin-companies.service.ts:1819` | Askı gerekçesi varsayılanı sabit Türkçe; EN/RU firmaya Türkçe gerekçe gidiyor | S010, X18 |
| L-045 | `apps/api/src/modules/admin-companies/admin-inspection.service.ts:53` | Firma ilan/sipariş inceleme listeleri 100 kayıtta sessizce kesiliyor | X18 |
| L-046 | `apps/api/src/modules/admin-companies/admin-inspection.service.ts:196` | Moderasyon kapatma/uzatma/yeniden açma yalnız ilan sahibine bildiriliyor; teklif veren/davetli tedarikçiler habersiz | S011, X18 |
| L-047 | `apps/api/src/modules/admin-companies/admin-inspection.service.ts:227` | Admin extend/reopen, sahip tarafındaki kapanış guard'larını atlıyor (CAS, üst sınır, bidsOpenAt) | S011 |
| L-048 | `apps/api/src/modules/admin-companies/admin-products.service.ts:252` | Admin ürün onayı paket ürün tavanını denetlemiyor (düşüş sonrası tavan aşımı) | X11 |
| L-049 | `apps/api/src/modules/admin-company-users/../admin-companies/admin-company-users.service.ts:207` | Admin üye ekleme ve yeniden aktifleştirme koltuk/paket kapısını atlıyor | S010 |
| L-050 | `apps/api/src/modules/admin-email-logs.service.ts:57` | Admin yeniden gönderimi context ve dil bilgisini düşürüyor: çıkış kapısı ve List-Unsubscribe atlanıyor, kabuk Türkçe | S038 |
| L-051 | `apps/api/src/modules/admin-growth/admin-growth.service.ts:113` | Büyüme hunisinde 'teklif veren' sayısı 'kayıt olan' sayısını aşabiliyor | S012 |
| L-052 | `apps/api/src/modules/admin-system/admin-system.controller.ts:236` | Suppression aklama e-postayı küçük harfe çeviriyor, tetikleyici kayıtlarla eşleşmiyor | S012 |
| L-053 | `apps/api/src/modules/ai/ai-budget.service.ts:222` | Premium istekte bütçe reddi yanlış sebeple bildiriliyor | S013 |
| L-054 | `apps/api/src/modules/ai/assistant/assistant-actions.service.ts:620` | Asistanla yayında kalem hedef fiyatı sessizce düşüyor (yanlış alan adı) | X21 |
| L-055 | `apps/api/src/modules/ai/assistant/assistant.prompts.ts:33` | Sistem prompt'u teklif, kazandırma ve sipariş araçlarının olmadığını söylüyor | S014 |
| L-056 | `apps/api/src/modules/ai/assistant/assistant.service.ts:105` | İlk mesaj başarısız olursa sohbet listesinde boş, hayalet oturum kalıyor | S014 |
| L-057 | `apps/api/src/modules/ai/assistant/assistant.service.ts:152` | Asistan turu rezervasyonu gerçek maliyetin altında: tavanlar aşılabiliyor | X21 |
| L-058 | `apps/api/src/modules/ai/profile-enrich/profile-enrich.service.ts:117` | Ücretsiz pakette 'firma başına bir kez' profil AI'ı eşzamanlı isteklerle birden çok kez çalışıyor | X23 |
| L-059 | `apps/api/src/modules/ai/seo-enrich/seo-enrich.service.ts:66` | AI açıklama güçlendirme kullanıcının mevcut anahtar kelimelerini 10'a kırpıyor | S015 |
| L-060 | `apps/api/src/modules/ai/supplier-discovery/discovery-runs.service.ts:311` | İkinci keşif turu taraması sırasız `take: 200`: 200'den fazla açık talepte bazıları hiç ikinci tur almıyor | S015, X21 |
| L-061 | `apps/api/src/modules/ai/supplier-discovery/supplier-discovery.service.ts:729` | Platform keşfi puanlamadan önce en yeni 60 firmaya kırpıyor; vitrinde kalemi satan firma düşebiliyor | S015 |
| L-062 | `apps/api/src/modules/ai/tender-extract/ai-extract-keys.ts:15` | Uzun CSV dosya adında anahtar 80 karaktere kırpılınca '.csv' uzantısı düşüyor ve dosya 'desteklenmeyen tür' ile reddediliyor | S016 |
| L-063 | `apps/api/src/modules/audit/audit.service.ts:143` | Aktivite logu modül filtresi alt-tür eylemlerini dışarıda bırakıyor | S017 |
| L-064 | `apps/api/src/modules/company-addresses/company-addresses.service.ts:129` | Yer-kilidi karşılaştırması cityId ile atlatılabiliyor | S021 |
| L-065 | `apps/api/src/modules/company-addresses/company-addresses.service.ts:264` | Adres kullanım kilidi moderasyonla kapatılmış (CLOSED) ilanı kapsamıyor | S021 |
| L-066 | `apps/api/src/modules/company-approvals/company-approvals.service.ts:254` | Onay sonucu e-postası pasif ya da silinmiş başlatana da gidiyor (INV-SD-1) | S022 |
| L-067 | `apps/api/src/modules/company-approvals/company-approvals.service.ts:600` | Akış çoğaltma adına sabit Türkçe '— Kopya' soneki yazılıyor | S022 |
| L-068 | `apps/api/src/modules/company-auth/schedulers/membership.scheduler.ts:101` | Üyelik düşürme cron'u claim anında membershipEndAt'i kontrol etmiyor; o anda uzatılan firma düşürülebiliyor | S023, X14, X23 |
| L-069 | `apps/api/src/modules/company-auth/services/company-auth.service.ts:418` | E-posta doğrulama kodunda 5 deneme sınırı paralel isteklerle aşılabiliyor | X14 |
| L-070 | `apps/api/src/modules/company-auth/services/company-auth.service.ts:1393` | E-posta 2FA kod gönderimi başarısız olsa da `sent: true` dönüyor | S023, X17 |
| L-071 | `apps/api/src/modules/company-auth/services/company-auth.service.ts:1539` | PATCH me'de null alan değeri 500 hatası üretiyor | S023 |
| L-072 | `apps/api/src/modules/company-connections/services/company-connections.service.ts:319` | 7 günlük tekrar freni dış talep davetlerini hiç görmüyor (contextId uyuşmazlığı) | S025 |
| L-073 | `apps/api/src/modules/company-connections/services/company-connections.service.ts:473` | Talebe dış e-posta daveti SILVER ile açılıyor, iç davet ise GOLD istiyor | X23 |
| L-074 | `apps/api/src/modules/company-connections/services/company-connections.service.ts:730` | Davet önizlemesi askıya alınmış/bloklu firmanın talebini göstermeye devam ediyor | S025 |
| L-075 | `apps/api/src/modules/company-connections/services/company-connections.service.ts:1164` | Bağlantılar listesi tüm bağlantıların tüm yayındaki ürünlerini sınırsız çekiyor | S025 |
| L-076 | `apps/api/src/modules/company-dashboard/company-dashboard.controller.ts:47` | Pano dönem sınırları (özel aralık, bu ay/yıl) sunucunun UTC saatinde hesaplanıyor | X13 |
| L-077 | `apps/api/src/modules/company-dashboard/company-dashboard.service.ts:220` | satis/stats geliri her sipariş için sıralı kur sorgusu yapıyor ve siparişler sınırsız çekiliyor | S026 |
| L-078 | `apps/api/src/modules/company-dashboard/company-dashboard.service.ts:266` | satis/aktivite davetliye TASLAK ve embargolu talebin başlığını/numarasını sızdırıyor | S026 |
| L-079 | `apps/api/src/modules/company-docs/company-docs.service.ts:227` | Belge türü kontrolü `in` ile yapıldığı için 'constructor'/'toString' geçip 500 üretiyor | S026 |
| L-080 | `apps/api/src/modules/company-items/company-items.controller.ts:123` | Ürünün sabit/kademeli fiyatı 0 olarak kaydedilip herkese açık sayfada '0 ₺' ve JSON-LD Offer price 0 yayınlanıyor | X12 |
| L-081 | `apps/api/src/modules/company-items/company-items.controller.ts:131` | Ürün moq alanında üst sınır yok, büyük değer Decimal(18,3) taşmasıyla 500 veriyor | X07 |
| L-082 | `apps/api/src/modules/company-items/company-items.service.ts:275` | Katalog araması katlanmış metin yerine ham ILIKE kullanıyor; Türkçe I/ı ve İ/i eşleşmiyor | S027 |
| L-083 | `apps/api/src/modules/company-items/company-items.service.ts:310` | Paket düşüşünde kırpılan ürünler Taslak sekmesinde listeleniyor ama Taslak sayacına girmiyor | S027, X23 |
| L-084 | `apps/api/src/modules/company-items/company-items.service.ts:790` | Engelleyen firmanın ürün ziyaretleri engellenen firmanın 'Ziyaret Edenler' listesinde kimlikli görünüyor | X11 |
| L-085 | `apps/api/src/modules/company-listing-documents/company-listing-documents.controller.ts:38` | İlan belgesi upload-url ve register gövdeleri DTO sınıfı olmadan geliyor; ValidationPipe devre dışı, tip hataları 500'e dönüşüyor | S027, X01, X15 |
| L-086 | `apps/api/src/modules/company-listing-documents/company-listing-documents.service.ts:192` | Belge görünürlüğünde hasBid istisnası eksik; teklif veren ücretsiz firma talebi görüyor ama dosyaları göremiyor | S027 |
| L-087 | `apps/api/src/modules/company-listings/dto/create-listing.dto.ts:542` | decimalPlaces 3-4 kabul ediliyor ama teklif DTO'su ve DB 2 ondalık saklıyor | S028 |
| L-088 | `apps/api/src/modules/company-listings/import/bid-matching.ts:330` | Eşleşmeyen belge satırlarının fiyatı yuvarlanmadan ve doğrulanmadan dönüyor | S028 |
| L-089 | `apps/api/src/modules/company-listings/import/listing-item-import.service.ts:227` | CSV UTF-8 varsayılıyor; Türkçe Excel'in standart CSV'si (Windows-1254) bozuluyor | S029 |
| L-090 | `apps/api/src/modules/company-listings/schedulers/listing.scheduler.ts:82` | closeExpired sahiplenmesi closesAt'i yeniden doğrulamıyor; az önce uzatılan ilan kapanabiliyor | S029, X14 |
| L-091 | `apps/api/src/modules/company-listings/services/company-listings.service.ts:372` | E-posta hata günlüklerinde alıcı adresi maskesiz (B5-17 düzeltmesi eksik kalmış) | X09, X19 |
| L-092 | `apps/api/src/modules/company-listings/services/company-listings.service.ts:1080` | Kesinti sonrası açılış duyurusu, kapanış saati geçmiş ilana davet e-postası atabiliyor | X08 |
| L-093 | `apps/api/src/modules/company-listings/services/company-listings.service.ts:1697` | Kalem görsellerinde (images) harici/data: URL doğrulaması yok, herkese açık pazar yeri kapağına düşüyor | S030 |
| L-094 | `apps/api/src/modules/company-listings/services/company-listings.service.ts:2123` | publishListing tarih kurallarını eksik uyguluyor: 2 yıl tavanı ve açılış<kapanış atlanabiliyor | S030 |
| L-095 | `apps/api/src/modules/company-listings/services/company-listings.service.ts:3291` | Sahip detayı ETag'i dili içermiyor, dil değişince adres başlığı eski dilde kalıyor | S031 |
| L-096 | `apps/api/src/modules/company-listings/services/company-listings.service.ts:4439` | Muadil beyanında marka veya MPN zorunluluğu serviste uygulanmıyor | S031 |
| L-097 | `apps/api/src/modules/company-listings/services/company-listings.service.ts:4629` | Pazarlıkta 'öncekinden kesin düşük' kıyası yuvarlanmamış ara toplamla yapılıyor | X12 |
| L-098 | `apps/api/src/modules/company-listings/services/company-listings.service.ts:4659` | placeBid: tur başına tek gönderim ve monotonluk kontrolleri kilidin dışında, eşzamanlı istekte ikisi de geçiyor | S031 |
| L-099 | `apps/api/src/modules/company-listings/services/company-listings.service.ts:5160` | Açık eksiltmede kazandırma, eşzamanlı yeniden teklifte bayat tutarla sipariş yazıyor | X14 |
| L-100 | `apps/api/src/modules/company-listings/services/company-listings.service.ts:6129` | Kalem bazlı kazandırmada sipariş realtime sinyali kazanan tedarikçiye gitmiyor | S032 |
| L-101 | `apps/api/src/modules/company-listings/services/company-listings.service.ts:6671` | Taslak teklif canlandırması teklif süresi bittikten sonra ve açılıştan önce de çalışıyor (geç teklif) | S033 |
| L-102 | `apps/api/src/modules/company-listings/services/company-listings.service.ts:6875` | AI üye davetinde İngiliz usulü 'kapanışa 2 dk kala davet yok' koruması atlanıyor | S033 |
| L-103 | `apps/api/src/modules/company-listings/services/company-listings.service.ts:7531` | Embargo süren talepte iptal ve kapanış değişikliği bildirimi, talebi göremeyen davetlilere gidiyor | S033 |
| L-104 | `apps/api/src/modules/company-orders/services/company-orders.service.ts:392` | Sipariş reddi commit edildikten sonra kazandırmayı geri alma başarısız olursa çıkmaz | S034 |
| L-105 | `apps/api/src/modules/company-orders/services/company-orders.service.ts:473` | Sipariş reddi sonrası geri alma listingItem.awardedQuantity'yi sıfırlamıyor → rapor yanlış | X11 |
| L-106 | `apps/api/src/modules/company-orders/services/company-orders.service.ts:1416` | Cursor + skip:1, damgalanmış son satırda bir sonraki adayı atlıyor | S034 |
| L-107 | `apps/api/src/modules/company-orders/services/company-orders.service.ts:1481` | Vade hatırlatması hata telafisi ölü kod; bildirim hatasında hatırlatma kalıcı kayboluyor | S034 |
| L-108 | `apps/api/src/modules/company-orders/services/company-orders.service.ts:2070` | Sipariş listesi/detayında karşı firmanın talep başlığı ve kalem adları çevrilmiyor | S034 |
| L-109 | `apps/api/src/modules/company-profile/company-profile.service.ts:210` | Firma adı yalnız boşluktan oluşunca boş string olarak kaydediliyor | S035 |
| L-110 | `apps/api/src/modules/company-reports/company-reports.controller.ts:117` | Rapor gövdeleri interface tipinde, ValidationPipe devreye girmiyor ve hatalı giriş 500 veriyor | S035 |
| L-111 | `apps/api/src/modules/company-reports/company-reports.service.ts:752` | Teklif karşılaştırmada hedefe göre fark kısmi referans toplamıyla tam teklif toplamını kıyaslıyor | X12 |
| L-112 | `apps/api/src/modules/company-supplier-templates/company-supplier-templates.service.ts:282` | Gizli tedarikçi şablonu, oluşturmayan kullanıcı tarafından güncellenip silinebiliyor | S036 |
| L-113 | `apps/api/src/modules/company-views/company-views.service.ts:36` | Görüntülenme günleri UTC ile hesaplanıyor (tekilleştirme ve günlük grafik İstanbul gününe uymuyor) | S037 |
| L-114 | `apps/api/src/modules/company-views/company-views.service.ts:323` | İş Analizi medyan yanıt süresi 'tek kaynak' dizin ölçüsünden farklı pencereyle hesaplanıyor | S037 |
| L-115 | `apps/api/src/modules/content-translation/content-translation.controller.ts:32` | AI maliyeti doğuran çeviri backfill uçları audit'e yazılmıyor | X18 |
| L-116 | `apps/api/src/modules/content-translation/content-translation.scheduler.ts:26` | contentTranslation.sweep cron kaydına hiç register edilmiyor — Sistem Sağlığı'nda görünmüyor | S037 |
| L-117 | `apps/api/src/modules/content-translation/content-translation.service.ts:537` | İçerik çevirisi platform günlük USD tavanı kuyrukta bekleyen işlerde yeniden denetlenmiyor | X14 |
| L-118 | `apps/api/src/modules/content-translation/content-translation.service.ts:586` | Çeviri modeli fiyat tablosunda yoksa günlük USD freni devre dışı kalıyor | X21 |
| L-119 | `apps/api/src/modules/email-programs/email-programs.service.ts:258` | Suppress/opt-out nedeniyle FAILED dönen lifecycle ve haftalık e-postalar pencere boyunca her 15 dakikada yeniden deneniyor | S038 |
| L-120 | `apps/api/src/modules/password-reset/password-reset.service.ts:74` | Parola sıfırlama jetonu, parola güncellenmeden ÖNCE tüketiliyor; Supabase hatası jetonu yakıyor | S039, X17 |
| L-121 | `apps/api/src/modules/public-inquiry/public-inquiry.service.ts:195` | Kayıtlı bilgi talebi (inquiry) firma engellemesini atlıyor | X11 |
| L-122 | `apps/api/src/modules/public-inquiry/public-inquiry.service.ts:512` | Misafire giden yanıt e-postasındaki kayıt bağlantısının ?email= parametresi kayıt formunda kullanılmıyor | X22 |
| L-123 | `apps/api/src/modules/public-inquiry/public-inquiry.service.ts:646` | Eşzamanlı doğrulamada satıcıya çift bildirim gidiyor | S039 |
| L-124 | `apps/api/src/modules/public-inquiry/public-inquiry.service.ts:687` | notifySeller korumasız fire-and-forget çağrılıyor: DB hatası unhandledRejection'a düşüyor | X19 |
| L-125 | `apps/api/src/modules/public-marketplace/public-marketplace.service.ts:676` | Herkese açık /public/stats son 24 saatteki teklif sayısını eşiksiz döndürüyor | X16 |
| L-126 | `apps/api/src/modules/realtime/realtime.gateway.ts:67` | WS origin allowlist'i websocket transport'unda uygulanmıyor (same-site origin'lerden cross-site WebSocket hijacking) | X15 |
| L-127 | `apps/api/src/modules/realtime/realtime.gateway.ts:148` | exp-timer ile sunucu tarafından kesilen soket istemcide yeniden bağlanmıyor; kayan oturumla tazelenen kullanıcıda realtime sessizce ölüyor | X15 |
| L-128 | `apps/api/src/modules/realtime/realtime.gateway.ts:191` | Async handshake bitmeden gelen 'subscribe' sessizce düşüyor; detay sayfasının oda aboneliği kayboluyor | X15 |
| L-129 | `apps/api/src/modules/resend-webhook/services/resend-event.service.ts:65` | email_id taşımayan Resend olayları (contact.*/domain.*) Prisma hatasıyla 500'e düşüyor ve sürekli yeniden deneniyor | S041 |
| L-130 | `apps/api/src/modules/seo-index/seo-index.service.ts:218` | IndexNow'a embargolu, onay bekleyen ve indekse kapalı talep adresleri (başlık slug'ıyla) bildiriliyor | S041 |
| L-131 | `apps/api/src/modules/storage/storage.service.ts:284` | İndirme dosya adı Content-Disposition'da yüzde-kodlanmış düz filename olarak gidiyor; Türkçe/Kiril adlar bozuk görünüyor | X15 |
| L-132 | `apps/web/Dockerfile:28` | Web ve admin Dockerfile'ları @rothern/i18n manifestini kopyalamıyor, Docker derlemesi kuruluma bile gelmeden düşüyor | S091, X20 |
| L-133 | `apps/web/src/app/[locale]/company/(authed)/ayarlar/_components/address-book-section.tsx:281` | TR'den yabancı ülkeye geçince gizlenen İlçe değeri adreste kalıyor | S055 |
| L-134 | `apps/web/src/app/[locale]/company/(authed)/ayarlar/_components/company-users-section.tsx:719` | Kurucu olmayan yönetici, Kurucunun işlem tiklerini düzenleyebilir görünüyor ama API reddediyor | S055 |
| L-135 | `apps/web/src/app/[locale]/company/(authed)/ayarlar/aktivite/page.tsx:272` | Aktivite logunda ham makine kodları kullanıcıya gösteriliyor | S056 |
| L-136 | `apps/web/src/app/[locale]/company/(authed)/firma/[id]/page.tsx:103` | Engelleme sonrası profil ve eylemler ekranda kalmaya devam ediyor | S057 |
| L-137 | `apps/web/src/app/[locale]/company/(authed)/firma/[id]/page.tsx:151` | Panel firma profilinde ücretsiz firmaya 'Bağlantı isteği gönder' düğmesi sunuluyor, API 403 dönüyor | X23 |
| L-138 | `apps/web/src/app/[locale]/company/(authed)/firma/[id]/page.tsx:335` | Kendi firma profilinde, kendi açık talebinde 'Teklif ver' düğmesi gösteriliyor | S057 |
| L-139 | `apps/web/src/app/[locale]/company/(authed)/ilan/[id]/_components/auction-live-card.tsx:114` | Pazarlık kapandıktan sonra 'Tur Hakkın: 1 teklif — Öncekinden düşük olmalı' gösteriliyor | S058 |
| L-140 | `apps/web/src/app/[locale]/company/(authed)/ilan/[id]/_components/my-bid-status-panel.tsx:112` | 'Geçerliliği Uzat' düğmesi API kapısının aynası değil (CLOSED durumu ve rol etiketi) | S058 |
| L-141 | `apps/web/src/app/[locale]/company/(authed)/ilan/[id]/_components/my-bid-status-panel.tsx:410` | Teklifçiye (satış tarafına) 'Satın Alma Talebi' deniyor | S058 |
| L-142 | `apps/web/src/app/[locale]/company/(authed)/ilan/[id]/_components/my-bid-status-panel.tsx:464` | Değerlendirme aşamasında elenen teklife 'talep sonuçlandı' deniyor, eleme gerekçesi gizleniyor | S058 |
| L-143 | `apps/web/src/app/[locale]/company/(authed)/ilan/[id]/page.tsx:1153` | Karşılaştırma tablosu elenmiş (LOST) teklifin fiyatını en iyi fiyat diye vurguluyor | S059 |
| L-144 | `apps/web/src/app/[locale]/company/(authed)/ilan/[id]/page.tsx:1493` | Kazandır düğmeleri buy:award izni olmayan kullanıcıya da gösteriliyor | S059 |
| L-145 | `apps/web/src/app/[locale]/company/(authed)/ilan/[id]/page.tsx:2206` | Kapalı zarf bandındaki "Nasıl çalışır?" bağlantısı EN/RU kullanıcıyı Türkçe sayfaya götürüyor | S059 |
| L-146 | `apps/web/src/app/[locale]/company/(authed)/ilan/[id]/teklif-ver/page.tsx:144` | Evet/Hayır teknik soru cevapları Türkçe saklanıp alıcıya çevrilmeden gösteriliyor | X06 |
| L-147 | `apps/web/src/app/[locale]/company/(authed)/ilan/[id]/teklif-ver/page.tsx:532` | Tedarikçinin teklif formunda 'Satın Alma Talebi' ifadesi kullanılıyor | S060 |
| L-148 | `apps/web/src/app/[locale]/company/(authed)/onaylar/page.tsx:370` | approval:act'siz yöneticide varsayılan "Sıra sizde" sekmesi yanıltıcı hata gösteriyor | S061 |
| L-149 | `apps/web/src/app/[locale]/company/(authed)/onaylar/page.tsx:452` | ?tab=flows yetkisiz kullanıcıda boş sayfa açıyor | S061 |
| L-150 | `apps/web/src/app/[locale]/company/(authed)/onaylar/page.tsx:493` | Gold olmayan firmada 'Onay akışlarını düzenle' ve 'Yeni akış' sihirbazı sunuluyor, kayıtta 403 dönüyor | X23 |
| L-151 | `apps/web/src/app/[locale]/company/(authed)/satinalma/urunler/[firmaSlug]/[urunSlug]/page.tsx:102` | Satıcı web sitesi safeExternalUrl'den geçmeden href'e basılıyor | S061 |
| L-152 | `apps/web/src/app/[locale]/company/(authed)/satinalma/urunler/[firmaSlug]/[urunSlug]/page.tsx:121` | Panel ürün detayında 'Bilgi iste' izin kontrolü olmadan gösteriliyor; buy:inquiry:send'siz kullanıcı 403 alıyor | X22 |
| L-153 | `apps/web/src/app/[locale]/company/(authed)/siparis/[id]/_components/order-print.ts:97` | Sipariş çıktısı ve teklif özetinde tutarlar 2 haneye sabitlenmiyor (satır toplamı 3 hane, float) | X12 |
| L-154 | `apps/web/src/app/[locale]/company/(authed)/siparis/[id]/_components/order-print.ts:394` | Yazdırma/PDF çıktısında para tutarları 2 ondalığa sabitlenmiyor | S062 |
| L-155 | `apps/web/src/app/[locale]/company/(authed)/siparis/[id]/_components/order-timeline.tsx:268` | Sipariş geçmişi kronolojik değil: iptal talebi/ihtilaf olayları tamamlanmanın ardından listeleniyor | S062 |
| L-156 | `apps/web/src/app/[locale]/company/kayit/_components/signup-client.tsx:61` | `/company/kayit?email=` bağlantılarındaki e-posta kayıt formuna hiç aktarılmıyor | X10 |
| L-157 | `apps/web/src/app/[locale]/company/kayit/_components/signup-client.tsx:469` | 'E-posta adresini değiştir' yetim, doğrulanmamış hesap bırakıyor ve gerçek adres sahibinin kaydını engelliyor | S062 |
| L-158 | `apps/web/src/app/[locale]/company/sifremi-unuttum/_components/forgot-password-client.tsx:27` | Şifremi unuttum: 429/400 hataları yutuluyor, e-posta gitmediği hâlde 'gönderildi' deniyor | S063 |
| L-159 | `apps/web/src/app/[locale]/firma/[slug]/page.tsx:149` | Firma sayfasındaki 'Bağlan' CTA'sı düz <a> kullandığı için EN/RU'da Türkçe girişe gidiyor | X10 |
| L-160 | `apps/web/src/app/[locale]/sozlesmeler/mesafeli-satis/page.tsx:16` | Mesafeli satış sayfasının meta başlığı ve açıklaması Türkçeye sabitlenmiş | S096 |
| L-161 | `apps/web/src/app/[locale]/sozlesmeler/mesafeli-satis/page.tsx:29` | Mesafeli Satış Sözleşmesi'nde güncelleme tarihi ISO değil, ekranda "—" görünüyor | S096 |
| L-162 | `apps/web/src/app/[locale]/talep-onayla/page.tsx:59` | Talep onay sayfasının sunucu çağrısı dil başlığı göndermiyor; EN/RU kullanıcıya Türkçe API hata metni gösteriliyor | S096, X05, X06 |
| L-163 | `apps/web/src/app/[locale]/talep-onayla/page.tsx:122` | Kayıt bağlantısındaki ?email= parametresini kayıt sayfası okumuyor, e-posta alanı boş geliyor | S096 |
| L-164 | `apps/web/src/app/[locale]/talep/[slug]/page.tsx:50` | İkincil "benzer talepler" bloğu kritik çağrıyla çekiliyor; kesintide talep sayfası tümden düşüyor | S096 |
| L-165 | `apps/web/src/components/bids/bid-import-dialog.tsx:88` | Teklif Excel içe aktarmada istemci boyut kapısı yok: 3,75–5 MB dosya body-parser'da 413 alıyor | X05 |
| L-166 | `apps/web/src/components/bids/bid-import-dialog.tsx:342` | İçe aktarma önizlemesinde miktar ve birim yapıştırılıyor: EN/RU arayüzde Türkçe birim adı görünüyor | S063 |
| L-167 | `apps/web/src/components/categories/category-selector-modal.tsx:247` | Yeni seçilen kategori, yüklenirken "(silinmiş kategori)" olarak görünüyor | S065 |
| L-168 | `apps/web/src/components/categories/company-category-picker.tsx:174` | Sektör tavanı aşılınca modal kapanmış olur ve kullanıcının tüm taslak seçimi kaybolur | S065 |
| L-169 | `apps/web/src/components/company-shell/assistant/assistant-panel.tsx:234` | Geçmişten ikinci kez açılan sohbet eski önbellekle ve son mesajlar eksik görünüyor | S071 |
| L-170 | `apps/web/src/components/company-shell/assistant/assistant-panel.tsx:295` | Yanıt beklerken 'Yeni sohbet' ya da geçmiş seçimi yapılırsa yanıt yanlış sohbete düşüyor | S071 |
| L-171 | `apps/web/src/components/company-shell/assistant/assistant-panel.tsx:350` | Onay kartındaki hata (ör. zaman aşımı) 'İptal edildi' olarak gösteriliyor | S071 |
| L-172 | `apps/web/src/components/company-shell/assistant/assistant-panel.tsx:523` | Sohbet silme hatası yakalanmıyor (unhandled rejection) ve UI önden temizleniyor | S071 |
| L-173 | `apps/web/src/components/company-shell/portal-switch.tsx:208` | Kilitli portal açıklamasında iki cümle boşluksuz birleşiyor | S071 |
| L-174 | `apps/web/src/components/company/catalog-items-view.tsx:111` | Katalog listesi hata ve yükleme durumunda "Katalog henüz boş" gösteriyor | S066 |
| L-175 | `apps/web/src/components/company/company-action-center.tsx:40` | Bekleyen işler gün hesabı tarayıcı saat dilimiyle yapılıyor (İstanbul kuralı ihlali) | S066 |
| L-176 | `apps/web/src/components/company/company-logo.tsx:40` | SSR'lı sayfada kırık logo yedeğe düşmüyor (onError hidrasyondan önce ateşleniyor) | S066 |
| L-177 | `apps/web/src/components/company/company-overview.tsx:195` | "Gelen teklifler" KPI'ı sayılmayan listeye götürüyor | S066 |
| L-178 | `apps/web/src/components/company/insights-view.tsx:103` | İlk yanıt süresi ondalığı TR/RU'da nokta ile basılıyor ("2.5 sa") | S067 |
| L-179 | `apps/web/src/components/company/market/market-list-layout.tsx:75` | "Sayfa başına" seçici yalnız birden çok sayfa varken çiziliyor, büyük değer seçilince geri alınamıyor | S067 |
| L-180 | `apps/web/src/components/company/market/panel-company-index.tsx:122` | Birden çok kategori seçiliyken Ürünler sekme rozeti yanlış sayı gösteriyor, bağlantı başka listeye gidiyor | S067 |
| L-181 | `apps/web/src/components/company/my-bids-list.tsx:278` | `?status=WON` bağlantısı Tekliflerim'de yok sayılıyor, "Kazanılan" KPI filtresiz listeye gidiyor | S067 |
| L-182 | `apps/web/src/components/company/my-profile-view.tsx:19` | Profil sorgusu hata verince sayfa sonsuza kadar iskelette kalıyor | S067 |
| L-183 | `apps/web/src/components/company/orders-list.tsx:397` | Tutar sıralaması para birimini yok sayıyor | S068 |
| L-184 | `apps/web/src/components/company/profile-editor.tsx:157` | Kuruluş yılı silinemiyor; 'Profil kaydedildi' sonrası eski yıl geri geliyor | S069 |
| L-185 | `apps/web/src/components/company/profile-editor.tsx:1149` | Profilim 'Ürünlerim' kartı ilk 50 kullanım-sıralı kalemden süzüyor; sayı ile liste çelişebilir | S069 |
| L-186 | `apps/web/src/components/company/profile-editor.tsx:1192` | Sınıflandırma özeti türetilmiş ata kategorileri ayrı çip olarak ve sayıya katarak gösteriyor | S069 |
| L-187 | `apps/web/src/components/company/reports/bid-comparison-view.tsx:43` | Karşılaştırma raporunda para sembolü her dilde sayının sonuna yapıştırılıyor | S069 |
| L-188 | `apps/web/src/components/company/reports/general-report-view.tsx:39` | Genel rapor durum süzgecinde IN_AWARD (Değerlendirmede) yok | S069 |
| L-189 | `apps/web/src/components/company/reports/savings-report-view.tsx:332` | Tasarruf raporu kalem detayında birim ham Türkçe adla ve miktar biçimsiz basılıyor | S069 |
| L-190 | `apps/web/src/components/company/visits-visibility-card.tsx:283` | Ziyaret görünürlüğü anahtarı yetkisi olmayan Satışçıya açık | S070 |
| L-191 | `apps/web/src/components/dashboard/panel-recommendations.tsx:46` | Arama geçmişi okunmadan terimsiz keşif isteği atılıyor | S072 |
| L-192 | `apps/web/src/components/dashboard/period-controls.tsx:41` | Özel aralıklı bağlantıyla açılan sayfada tarih paneli açık ve kapatılamaz geliyor | S072 |
| L-193 | `apps/web/src/components/dashboard/satinalma-ihale-tab.tsx:479` | Kapanışa kalan gün rozeti bugün kapanan talepte "Bugün" yerine "1 gün kaldı" gösteriyor | S073 |
| L-194 | `apps/web/src/components/dashboard/satis-chart-tabs.tsx:46` | Gelir/Müşteri sekmeleri API hatasında sonsuz iskelette kalıyor | S073 |
| L-195 | `apps/web/src/components/dashboard/satis-chart-tabs.tsx:135` | Satış hunisi alt başlığı tutarları TL diyor, oysa değerler rapor biriminde | S073 |
| L-196 | `apps/web/src/components/dashboard/satis-chart-tabs.tsx:304` | Satış panosu yanıt süresi grafiği tooltip'i sabit Türkçe | S073, X06 |
| L-197 | `apps/web/src/components/ihale/BrowseTenderRow.tsx:312` | "Tüm N kalemi detayda gör" bağlantısı tedarikçiyi Kalemler yerine Dosyalar sekmesine götürüyor | S074 |
| L-198 | `apps/web/src/components/inquiries/inquiries-view.tsx:152` | Bilgi talepleri sorgusu hata verince "Henüz bilgi talebi yok" boş durumu gösteriliyor | S074 |
| L-199 | `apps/web/src/components/inquiries/inquiries-view.tsx:481` | Ctrl+Enter ile yanıt çift gönderilebiliyor (isPending kontrolü yok) | S074 |
| L-200 | `apps/web/src/components/marketplace/listing-card.tsx:259` | PanelRow sütun ikonu ve kapanış yerleşimi EN/RU'da bozuluyor (Türkçe etiket sezgiseli) | S076 |
| L-201 | `apps/web/src/components/marketplace/listing-teaser-row.tsx:47` | ISR sayfalarında render anında hesaplanan 'N gün kaldı', gece yarısından sonra bayat HTML ile hidrasyon uyuşmazlığı veriyor | X13 |
| L-202 | `apps/web/src/components/marketplace/product-detail.tsx:690` | brandIsSeller alt dize eşleşmesi yüzünden kısa gerçek markalar gizleniyor | S077 |
| L-203 | `apps/web/src/components/marketplace/product-filters.tsx:289` | Yakınımda kutusunda seçili şehri düzenlemeye başlayınca yazılan metin tamamen siliniyor | S078 |
| L-204 | `apps/web/src/components/marketplace/product-filters.tsx:422` | Satıcı ülkesi grubunun boş metni "Eşleşen şehir yok" diyor | S078 |
| L-205 | `apps/web/src/components/marketplace/product-filters.tsx:627` | İlk hazır fiyat aralığı (0'dan başlayan) 400 ms sonra kendini bozuyor, hiç seçili görünmüyor | S078 |
| L-206 | `apps/web/src/components/marketplace/product-filters.tsx:804` | Nitelik süzgeç çipi okuyucunun dilindeki etiketi değil ham Türkçe değeri basıyor | S078 |
| L-207 | `apps/web/src/components/marketplace/product-index.tsx:206` | Yeni arama fiyat aralığı, para birimi, MOQ, sertifika, çalışan, hızlı yanıt ve Yakınımda süzgeçlerini sessizce düşürüyor | S078 |
| L-208 | `apps/web/src/components/marketplace/rfq-banner.tsx:34` | Talep aç CTA'larındaki `?q=` ön doldurması artık hiçbir yerde okunmuyor | S078 |
| L-209 | `apps/web/src/components/messaging/company-inbox-view.tsx:116` | Arama, seçili yeni sohbeti kapatıp taslağı siliyor | S080 |
| L-210 | `apps/web/src/components/products/image-uploader.tsx:381` | Yükleme sürerken yapılan görsel değişiklikleri ve ikinci bırakma, bayat closure yüzünden eziliyor | S081 |
| L-211 | `apps/web/src/components/products/product-showcase-form.tsx:323` | Anahtar kelime için istemci sınırı 200, API sınırı 50: ürün kaydedilemiyor | S081 |
| L-212 | `apps/web/src/components/products/product-showcase-form.tsx:397` | Formdaki 'Vitrinden çek' hatayı yakalamıyor ve sonrasında durum bayat kalıyor | S081 |
| L-213 | `apps/web/src/components/providers/company-auth-hydration.tsx:39` | Onboarding'i bitmemiş firmaya admin'in eklediği üye onboarding sayfasında çıkmaza düşüyor | X17 |
| L-214 | `apps/web/src/components/tcmb-rates-widget.tsx:81` | TCMB kur tarihi UTC+4 ve daha doğudaki tarayıcılarda bir gün önce gösteriliyor | S063 |
| L-215 | `apps/web/src/components/tenders/ai-suppliers/listing-suggestions.tsx:110` | Yayın sonrası dış davetler reddedilince kullanıcıya hiçbir geri bildirim verilmiyor | S082 |
| L-216 | `apps/web/src/components/tenders/general-info-tab.tsx:167` | Genel Bilgi sekmesinde iki ayrı alan aynı 'Görünürlük' etiketini taşıyor | S082 |
| L-217 | `apps/web/src/components/tenders/ihaleler-view.tsx:31` | 'Yakın Biten' sıralaması geçmişte kapanmış talepleri en üste koyuyor | S082 |
| L-218 | `apps/web/src/components/tenders/quick/quick-request.tsx:144` | Belge yükleme sırasında 'Taslak kaydet' açık kalıyor, mükerrer talep oluşuyor | S083 |
| L-219 | `apps/web/src/components/tenders/quick/quick-request.tsx:242` | Şartlar panelindeki görünürlük/süre/adres değişikliği talebe uygulanmıyor | S083 |
| L-220 | `apps/web/src/components/tenders/quick/quick-request.tsx:997` | Bağlantılarım→Herkese Açık geçişinde tüm bağlantılara görünmez davet gidiyor | S083 |
| L-221 | `apps/web/src/components/tenders/request-defaults-form.tsx:123` | Son seçili ülke çıkarılınca görünürlük sessizce 'Tüm ülkeler'e geçiyor | S084 |
| L-222 | `apps/web/src/components/tenders/wizard/item-question-modal.tsx:122` | Kalem sorularında 20 tavanı UI'da uygulanmıyor, hata mesajı görünmüyor | S085 |
| L-223 | `apps/web/src/components/tenders/wizard/save-template-dialog.tsx:43` | Varsayılan şablon adı (talep başlığı) backend 120 karakter sınırını aşabiliyor | S085 |
| L-224 | `apps/web/src/components/tenders/wizard/step-2-items.tsx:66` | Katalogdan eklenen kalemin görselleri (kapak boru hattı) forma hiç girmiyor | S085 |
| L-225 | `apps/web/src/components/ui/missing-fields.tsx:15` | MissingFields varsayılan etiketi sabit Türkçe "Eksik" | S086 |
| L-226 | `apps/web/src/components/ui/money-input.tsx:185` | MoneyInputNumber: başta ondalık ayraç NaN üretip siliniyor, ",5" 5 olarak kaydediliyor | S086 |
| L-227 | `apps/web/src/hooks/use-company-docs.ts:133` | Doğrulamaya gönderim sonrası Ayarlar hub rozeti eski durumda kalıyor | S056 |
| L-228 | `apps/web/src/hooks/use-company-messages.ts:108` | Mesaj gönderimi birleşik kutunun ('all') thread listesini tazelemiyor | S080 |
| L-229 | `apps/web/src/hooks/use-company-orders.ts:388` | Sipariş durum mutasyonları pano/aksiyon merkezi önbelleğini tazelemiyor | S089 |
| L-230 | `apps/web/src/lib/company/request-facets.ts:263` | Alıcı facet'inde sabit Türkçe 'Alıcı' yedek etiketi | S092 |
| L-231 | `apps/web/src/lib/pricing/plans.ts:84` | Gold paketinde satılan 'tekliflerde Gold Üye güven işareti' uygulanmamış | X23 |
| L-232 | `apps/web/src/lib/public/cross-counts.ts:31` | Sekme sayaçları ana veri çağrısını kullandığı için ikincil uç arızası tüm sayfayı düşürüyor | S093 |
| L-233 | `apps/web/src/lib/public/suggest-client.ts:52` | Mega menü ağacı geçici hatada boş dizi olarak kalıcı önbelleğe alınıyor, menü sayfa yenilenene kadar açılmıyor | S077, S093 |
| L-234 | `apps/web/src/lib/seo/entities.ts:606` | Talep sayfası başlığı 75 karakter tavanına kırpılmıyor | S094 |
| L-235 | `apps/web/src/lib/seo/sitemap-parts.ts:111` | Boş dizin sayfaları noindex iken sitemap'te listeleniyor | S094 |
| L-236 | `apps/web/src/lib/time-zone.ts:60` | toAppWallClock yaz saatli tarayıcıda geçiş saatini bir saat kaydırıyor | S091 |
| L-237 | `packages/db/prisma/schema.prisma:812` | Firma sert silmesi karşı tarafın mesajlarını ve talep davetlerini cascade ile siliyor | S046, X07 |
| L-238 | `packages/db/prisma/schema.prisma:2400` | fxToBase 6 ondalığa yuvarlanıyor, yeni zayıf birimlerde (KRW) teklif toplamı %0,1-0,2 sapıyor | X07 |
| L-239 | `packages/db/prisma/schema.prisma:2529` | notifications tablosunda companyId/listingId/type index'i yok; cron sorguları tam tablo taraması yapıyor | S047 |
| L-240 | `packages/db/prisma/scripts/assert-migration-target.ts:77` | Migration nöbetçisi DATABASE_URL'e bakıyor, Prisma migrate ise DIRECT_URL'e yazıyor | S047 |
| L-241 | `packages/db/prisma/scripts/wipe-residue.ts:50` | wipe-residue geo_cities başvuru tablosunu da boşaltıyor | S049 |
| L-242 | `packages/db/src/seeds/category-attributes.ts:114` | Segment düzeyinde zorunlu nitelikler, ilgisiz alt ailelere yanlış seçeneklerle miras kalıyor (11 ve 53) | S050 |
| L-243 | `packages/email/src/templates/tender-invite-digest.tsx:57` | Özet davet konusu alıcıları firma yerine görünen ada göre sayıyor; anonim alıcılar tek firma sanılıyor | S050 |
| L-244 | `packages/i18n/src/messages/tr/api.json:1605` | Alıcıya giden TR bildirim başlığında yasaklı 'İlan' terimi geçiyor | S011 |
| L-245 | `packages/shared/src/data/countries.ts:84` | Çok alan kodlu NANP ülkelerinde (DO 829/849, JM 658) numara ülkeyle girilemiyor, Kanada'ya düşüyor | S052, X24 |
| L-246 | `packages/shared/src/helpers/bank-details.ts:127` | IBAN zorunlu olmayan ülkede geçersiz IBAN hesap no ile birlikte gönderilince kabul ediliyor ve hesap no siliniyor | S053, X24 |
| L-247 | `packages/shared/src/helpers/slug.ts:49` | generateSlug 'Anonim Şirketi' / 'Limited Şirketi' / 'Şahıs' soneklerini hiç kırpamıyor | S053 |
| L-248 | `packages/shared/src/helpers/system-text.ts:53` | Legacy metin tabloları düz nesne: 'constructor'/'toString' gibi serbest metin kod sanılıyor | S053 |

## Dünkü kayıtta zaten olanlar (bilinen — yeniden doğrulanmadı)

| Ref | Önem | Yer | Bulgu |
|---|---|---|---|
| Parça 11 #10 (docs/audit-2026-08-27-part11-infra.md) | high | `apps/api/src/modules/company-listings/services/company-listings.service.ts:558` | Cron fan-out e-postaları Resend hız sınırına takılıp kalıcı FAILED oluyor (retry/throttle yok) |
| audit-2026-08-25-part8 Dalga B (Kısmi kazandırma: rapor Kazanan Toplam) | medium | `apps/api/src/modules/company-reports/company-reports.service.ts:529` | Rapor 'Kazanan Toplam' ve rekabet tasarrufu kısmi kazananların TAM teklif tutarını topluyor |
| P12 (audit-2026-08-28-part12 gün-anlamlı 7 tarih alanı) / P10 | medium | `apps/web/src/lib/tenders/map-detail-to-form.ts:29` | requiredByDate düzenleme/kopyalama/AI akışında negatif UTC ofsetli tarayıcıda bir gün geri kayıyor |
| P11-Cron (audit-2026-08-27-part11-infra) | low | `apps/api/src/modules/company-listings/schedulers/listing.scheduler.ts:205` | Değerlendirme geçerlilik hatırlatması take:200 penceresinde damgalanmayan adaylarla tıkanıyor |
| R-9 | medium | `apps/api/src/modules/company-items/company-items.service.ts:402` | Arşivden geri almada ücretsiz paket ürün tavanı paralel isteklerle aşılıyor |
| R-9 | low | `apps/api/src/modules/company-items/company-items.service.ts:1141` | Ürün yayın tavanı advisory lock'u RLS açıkken etkisiz (R-9 hâlâ açık) |
| audit-2026-08-23-part2 #13 | low | `apps/api/src/modules/company-listings/services/company-listings.service.ts:6281` | createNextRound teklif kümesini transaction dışında okuyor; eşzamanlı teklif yeni tura taşınmıyor, daveti silinebiliyor |
| audit-2026-08-27-part11 (dış davet günlük tavanı TOCTOU) | low | `apps/api/src/modules/company-connections/services/company-connections.service.ts:341` | Referans/dış talep/ekip daveti günlük tavanları eşzamanlı isteklerle aşılabiliyor |
| X-CF-3 | low | `apps/api/src/modules/company-listings/services/company-listings.service.ts:4949` | Onaylı kazandırmada ilan geçişi başarısız olursa commit edilmiş PENDING onay isteği yetim kalıyor |
| audit-2026-08-23-part1 LOW (logout backend'i beklemiyor) | low | `apps/web/src/hooks/use-company-auth.ts:261` | Çıkış isteği beklenmeden sayfa yönlendiriliyor; çerez silinmeyebilir, sunucu tarafı iptal yok |
| B8-1 | medium | `render.yaml:150` | render.yaml'daki sabit `-latest` model adları O-4 panel düzeltmesini Blueprint senkronunda eziyor |
| audit-2026-08-27-part11-infra #7 | medium | `apps/api/docker-entrypoint.sh:23` | Yarıda kalan migration sonrası eski sürüm de yeniden başlayamıyor; runbook'un Render geri dönüşü aynı nedenle başarısız olur |
| audit-2026-08-27-part11-infra (MED özet: API imajı tek aşamalı ve root) | low | `apps/api/Dockerfile:55` | API imajı root kullanıcıyla çalışıyor |
| audit-2026-08-23-part1-auth (Admin nav drift / Parça 9) | low | `apps/admin/src/components/layout/admin-shell.tsx:86` | Firmalar ve E-posta Kayıtları menüleri SUPPORT'a gösteriliyor, backend 403 dönüyor |
| audit-2026-08-23-part4-tenancy | medium | `apps/api/src/modules/company-listings/services/company-listings.service.ts:5047` | Onay yolunda son adım onaylanınca geçerliliği dolmuş teklif kazandırılıyor |
| audit-2026-08-24-part5-storage #6 | medium | `apps/web/src/app/[locale]/company/(authed)/ilan/[id]/teklif-ver/page.tsx:964` | Yeniden teklifte dosya ekleme gönderimi kilitliyor; silme butonu API'nin reddettiği aksiyonu sunuyor |
| audit-2026-08-23-part4 Dalga B | medium | `apps/api/src/modules/company-dashboard/dashboard-analytics.service.ts:143` | Pano analitiği ve zaman tasarrufu önbelleği istemci kontrollü anahtarla sınırsız büyüyor |
| R-9 | low | `apps/api/src/modules/company-items/company-items.service.ts:1141` | Ürün yayın tavanı kilidi RLS altında etkisiz (etkileşimli $transaction) |
| audit-2026-08-27-part11-infra (Cron: evaluationValidityReminders take:200) | low | `apps/api/src/modules/company-listings/schedulers/listing.scheduler.ts:205` | evaluationValidityReminders take:200 penceresi damgalanmayan adaylarla tıkanıyor |
| audit-2026-07-09 LOW backlog (createNextRound isSealedBid drift) | low | `apps/api/src/modules/company-listings/services/company-listings.service.ts:6330` | Yeni turda isSealedBid ters yazılıyor (RFQ turu 'açık teklif' görünüyor) |
| audit-2026-08-25-part8 Dalga B (Kısmi kazandırma: rapor 'Kazanan Toplam') | medium | `apps/api/src/modules/company-reports/company-reports.service.ts:279` | Kalem bazlı (kısmi) kazandırmada 'Kazanan Toplam' kazananların TAM teklif tutarını topluyor |
| audit-2026-08-23-part4 Dalga B | high | `apps/api/src/modules/company-users/company-users.service.ts:1838` | Son-yönetici kontrolü Kurucuyu saymıyor: Kurucu kendi tiklerini düzenledikten sonra kimseyi çıkaramıyor/pasifleştiremiyor |
| K1 | medium | `apps/api/src/modules/realtime/realtime.gateway.ts:292` | Kapalı zarf: davetli, bağlantılı ve rakip teklifçiler her yeni teklifte listing.updated ping'i alıyor |
| audit-2026-08-23-part1-auth (web: logout backend'i beklemiyor) | medium | `apps/web/src/hooks/use-company-auth.ts:261` | Çıkış isteği beklenmeden sayfa değiştiriliyor; oturum çerezi silinmeden kalabiliyor |

## Doğrulamada reddedilenler (yanlış alarm)

| Önem | Yer | Bulgu | Neden |
|---|---|---|---|
| medium | `apps/api/src/modules/public-profile/dto/public-directory-query.dto.ts:36` | Herkese açık firma dizininde 3+ faaliyet seçilince 400 → liste ve facet'ler boş | Uzunluk hesabı doğru (en kısa üç kodun birleşimi 41 karakter, public DTO'da `@MaxLength(40)` var: public-directory-query.dto.ts:36), ancak bu yola web'den ulaşılamıyor. Herkese açık /firmalar sayfası 2026-09-22'den beri  |
| medium | `apps/web/src/components/marketplace/inquiry-dialog.tsx:61` | Misafir bilgi talebi Accept-Language göndermiyor; talep dili ve doğrulama e-postası sayfa dilini değil tarayıcı dilini izliyor | `InquiryDialog` (apps/web/src/components/marketplace/inquiry-dialog.tsx) hiçbir yerde import edilmiyor. apps/web altında yapılan grep yalnızca bileşenin kendi tanımını ve ayrı bir bileşen olan `PanelInquiryDialog`'u bulu |
| low | `apps/web/src/lib/public/marketplace-api.ts:736` | Herkese açık firma dizini facet isteği seçili ülkeyi göndermiyor; sayaçlar listeyle uyuşmuyor | fetchPublicDirectoryFacets (marketplace-api.ts:730) web kodunun hiçbir yerinden çağrılmıyor, yani ölü kod. grep'te tek tanım var, çağıran yok. Herkese açık /firmalar sayfası (firmalar/page.tsx → company-index.tsx:36-50)  |
| low | `apps/web/src/components/currency-multi-select.tsx:98` | Kur listesinde ₺ sabit önek ve TRY için sabit '1.0000' | Kod gerçekten aynen tarif edildiği gibi: currency-multi-select.tsx:98'de TRY için sabit "1.0000", :101'de sabit `₺` öneki var. Fakat CurrencyMultiSelect bileşeni hiçbir yerde import edilmiyor; apps/ ve packages/ altında  |
| low | `apps/web/src/lib/tenders/quick-parse.ts:36` | İngilizce binlik virgülü ondalık sayılıyor (hızlı talep ayrıştırıcı ve AI arama tavanı) | Başlıktaki senaryo canlıda erişilemez: 'Ne lazım?' serbest metin kutusu 2026-09-10 kullanıcı kararıyla kaldırıldı (CLAUDE.md:2019-2023). quick-parse.ts'den üretim kodunda yalnız `titleFromItems` içe aktarılıyor (quick-re |
| low | `apps/web/src/components/messaging/company-inbox-view.tsx:224` | Gelen kutusunda bugünkü mesaj saati tarayıcı saatiyle ve dilim etiketi olmadan basılıyor | Kodda gelen kutusunun bugünkü mesajlar için tarayıcı saatiyle `isToday` + `format(HH:mm)` kullandığı doğru (company-inbox-view.tsx:223-225). Ancak bulgunun temel iddiası yanlış: mesaj detayı (company-message-thread.tsx:2 |
| low | `apps/api/src/common/error-messages.ts:32` | Ondalık @Min sınırında yanlış doğrulama mesajı ('0 veya daha büyük olmalı') | Regex hatası kod düzeyinde doğru: error-messages.ts:32'deki `(\d+)` ifadesi 'must not be less than 0.001' mesajından yalnız 0'ı yakalıyor (class-validator 0.14.4 Min.js:22 bunu doğruluyor). Ancak bildirilen iki yola gerç |
| low | `apps/api/src/modules/company-listings/services/company-listings.service.ts:7470` | cancel ve closeNoAward realtime ping atmıyor; açık sayfadaki teklifçiler talebi hâlâ açık görüyor | Evet, cancel (7470-7471) ve closeNoAward (7876-7877) pingListing çağırmıyor. Ama açıklanan sonuç (ekran teklif gönderilene kadar açık kalıyor) gerçekleşmiyor, çünkü yedek poll var. useListingDetail'de (apps/web/src/hooks |
| low | `apps/api/src/modules/content-translation/category-translation.service.ts:345` | Nitelik/kategori toplu çevirisi zaten dolu olan çeviriyi eziyor (nitelikte NULL'a da çekebiliyor) | Kod gerçekten koşulsuz yazıyor. Nitelik güncellemesi category-translation.service.ts:187'de (bildirilen satır 345 değil, dosya 195 satır); kategori yolu ise yalnız boş olmayan değeri yazıyor (113-115), yani NULL'a çekmiy |
| low | `apps/api/src/modules/public-marketplace/public-marketplace.controller.ts:61` | `/public/suggest` q parametresi dizi/nesne gelirse 500 hatası | Bu senaryo gerçekleşmiyor. main.ts:174-180'deki global ValidationPipe `transform: true` ile kuruluyor ve derlenmiş controller'da suggest için `design:paramtypes` değeri `[String, String]` (dist/.../public-marketplace.con |
| low | `package.json:28` | brace-expansion >=5 override'ı minimatch@3/@5'in brace desenlerini tamamen kırıyor | Teknik tespit doğru: package.json:28 override'ı nedeniyle minimatch@3.1.5 ve minimatch@5.1.9 da brace-expansion@5.0.9'a bağlanıyor (pnpm-lock.yaml:15118-15124). 5.x yalnızca `exports.expand` veriyor, minimatch@3.1.5/mini |
| medium | `apps/web/src/app/[locale]/company/(authed)/ilan/[id]/teklif/[bidId]/page.tsx:171` | Teklif detayında 'Doğrulanmamış firma' ibaresi yok; kalemsiz talepte alıcı bunu hiçbir yerde görmüyor | Bulgunun asıl senaryosu olan "kalemsiz talepte alıcı ibareyi hiçbir yerde görmez" canlıda gerçekleşemiyor. Web talep formu en az bir kalem istiyor (apps/web/src/lib/tenders/form-schema.ts:293-296 `.min(1)`). Hemen-Al 202 |
| low | `apps/web/src/components/dashboard/panel-hero-search.tsx:331` | Firma kapsamındaki aramalar ürün arama geçmişine yazılıyor, öneri şeridi kayboluyor | Kayıt kısmı doğru: panel-hero-search.tsx:331 supplierMode'a bakmadan her düz aramayı "satinalma" listesine yazıyor. Ama iddia edilen sonuç büyük ölçüde oluşmuyor. Ürün araması firma adında da arıyor; product-index.ts:216 |
| low | `apps/web/src/components/marketplace/company-card.tsx:309` | Firma kartının tile görünümünde şehir adı yerelleştirilmeden basılıyor | Kod gözlemi doğru: company-card.tsx:306-310 tile dalı ham `{c.city}` basıyor, wide dalı ise :132'de `cityDisplayName(c.city, locale)` kullanıyor. Ancak tile dalına üretimde hiçbir yol ulaşmıyor. Açıklamada adı geçen `Fea |
| medium | `apps/web/src/lib/public/suggest-client.ts:51` | Mega menü kategori adları site dilinde değil, tarayıcı dilinde geliyor ve dil değişince bayat kalıyor | Kodla ilgili tespit doğru: suggest-client.ts:27 ve :51'deki `fetch` çağrıları `accept-language` başlığı göndermiyor, `menuCache` (satır 43) dil anahtarı tutmuyor ve API adı `currentLocale()` üzerinden seçiyor (category-n |
| low | `apps/web/src/app/[locale]/firma/[slug]/page.tsx:89` | `?onizleme=1` herkese açık, önbelleği ve API hız sınırını birlikte atlatıyor | Aktarılan yol doğru: page.tsx:89-93'teki `fresh`, marketplace-api.ts:498-501 ve 237'de `cache: "no-store"` ile çalışıyor, publicHeaders (marketplace-api.ts:165-183) de `x-rothern-ssr` gönderiyor, yani client-ip-throttler |
| low | `apps/web/src/lib/tenders/quick-parse.ts:34` | Satır ayrıştırıcı 'x' ile biten ürün adlarının son harfini siliyor ('inox' → 'ino') | Regex hatası fonksiyon düzeyinde gerçek. Node'da denedim: 'paslanmaz boru inox 100 m' girdisi 'paslanmaz boru ino' veriyor, 'Latex 10 kg' da 'Late' veriyor (quick-parse.ts:34, :59). Ancak parseLine ve parseNeed üretim ko |

## Kapsam kanıtı

Dilim planı ve ajan başına okunan dosya listesi oturum çalışma alanında (`slices.json`, `result.json`); 97 dilimin tamamı eksiksiz okundu olarak döndü.
