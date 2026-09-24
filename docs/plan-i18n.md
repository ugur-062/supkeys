# Çok dillilik (i18n) planı — 2026-09-23

> Karar: kullanıcı onayı 2026-09-23 ("başla"). İlk dil seti **TR (kaynak) + EN + RU**.
> Çince/Arapça sonraya (RTL, CJK font, arama tokenleme ayrı iş).
> Terim: Türkçe "talep" → İngilizce **Request** (asla "tender"), Rusça **запрос**
> (asla "тендер"). Sözlük tek kaynak: `packages/i18n/src/glossary.json`.

## İlkeler

1. **Kaynak dil Türkçe.** Geliştirici yalnız `tr` kataloğuna yazar; diğer diller
   otomatik akıştan gelir. Varsayılan dil TR olduğu için mevcut testler (844 birim +
   1.079 e2e Türkçe literal) değişmez.
2. **Tek katalog, tek biçim, tek çalışma zamanı.** ICU MessageFormat JSON;
   `@rothern/i18n` paketi (`packages/i18n`). Web `next-intl`, API ve e-posta aynı
   katalogları `use-intl` çekirdeğiyle okur (`createTranslatorFor`).
3. **Eksik çeviri ekranı BOZMAZ.** Çalışma zamanı birleştirme `ru → en → tr`
   (`messagesFor`). Boş kutu ya da ham anahtar görünmez.
4. **Dil kullanıcıda.** `CompanyUser.locale` (varsayılan `tr`). Web bunu
   `NEXT_LOCALE` çerezine ve her API isteğine `Accept-Language` olarak koyar. API hata
   mesajlarını istek diliyle döner; bildirim/e-posta ALICININ diliyle üretilir.
5. **Kullanıcı içeriği çevrilmez** (ürün, talep, firma metni yazarın dilinde).
6. **Admin Türkçe kalır.**

## Katalog düzeni

```
packages/i18n/src/messages/<locale>/{common,web,api,email}.json
packages/i18n/src/status/<locale>.json      anahtar → { hash, status: machine|reviewed, at }
packages/i18n/src/glossary.json             dil başına terim + yasaklı sözcük
packages/i18n/baseline/hardcoded.json       sabit Türkçe metin cırcırı (dosya → sayı)
```

- Anahtarlar kararlı ve alan bazlı (`web.settings.language.label`), Türkçe metin
  anahtar DEĞİL (yeniden adlandırmalar bir katalog satırı olsun).
- Web `common + web`, API `common + api + email` ad alanlarını yükler.
- Tip güvenliği: `tr` kataloğundan türeyen `AppConfig.Messages` → yanlış anahtar
  derlemede kırmızı (web `src/i18n/global.d.ts`).

## Güncelleme akışı

| Adım | Ne | Kim |
|---|---|---|
| Yazarken | anahtar + `tr` metni; sabit Türkçe literal cırcırı kırmızı verir | geliştirici |
| `pnpm i18n:sync` / `--out <dosya>` | `tr`de yeni/değişen (bayat) anahtarları Türkçe kaynakla listeler | betik |
| Çeviri | **Claude yazar** — fazlar sırasında ekran bağlamıyla TR + EN + RU birlikte; sonradan eklenen dizeler için `--out` listesi çevrilir | Claude |
| `pnpm i18n:sync --apply <dosya>` | çevirileri uygular (yer tutucu + yasaklı terim denetimi), `reviewed` işaretler | betik |
| `pnpm i18n:sync --mark-reviewed <önek>` | var olan çeviriyi onaylı işaretler | insan / Claude |

> **MAKİNE ÇEVİRİSİ YOK (kullanıcı kararı 2026-09-23):** Gemini Flash çeviriye
> bağlanmaz; ilk sürümdeki Gemini çağrısı söküldü, Flash'ın ürettiği 40 Rusça
> dize Claude tarafından yeniden çevrildi. Sonradan (insan eliyle) eklenen dizeler
> için ayrı çözüm bulunacak; o güne kadar `--out` listesi Claude'a verilir.
| `pnpm i18n:check` (CI) | orphan anahtar · ICU yer tutucu paritesi · yasaklı terim · EN kapsamı %100 (eksik + bayat = 0) · RU rapor · cırcır | CI |

