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

