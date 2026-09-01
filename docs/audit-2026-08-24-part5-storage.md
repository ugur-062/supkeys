# Denetim 2026-08-24 — Parça 5: Dosya & Depolama

> **Terminoloji notu (2026-09-01):** Bu rapor yazıldığında ürün dilinde
> "ihale" kullanılıyordu. Sonradan kullanıcı-yüzü dil **"satın alma talebi"**
> (satış tarafında "ilan") olarak değiştirildi. Rapor metni BİLİNÇLİ olarak
> güncellenmedi: o tarihteki kodu ve dizeleri anlatıyor, bugünkü sözcükle
> yeniden yazılırsa okuyucu git geçmişinde başka bir şey bulur. Kod adları
> (`IhaleListView`, `ihaleler-view.tsx` vb.) zaten değişmedi. Bkz. CLAUDE.md
> § Ürün Dili.



Yöntem: 7 mercek paralel bulgu toplama (52 ham bulgu: anahtar şeması/IDOR,
presigned yaşam döngüsü, yükleme doğrulama, public kova/CDN, silme-artıklar,
PDF/Excel dışa aktarma, ön yüz pariteleri) → tekilleştirme (aynı kök nedeni 4
mercek birden bulmuştu) → 10 bağımsız çürütücü → LOW/INFO elle.

## DOĞRULANAN

| # | Şiddet | Bulgu | Kanıt | Düzeltme |
|---|--------|-------|-------|----------|
| 1 | **HIGH** | **Presigned PUT içerik tipini BAĞLAMIYOR → public kovada depolanmış XSS.** AWS SDK presigner `prepareRequest`'te `unsignableHeaders.add("content-type")` yapıyor: imzalı URL'i alan istemci `image/png` beyan edip nesneyi `text/html` ya da `image/svg+xml` olarak yükleyebiliyor. Nesne public kovada kalıcı ve kimliksiz erişilebilir (`cdn.rothern.com`), çerez alanı `.rothern.com` ve `rk_csrf` httpOnly değil → marka alan adında saldırgan JS, CSRF çerezi okuma, birebir sahte giriş sayfası. Yükleme sonrası GERÇEK tip hiçbir yerde doğrulanmıyordu (`checkExists` HEAD'in `ContentType`'ını atıyordu) | `@aws-sdk/s3-request-presigner` dist `prepareRequest`; `storage.service.ts:228-292`; `company-profile.service.ts:83-129` | `checkExists` artık `contentType` döner; `assertUploadedObjectValid(..., allowedContentTypes)` gerçek tipi doğrular, uymayan nesneyi SİLER; dört yükleme yolu (profil görseli, KYC, ilan belgesi, teklif belgesi) allowlist'iyle bağlandı. Ayrıca presigned GET artık **her zaman** `Content-Disposition: attachment` + `application/octet-stream` (satır-içi açılma yolu kapandı) |
| 2 | **HIGH** | **CSV içe aktarmada bellek/CPU patlaması:** ExcelJS `csv.read` dosyanın tamamını satır/hücre NESNESİNE açıyor; çürütücünün ölçümü: 3,7 MB dar hücreli CSV → **467 MB heap / 578 MB RSS ve 252 sn CPU**; boş hücreli varyant ~3 sn'de **~860 MB**. Gerçek tavanı `*_MAX_FILE_BYTES` (5 MB) değil, gövde limiti + base64 şişmesi koyuyordu; satır tavanı (500) ancak parse SONRASI çalışıyor | `listing-item-import.service.ts:226`, `bid-import.service.ts:227`; `main.ts:121` (5mb) | CSV'ye ayrı, düşük tavan: `ITEM_IMPORT_MAX_CSV_BYTES` / `BID_IMPORT_MAX_CSV_BYTES` = **1 MB** (xlsx yolu zip-inspect ile zaten korumalı) |
| 3 | MED | **KVKK silme/anonimleştirme R2 nesnelerini SİLMİYOR ve kimlik alanlarını temizlemiyor:** vergi no/MERSİS null'lanırken tam da onların KANITI olan 6 KYC belge anahtarı, `authorizedTckn`, `billingPhone`, profil görselleri duruyordu; admin firma detayı bu kolonlar için koşulsuz presigned GET ürettiğinden silme talebinden **sonra** da kimlik kartı taraması açılabiliyordu. Repoda hiçbir bucket lifecycle kuralı yok; `deleteObject` yalnız 4 yerde çağrılıyor. Servisin kendi profil yanıtı aynı alanları "kişisel/finansal veri" diye maskeliyor — iç tutarsızlık | `admin-companies.service.ts:1623-1737`; `getDetail:508-527`; şema `Company.doc*Url`, `CompanyKycRevision.key` | anonimleştirme 6 belge kolonu + TCKN/telefon/KEP/adres detayları + logo/kapak/galeri/sertifika + `publicEnabled=false` temizler; `companyKycRevision.deleteMany`; yeni `purgeCompanyObjects` her iki kolda private + public nesneleri siler (best-effort, `publicUrlToKey` ile URL→anahtar) |
| 4 | MED | **Admin CSV dışa aktarmalarında FORMÜL ENJEKSİYONU:** `apps/admin/src/lib/csv.ts` tek `downloadCsv` yardımcısı `=`, `+`, `-`, `@` ön-ekli değerleri nötrlemiyor; firma ünvanı (`legalName`) ve şikayet metni (`reason`/`detail`) üç admin CSV'sine ham geçiyor. Tırnak sarma Excel'de koruma değildir. (**xlsx yolu KAPALI** — exceljs string hücresi formüle dönüşmez) | `apps/admin/src/lib/csv.ts` | tehlikeli ön-ekli değerlere tek tırnak ön-eki (değer bozulmaz, Excel metin sayar) |
| 5 | MED | **Rapor sorgularında satır tavanı yok:** `general()` RANGE ve `savings()` `take` olmadan firmanın tüm ihale + teklif + kalem + davet ağacını (description/terms/internalNotes dahil) belleğe alıyor; davetler yalnız `.length` için hidrate ediliyor. Tetikleyici tarih aralığı değil, kiracının ihale hacmi | `company-reports.service.ts:124-165, 330-375` | `MAX_REPORT_LISTINGS = 500` + yanıtta `truncated`/`maxRows` (sessiz kesme yok) |
| 6 | MED | **Yeniden teklif akışında UI↔API paritesi:** pazarlık (ENGLISH_AUCTION) yeniden-teklifinde dosya eklemek gönderimi tamamen kilitliyor (ne yükleme ne taslak mümkün); LOST sonrası yeniden teklifte kilit var ama kaçış yolu var (dosyayı çıkar / taslak kaydet). Silme de reddediliyor ama UI çöp-kutusunu gösteriyor | web teklif-ver sayfası + `company-bid-documents` kapıları | Dalga B (UI kapısı + açıklayıcı mesaj) |