Ana dili konuşan biri pazarlama, e-posta ve sözleşme metinlerini son kez okumalı;
panel içi kısa etiketler Claude çevirisiyle yayınlanır.

## Fazlar

| Faz | İş | Durum |
|---|---|---|
| 0 | Paket, next-intl (yönlendirmesiz), `locale` alanı + migration, Accept-Language ALS, hata mesajı çevirisi (ValidationPipe + `i18nMessage`), web köprüsü (axios toast'ları), cırcır + CI | **BU TUR** |
| 1 | `app/[locale]` yönlendirme (TR ön eksiz, `as-needed`), hreflang + dil başına sitemap ✅ 2026-09-23 (1b) · herkese açık yüzey + giriş/kayıt/onboarding metinleri EN/RU (1d) · dil seçici üst çubuk + Ayarlar (1c) — 1c/1d sürüyor | **SÜRÜYOR** |
| 2 | Panel metinleri modül modül (62 sayfa), ad alanı bazlı yükleme | sonraki |
| 3 | API istisnaları (439) + DTO mesajları (112, fonksiyon biçimi), bildirim (8 üretici, alıcı dili), e-posta şablonları (4), Excel raporları | sonraki |
| 4 | Kategori: `nameEn` + dil tablosu (L1–L3 + çekirdek L4 makine), arama metni dil başına | sonraki |

## Faz 0 kararları ve tuzaklar

- **Yönlendirmesiz kurulum bilinçli:** `getRequestConfig` içinde `cookies()` okumak
  o rotayı DİNAMİK yapar. Herkese açık sayfalar statik/ISR kalmalı (CSP ve CDN
  önbelleği buna dayanır) → Faz 0'da next-intl YALNIZ panel (`app/company`,
  zaten `force-dynamic`) altında kurulur; kök `<html lang="tr">` Faz 1'e kadar
  sabit. Faz 1'de `[locale]` + `setRequestLocale` ile herkese açık sayfalar dil başına
  statik olur.
- **Mesajlar istemciye ad alanıyla gider:** Faz 2'de katalog büyüyünce RSC yükü
  şişer → rota segmentine göre `pickMessages` ile daraltılır.
- **DTO `message:` sabit dizesi dil bilmez** (sınıf tanımında değerlenir). Faz 3'te
  `message: () => tApi("…")` fonksiyon biçimine geçer; Faz 0 yalnız class-validator
  varsayılan mesajlarını (`translateValidatorMessage`) ve `exceptionFactory`yi dil
  farkında yapar.
- **Bildirim metni üretim anında donar** (alıcının o günkü dili). Kabul edildi.
- **Saat dilimi bu işin parçası değil** (kullanıcı başına saat dilimi ayrı, küçük iş).
- **Sözleşmeler** hukukçudan geçer; İngilizce metne "Türkçe metin esastır" maddesi.

## Faz 1b kararları ve ölçümler (2026-09-23)

- Yol parçaları çevrilmedi (`/en/urunler`); `pathnames` tipli bağlantı ister, 117
  dosya yeniden yazımı Faz 1 dışı. Karar `src/i18n/routing.ts`te tek yerde.
- Otomatik dil tespiti kapalı; dil seçici (1c) ve `LocaleUrlSync` tek geçiş yolu.
- `next/link` → `@/i18n/navigation` codemod: 116 dosya; `next/navigation` bölme:
  37 dosya. `permanentRedirect({ href, locale })` 3 sayfa. `window.location`
  atamaları `localizePath(…, runtimeLocale())`.
- **Etiket tuzağı:** `next build` tablosu `[locale]` altındaki her rotayı ● gösterir;
  gerçek ölçüt `.next/server/app/<dil>/<rota>.html` ve `prerender-manifest.json`.
  Panel için ikisi de yok → dinamik. `connection()` eklenip geri alındı.
- Herkese açık statik sayfa: tr/en/ru × 7 (anasayfa, ürünler, firmalar, alım
  talepleri, nasıl çalışır, sss, hakkımızda, iletişim); toplam 226 statik sayfa.

## Faz 1d kararları (2026-09-23) — statik sayfalar, kimlik akışı, dil seçici

- **Çeviri Claude'ca, ekran bağlamıyla** (kullanıcı kararı: makine çevirisi yok).
  Faz 1 sonunda katalog 1.150 anahtar; EN ve RU %100 `reviewed`.
