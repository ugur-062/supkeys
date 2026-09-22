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
| `pnpm i18n:sync` | `tr`de yeni/değişen anahtarları (kaynak hash) bulur, sözlükle Gemini çevirisi yazar, `machine` işaretler | betik |
| `pnpm i18n:sync --mark-reviewed <önek>` | inceleyen onayı | insan |
| `pnpm i18n:check` (CI) | orphan anahtar · ICU yer tutucu paritesi · yasaklı terim · EN kapsamı %100 (eksik + bayat = 0) · RU rapor · cırcır | CI |

İnsan incelemesi seçili yüzeylerde ve toplu: pazarlama, giriş/kayıt, e-posta, sözleşme.
Panel içi kısa etiketler makine + örneklem.

## Fazlar

| Faz | İş | Durum |
|---|---|---|
| 0 | Paket, next-intl (yönlendirmesiz), `locale` alanı + migration, Accept-Language ALS, hata mesajı çevirisi (ValidationPipe + `i18nMessage`), web köprüsü (axios toast'ları), cırcır + CI | **BU TUR** |
| 1 | `app/[locale]` yönlendirme (TR ön eksiz, `as-needed`), hreflang + dil başına sitemap, `public-paths` dil farkında, herkese açık yüzey + giriş/kayıt/onboarding metinleri, Ayarlar'da dil seçici | sonraki |
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