## ÇÜRÜTÜLEN / BİLİNÇLİ TASARIM

- **Private belgeler inline sunuluyor → admin tarayıcısında HTML/SVG çalışır** → REFUTED: ihale/teklif belgeleri zaten `attachment`; KYC inline'dı ama MIME allowlist + uzantı kara listesi + (artık) gerçek content-type kapısı HTML/SVG'nin kovaya girmesini engelliyor, imzalı URL ayrı kayıtlı alan adında ve admin CSP'si (`default-src 'self'`, frame-src yok) cross-origin iframe'i zaten blokluyor. Yine de #1 kapsamında tüm indirmeler `attachment` yapıldı.
- **Gönderilmiş teklifin belge içeriği 15 dk penceresinde değiştirilebilir** → REFUTED (bugün): Cloudflare R2 bucket-lock politikası üzerine yazmayı reddediyor. **Not:** aynı kilit `DeleteObject`'i de reddettiği için `remove()` ve yetim temizliği sessizce başarısız oluyor → Dalga B (kilit politikasıyla kod sözleşmesi hizalanmalı).
- **`R2_PUBLIC_BUCKET === R2_PRIVATE_BUCKET` boot guard'ı yok → KYC public'e taşınır** → ÇÜRÜTÜLDÜ: public kova yokken private'a düşmek yazılı ve bilinçli "legacy tek-bucket = hepsi private" geri çekilme yolu; ifşa iki bağımsız yanlış yapılandırma ister.
- **Profil yükleme ortak kapıları atlıyor** → PARTIAL/LOW: `assertReportedSize` istemci beyanı olduğu için güvenlik değeri yok; bu yol HEAD tabanlı (10 MB) daha sıkı kapıya sahip. Uzantı servis davranışını belirlemiyor (R2 depolanmış content-type'ı servis eder) ve o artık allowlist'e kilitli.

## DALGA B (doğrulanan LOW/MED)

- **Yetim nesne temizliği yok:** presigned PUT sonrası commit edilmeyen nesneler, cascade silinen ilan/teklif belgeleri, değiştirilen profil görselleri ve reddedilip yeniden yüklenen KYC belgeleri R2'da kalıyor; tek TTL cron'u yalnız `ai-extract/` prefix'ini kapsıyor. Firma başına depolama kotası da yok. (Bucket-lock DeleteObject'i reddediyorsa önce o politika çözülmeli.)
- Presigned PUT boyut da bağlamıyor (S3 imzası ContentLength koşulu taşımıyor) → gerçek çözüm presigned **POST + policy** (`content-length-range`).
- EXIF/GPS: tarayıcı küçültmesi "en uzun kenar ≤ eşik" olduğunda ATLIYOR ve hata hâlinde orijinali yüklüyor; sunucuda sanitizasyon yok → küçük fotoğrafların konum verisi public CDN'e çıkabiliyor.
- `R2_PUBLIC_BASE_URL` boşken profil görseli commit'i 15 dk ömürlü presigned URL döndürüyor ve istemci onu KALICI olarak kaydediyor (ölü görsel).
- İhale/teklif belgesi ekleme-silme audit izi yok (KYC yüklemesi bırakıyor — asimetri).
- İlan/teklif başına belge sayısı tavanı ve anahtar tekilliği yok.
- Excel/CSV içe aktarma base64 gövdeyle gidiyor: UI'daki "5 MB" gerçek limitle (~3,7 MB) uyuşmuyor, istemcide boyut kapısı yok.
- İmzalı GET bağlantısı 15 dk sonra ölüyor; sayfa açık kaldığında yenilenmiyor (kullanıcı R2'nin XML hatasını görüyor).

## DURUM

- **Dalga A UYGULANDI (2026-08-24):** #1-#5.
- Yeni tek-kaynaklar: `checkExists().contentType` + `assertUploadedObjectValid(..., allowedContentTypes)`, `storage.publicUrlToKey`, `AdminCompaniesService.purgeCompanyObjects`, `*_MAX_CSV_BYTES`, `MAX_REPORT_LISTINGS`.
- Testler: `test/integration/audit-part5-dalga-a.spec.ts` (6); depolama rig'lerine `contentType` eklendi (yeni HEAD kapısı — 9 spec).