- **Kırıntı adresleri dil ön ekli:** `breadcrumbNode(items, locale)` — eskiden
  `/en/…` sayfasının JSON-LD kırıntısı Türkçe adres ve ad taşıyordu.
- **İstemci yükü:** sunucuya özel ad alanları (`SERVER_ONLY_NAMESPACES`: about/
  contact/faq/legal/inquiryVerify) kök sağlayıcıya girmez; dosya sistemi testi
  "use client" dosyalarını tarar. `web.seo` istemcide kalır (parçacık önizlemesi).
- **`server-only` zinciri:** `entities.ts` `@/i18n/server`ı import edince
  `product-detail` → panel sayfası zinciriyle `next build` kırıldı (staging 3
  dağıtım kırmızı; tsc/vitest/lint görmedi). Üreticiler çevirmeni parametre
  alır (`seoT(locale)` sunucu · `useSeoT()` istemci); herkese açık yüzeye
  dokunan her partide yerel üretim derlemesi.
- **Sözleşmeler Türkçe kalır**, EN/RU'da "Türkçe metin esastır" notu; meta
  başlık/açıklama çevrilir, gövde `lang="tr"`.
- **Paket metinleri** katalogda (`web.pricing`), panel Faz 2'ye kadar
  `PRICING_PLANS`; parite testi. **Segment sloganları** katalogda.
- **Kimlik akışı:** ortak `usePasswordRules`/`PasswordStrength`/`ConsentRows`;
  zod mesajları `useMemo` şema fabrikasıyla dil bilen; kayıt ülkesi adları
  `Intl.DisplayNames` (XN/KKTC Türkçe ada düşer).
- **Dil seçici:** üst çubuk küre menüsü (masaüstü), mobil menü ve altbilgide
  yan yana bağlantılar; aynı sayfa + sorgu, hedef dilin ön ekiyle. next-intl
  `Link locale="tr"` (varsayılan dil) EN/RU sayfadan BİLİNÇLİ olarak `/tr/…`
  basar; middleware 307 ile ön eksiz adrese yollar ve `NEXT_LOCALE` çerezini
  yazar (kütüphane davranışı, ölçüldü: `/tr/hakkimizda` → 307 `/hakkimizda`).
  Tek atlama; kanonik yine ön eksiz. Ayarlar ›
  Hesap Bilgileri › Dil anında kaydeder ve `router.replace(…, { locale })`.
- **Bayat vaat düzeltmeleri** (çeviri sırasında görüldü): "teslim belgesi",
  "sınırsız kullanıcı", "ilan" → "talep".
- **Sonraki:** Faz 2 panel metinleri (cırcır 433 dosya / 6.194 literal; ad
  alanı `web.panel.*`, sağlayıcı daraltma o zaman), Faz 3 API istisna/DTO
  fonksiyon mesajı/bildirim/e-posta, Faz 4 kategori adları.

## Faz 1e — kullanıcı içeriği otomatik çevirisi (2026-09-23)

- **Karar (kullanıcı):** ürün / alım talebi / firma profili metinleri her
  eklendiğinde otomatik çevrilsin; motor Gemini Pro (`models.premium`).
  Pilot: 4 ürün + 2 talep + 2 profil gerçek staging içeriğiyle; terimler
  doğru (kulirnaya glad, power troweled, 5-lead ECG), sayılar/kodlar korunmuş,
  sözlük tutmuş; 36 sn / 8 kayıt, ürün başına < 1 sent.
- **Model:** `content_translations` varlık×dil; `sourceHash` bayatlama;
  kaynak dil satırı `fields=NULL`; PENDING → `kick` (aynı süreç) → DONE;
  FAILED ≤3 deneme; 5 dk süpürücü. Listeler kaynak→hedef ÇİFT saklar,
  okuma metinle eşler (kalem sırası değişse de).
- **Uydurma kapısı:** sayı koruma + liste uzunluğu + aşırı uzunluk; ihlalde
  geri bildirimli tek düzeltme turu.
- **Okuma:** `Accept-Language` → `currentLocale()`; herkese açık ürün/talep/
  firma uçları çevrilmiş alan + `translatedFrom`; web notu `AutoTranslatedNote`.
  SEO: meta/JSON-LD/OG aynı DTO'dan türediği için kendiliğinden dile göre.
- **Geriye dönük:** `POST admin/content-translations/backfill` (SUPER_ADMIN)
  herkese açık kayıtları kuyruğa alır, arka planda sırayla çevirir;
  `GET …/status` sayaç + maliyet + son hatalar.
- **Bilinçli dışarıda:** arama (özgün metin), kategori adları (Faz 4 — EN
  Ariba kaynağından bedava, RU aynı motorla), mesaj/teklif/adres, panel
  yüzeyi (Faz 2).
- **Google politikası notu:** salt makine çevirisi "ölçekli içerik" riski
  taşır; kalite kapısı + terim sözlüğü + örneklem incelemesi bu yüzden.
- **Staging backfill sonucu (2026-09-23):** 103 ürün + 42 talep + 23 profil →
  504 satır DONE, 0 hata, 8,16 USD, ~27 dk; model Vertex'te
  `gemini-3.1-pro-preview` (`gemini-pro-latest` ve `gemini-3.1-pro` 404).
  Düşük thinking ile kayıt başına ≈ 4 sent. EN/RU örneklem Claude tarafından
  okundu: terimler ve sayılar doğru ("пенье", "НИАД", "5-lead ECG").
- **Canlıya çıkış:** migration `20260923180000` + PR birleştirme + Render
  `AI_MODEL_PREMIUM`'u Vertex'in tanıdığı Pro adına çekmek (ör.
  `gemini-3.1-pro-preview`) + `POST admin/content-translations/backfill`.

### Faz 1e kapanış turu (2026-09-23 akşam, kullanıcı: "kalemler çevrilmemiş, bazı alım taleplerine girince 404")
- **Kalemler:** herkese açık API 12/12 talebi EN+RU başlık ve kalem adıyla
  çevrili döndürüyordu; eksik olan PANELDİ — `company/listings/seller-tenders`
  (`itemNames`), teklifçi `getOne` dalı, ürün keşfi (`items/discover*`),
  firma dizini/profili (`company/directory/*`) çeviri servisinden geçmiyordu.
  Hepsi okuyucunun dilinde (`currentLocale()` = Accept-Language ya da kayıtlı
  dil); KENDİ verisi (sahip dalı, kendi profili) ham kalır. Kart "özellik
  satırları" (`Etiket: değer birim`) da çevrilir (`localizeFeatures`).
- **404:** `middleware.ts` `matcher`ı `Next-Router-Prefetch` / `Purpose:
  prefetch` isteklerini MUAF tutuyordu (CSP nonce optimizasyonu). Faz 1'den
  beri Türkçe adresler ön eksiz ve `/tr/…` yeniden yazımı bu middleware'de →
  ön yükleme ham yola gidip `[locale]="urunler"` gibi yanlış eşleşiyor,
  `/urunler?_rsc=…` 404 dönüyor, tıklanınca "Sayfa bulunamadı" açılıyordu
  (staging'de tarayıcıyla ölçüldü; curl `Next-Router-Prefetch: 1` ile
  yeniden üretildi). `missing` kaldırıldı; `middleware.test.ts` kilitler.
- **Talep adresi DİLDEN BAĞIMSIZ:** sayfa kanoniği çevrilmiş başlıktan slug
  üretiyordu → sitemap'teki EN/RU hreflang alternatifleri (Türkçe slug) 308
  ile çevrili slug'a yönleniyor, RU slug'ı Kiril düşünce `rot-000007` gibi
  çıplak kalıyordu. Karar: API her talep yanıtına KAYNAK başlığın `slug`ını
  koyar; web `listingHref()` onu kullanır (`/en/talep/<slug>` = `/talep/<slug>`),
  başlıktan üretim yalnız yedek. Ürün/firma slug'ı zaten sütunda (donuk).

### Faz 1e son tur (2026-09-24 gece, kullanıcı: "sayfa yolları gibi her şeyi kontrol et")
- **Şehir adları:** EN sayfada "İstanbul" (noktalı İ), RU sayfada Latin il adı
  kalıyordu (başlık, açıklama, JSON-LD, kartlar). `TR_PROVINCE_NAMES_I18N`
  (81 il, EN Vikipedi yazımı / RU Kiril) + `provinceDisplayName`; web
  `cityDisplayName`/`useCityLabel`. Süzgeç anahtarı ham TR adı (URL/API
  değeri değişmez), yalnız etiket çevrilir. Yabancı şehir olduğu gibi.
- **Serbest metin birim + talep sahibi profili:** `unitCode`süz `unit` metni
  ("kullanıcı") çevrilir; LISTING tetiği sahibin COMPANY kaydını da kuyruğa
  alır (alıcı sektörü). Staging backfill 564 DONE / 0 hata.
- **Yumuşak 404 (SEO):** `urunler/loading.tsx` kategori/şehir sayfalarının
  `notFound()`unu 200 + noindex'e çeviriyordu (canlıda da) → rota grubu.
- **Kalan kalıntılar bilinçli:** firma adları, "MERSİS", vergi dairesi adı,
  dil seçicideki "Türkçe" (dilin kendi adı), logo baş harfleri.

## Faz 1f — yol parçaları üç dilde (2026-09-24, kullanıcı: "yol parçaları da hangi dilse o dilde olsun")
- **Karar:** EN `/en/products`, `/en/companies/<slug>`, `/en/buying-requests`; RU Latin
  çeviriyazı `/ru/tovary`, `/ru/kompanii`, `/ru/zayavki`; panel kökü dile göre
  (`/en/company/…`, `/ru/kompaniya/…`, Türkçe `/company` sabit). Admin çevrilmez.
- **Uygulama:** `@rothern/i18n` `ROUTE_PATHNAMES` (86 sayfa, ~75 sabit parça) +
  saf eşleyiciler; next-intl `pathnames` (middleware yeniden yazma + 308);
  `@/i18n/navigation` sarmalayıcısı dize adresleri çevirir (117 çağrı yeri
  değişmedi); `localizePath`/`splitLocale`/`localizedAlternates` şablon farkında
  → kanonik, hreflang, sitemap, robots kendiliğinden dış yolu üretir.
- **Tuzaklar:** next-intl dize adresi birebir arar (dinamik rota çevrilmezdi);
  `usePathname` şablon dönerdi; `isPublicRoute` dış yolu tanımasa `/en/products`
  nonce'lu CSP alırdı; `next/navigation` hook'u sunucudan import edilen modülde
  derlemeyi düşürür (istemci modülü ayrıldı).
- Kategori/şehir sayfalarındaki giriş paragrafı (`IndexIntro`) kullanıcı isteğiyle
  üç dilden kaldırıldı (aynı gün).

## Faz 4 — kategori adları EN/RU (2026-09-23 akşam)
- **Neden şimdi:** üç dilli SEO taraması kategori sayfalarında (`/en/urunler/kategori/…`)
  başlık, h1 ve açıklamada Türkçe kategori adı gösterdi; talep meta
  açıklamasında da ("· Vidalar ·"). Kategori adı en yaygın kalıntıydı.
- **Veri:** `Category.nameEn` / `nameRu` kolonları; tek kaynak
  `packages/db/src/seeds/category-names.i18n.tsv`. Kaynak TSV'nin adları zaten
  Türkçe (Ariba dışa aktarımı TR), küratörlü 18.627 satırın İngilizce özgün adı
  ipucu olarak var. Görünür 29 segment = 19.132 satır (L1 29 · L2 222 · L3 1.473 ·
  L4 17.408); gizli segmentler çevrilmez.
- **Üretim:** Gemini Pro TOPLU (120'lik parti, JSON dizi; kod kümesi tam olmalı,
  EN'de Türkçe harf / RU'da Kiril kapısı; hatalı parti ikiye bölünüp yinelenir),
  staging'de admin ucuyla arka planda; bitince `export-category-names-i18n`
  dosyayı depoya yazar → canlı `apply-category-names-i18n` (model yok),
  `seed-categories` de aynı dosyayı uygular (reseed çeviriyi silmez).
- **Okuma:** `categoryName(row)` / `localizeCategoryRows(rows)` +
  `CATEGORY_NAME_SELECT`; panel seçicileri `nameTr` alanında yerel adı alır.
  **Adres slug'ı Türkçe addan** (`categorySlug`, web `categoryHref`) — talep
  slug'ıyla aynı karar.
- **Dışarıda:** nitelik etiketleri (`CategoryAttribute.nameTr`, 237 satır) ve
  süzgeç değerleri; arama Türkçe. JSON-LD `inLanguage` sayfa dilinden.

