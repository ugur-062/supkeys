# Rothern — Bağlam Dosyası

> Bu dosya **kural** dosyasıdır: davranışı değiştiren kararlar, tek kaynaklar
> ve tuzaklar. Kararların uzun gerekçesi ve tarihçesi (Europages prompt
> serisi turları, panel revizyonları, denetim turları) →
> **`docs/history/claude-md-2026-09-09.md`** (kısaltmadan önceki tam hâl) ve
> `docs/history/CHANGELOG.md`.

## Proje
**Rothern**, AI destekli e-procurement (e-satınalma) SaaS platformu.
PratisPro/SAP Ariba tarzı B2B: alıcı için satın alma talebi → teklif toplama →
kazandırma → sipariş; tedarikçi için davet kabul + teklif verme + ürün vitrini.

**Marka:** mavi & beyaz · Inter (UI) + Plus Jakarta Sans (display) · "S" mavi
kutu + lacivert/mavi dual-tone. Palet **monokrom siyah** kalır (herkese açık
yüzeyde); lacivert/altın önerileri REDDEDİLDİ. Font yalnız Inter.
**MAVİ TONU (2026-09-19, kullanıcı):** Tailwind'in varsayılan `blue` skalası
`globals.css` `@theme`de EZİLDİ; sınıf adları aynı, yalnız değer değişti.
Aynı gün yeşil de EZİLDİ (eski teal'e kayan emerald "kapalı/ağır" bulundu).
**K-2 (2026-09-22, iki tur):** AA tonu (`#0D77CC` 4,64:1) kullanıcıya "çok
koyu" geldi → ORTA TON: `blue-600 #1E89DF` (beyaz metin 3,68:1), hover
`#0D77CC`; `emerald-600 #1A9C55` (3,54:1), hover `#168146`; 800–950
koyulaşarak sürer. Bilinçli: küçük metin AA (4,5:1) sağlanmaz, 3:1 arayüz
eşiği sağlanır; `staging-a11y.spec` `color-contrast`ı UYARI sayar, kırmızı
yapmaz (başka a11y ihlalleri yine kırmızı). Renk değiştirilecekse yine o blok
— bileşenlere hex yazma; 600'ü 3:1'in altına indirme.

## Tech Stack
- Monorepo: pnpm 10.33 + Turborepo · Node 22
- Backend: NestJS 10 + Prisma 6 + Supabase (Postgres + Auth) + kendi JWT'miz
- Frontend: Next.js 15 (App Router) + React 19 + Tailwind v4 (`@theme` CSS,
  `tailwind.config.ts` YOK) + Zustand persist + TanStack Query +
  react-hook-form + zod + sonner + lucide
- E-posta: React Email + Resend (synchronous) · Cron: NestJS Schedule
  (in-process, Redis yok) · Storage: Cloudflare R2 (S3 SDK v3)
- **Docker yok** (test DB hariç): yan servislerin hepsi managed. `pnpm dev` yeter.

```
apps/api      NestJS    :4000  api.rothern.com
apps/web      Next.js   :3000  www.rothern.com   (company + herkese açık pazar yeri)
apps/admin    Next.js   :3001  admin.rothern.com
packages/db       @rothern/db      Prisma schema + migrations + seed + scripts
packages/shared   @rothern/shared  Zod + types + helpers
packages/email    @rothern/email   React Email + Resend
packages/i18n     @rothern/i18n    Dil katalogları (ICU JSON) + çevirmen + i18n kapısı
```

`pnpm dev` (turbo, hepsi) veya `pnpm --filter @rothern/{api,web,admin} dev`.

## Test Hesapları (Dev)

Parolalar **gitignore'lı `CLAUDE.md.local`'da** — buraya GERİ YAZILMAZ.

**2026-09-11'den itibaren YEREL GELİŞTİRME = STAGING** (Supabase
`rothern-staging`, ref `tmqwyypvxxkwrxequksu`). Root `.env` staging'i gösterir;
canlı değerler gitignore'lu `.env.prod.local`'da ve YALNIZ onaylı migration
için kullanılır. Ortam tablosu ve sürüm akışı: `docs/release-process.md`.
Staging rol hesapları: `pnpm --filter @rothern/db seed-staging-roles`
(`uguray156+qa-<slug>@gmail.com`; alıcı GOLD 6 rol · tedarikçi SILVER 3 rol ·
ücretsiz STANDART).
**Staging DEMO hesapları (2026-09-15, elle gezinti için):**
`STAGING_DEMO_PASSWORD='…' pnpm --filter @rothern/db seed-staging-demo`
(`uguray156+demo-<paket>-<rol>@gmail.com`; Gold 5 rol · Silver 3 · Ücretsiz 2;
profil dolu, ürünler ONAYLI ve vitrinde; ücretsiz firma bilerek doğrulanmamış).
Şifre repoda YOK. Roller paket kurallarına uyar (satınalmacı yalnız Gold).
e2e testleri `seed-staging-roles`a dayanır, bu betiğe DEĞİL.

⚠️ **Canlı `.env.prod.local`'ı kabukta `source` ETME:** DATABASE_URL tırnaksız
`&` taşıyor, kabuk satırı arka plan komutu sanıyor, değişken kurulmuyor ve
betikler sessizce kök `.env`e (STAGING) düşüyor (2026-09-15'te "canlı" diye
koşulan kuru çalışma staging'i listeledi). Betiğe `ENV_FILE=../../.env.prod.local`
ver; `wipe-companies.ts` silme kipinde ayrıca `HEDEF=<supabase-proje-ref>` ister. Staging adresleri: `staging.supkeys.com`,
`admin.staging.supkeys.com`, `api.staging.supkeys.com`, `cdn.staging.supkeys.com`.
Git: `main` → staging (otomatik), `production` → canlı (PR ile).

| Tip | URL | E-posta |
|-----|-----|---------|
| Firma (alıcı+satıcı tek hesap) | localhost:3000/company/login | firma@demo.com · firma2@demo.com · firma3@demo.com |
| Admin | localhost:3001/admin/login | admin@rothern.com |

Demo pazar yeri hesapları: `<key>@demofill.local` (bkz. `seed-marketplace-demo`).
E-postalar Resend test domain'inden GERÇEKTEN gönderilir → kayıtlı gerçek adres kullan.

---

## Önemli Mimari Kararlar

1. **2 auth realm'i:** Company (`apps/web /company/*` — TEK firma hesabı hem
   alıcı hem satıcı, iki portal `satinalma`/`satis`) + Admin. JWT `type:
   "company" | "admin"`; cookie `rk_company`/`rk_admin` (+ `rk_csrf`/
   `rk_admin_csrf`). Her realm'in kendi store'u + axios + 401 interceptor'ı.
   Cross-token = 401 "Geçersiz token tipi".
2. **Multi-tenant izolasyon:** tüm sorgular tenantId scope'unda, servis seviyesinde.
3. **Firma self-signup VAR:** signup → e-posta doğrulama (6 hane, hesap-bazlı
   5/saat) → onboarding (yalnız Kurucu) → panel içi kapılar. **Kayıt için admin
   onayı GEREKMEZ.** Davetle katılım (firma-kullanıcı + referral/dış davet) ayrıca var.
4. **Bağlantı modeli:** firmalar arası invite/accept/blok; ilan görünürlüğü
   PUBLIC/CONNECTIONS/PRIVATE — tek kaynak `listing-visibility.ts`.
5. **Kapalı zarf:** teklifçiler birbirinin teklifini ASLA göremez; ilan sahibi
   her zaman görür. Non-owner dalı `invitations`/`bids`/`bidStats` içermez.
6. **SUBMITTED bid editlenmez VE geri çekilemez.** Tek yol: alıcı eleme yapar
   (LOST) → tedarikçi yeniden teklif verir (version++). WITHDRAWN legacy.
   **Geçerliliği dolmuş teklif KAZANDIRILAMAZ (2026-09-19):** `award`/
   `awardByItem` `bidValidUntilMs` ile 400 döner, ekranda Kazandır pasif +
   ipucu (uzatma iste / yeni tur). Pazarlıkta geçerlilik süresiz → etkilenmez.
7. **Kazandırma kalıcı:** toplu veya kalem bazlı → Tender AWARDED + Order
   (`ORD-YYYY-NNNN`). Geri alma (un-award) YOK. **TEK İSTİSNA (2026-09-19
   inceleme İ-1, kullanıcı kararı):** satıcı siparişi REDDEDİNCE
   `revertAwardAfterRejection` (orders service, bypass client — çapraz-firma
   yazma) reddeden teklifi LOST'a çeker (eliminatedAt + gerekçe); talebin
   başka canlı siparişi yoksa talep AWARDED→IN_AWARD (awardedAt null) ve
   kazandırmayla kaybetmiş teklifler (LOST ∧ eliminatedAt yok ∧ aynı tur)
   SUBMITTED'a döner — alıcının kendi elediği ve eski tur teklifleri ellenmez.
   Kalem bazlı kazandırmada öteki sipariş sürüyorsa talep AWARDED kalır.
   Sözleşme: `order-workflow.spec` "İ-1".
8. **Ana akış RFQ.** İngiliz usulü açık eksiltme ("Pazarlık") ikincil akış.
9. **Body parser 5MB**; belgeler R2 presigned URL ile.
10. **Audit log append-only.** AI agent event-bus ileride.
11. **Siparişte belge yükleme YOK:** platform muhasebe arşivi değil. Kalan:
    ödeme bildir/onayla/reddet, IBAN snapshot, LC adımları BEYAN olarak.

---

## Ürün Dili — "ihale" DEĞİL

Kullanıcının gördüğü hiçbir yerde **"ihale" geçmez**. İki portal, İKİ ayrı sözcük:

| Bağlam | Sözcük |
|--------|--------|
| Satınalma — firmanın KENDİ talepleri | **talep** ("Taleplerim") |
| Satış — başkalarının talepleri | **talep** ("Açık Talepler") |
| Satış — firmanın sattıkları | **ürün** ("Ürünlerim") |

Satış tarafına "satın alma talebi" demek TERSTİR. Ziyaretçi için ÜÇÜNCÜ
çerçeve: "Alım Talepleri" / "Ürünler" (iyelik kipi yok).

- Tek kaynaklar: `lib/company/portals.ts` `MODULE_LABELS`,
  `lib/company/terms.ts` `ENTITY_LABELS`/`entityLabels(isSatis)`,
  `lib/public/marketplace.ts`.
- **Türkçe:** talep → **talebi/talebe/talebin**; çoğul taleplerini. "talepi" yazma.
- **Ürün ≠ ilan:** ilan süreli işlemdir, ürün kalıcı vitrindir.
- Kilit testleri: `no-entity-leak.test` (sihirbaz dosyalarında sabit
  "ihale"/"Satın Alma Talebi" dizesi kalamaz), `lib/public/public-terms.test.ts`
  (public dizinlerde "ihale/e-ihale/Satışçı" arar).
- **DEĞİŞMEYEN (bilinçli):** kod adları (`IhaleListView`, `components/ihale/`,
  `isIhale`), kod yorumları, `docs/audit-*.md` (tarihsel kayıt), `/company/ilan/[id]`
  rotası. Eski rotalar `next.config.ts` `redirects()` ile **308** (gönderilmiş
  e-postalardaki CTA kırılmasın).
- Rol adları (Satışçı / Satın Almacı) ürün sözlüğüdür, panelde kalır.

**Satış ilanı KALDIRILDI (2026-09-04, kullanıcı kararı).** `ListingType` tek
değerli `ALIM` (kolon ve `type:"ALIM"` süzgeçleri çalışsın diye kaldı); forward
açık artırma, taban/hemen-al fiyat, `/satilik`, `/ilan/*`, satış raporları ve
Hemen Al sistemden tamamen çıktı (migration `20260904200000`). Firma ne
sattığını **ürün vitriniyle** gösterir, alıcı **talep** açar; tek yön.
`SATISCI` rolü, `sell:*` izinleri ve `/company/satis` portalı DURUYOR.

---

## Kayıt Ülkeleri — SEKİZ ülke

Tek kaynak `@rothern/shared` `data/country-profiles.ts`. Gerekçe:
`docs/plan-country-registration.md`.

TR (6 belge) · **XN KKTC** (ISO'da kodu YOK, dış sistemlere gönderilmemeli) ·
RU · AZ · KZ · UZ (ortak yabancı temeli) · CN (营业执照 tek belge → vergi belgesi
istenmez) · AE (Trade License zorunlu, vergi belgesi değil).

AB ve Afrika bilinçli KAPALI (VIES yazılı ve hazır; AB açmak profil eklemek).
**Doğrulama ülkeden bağımsız ve istisnasız MANUELDİR** — `VERIFIED` yalnız
admin `setVerification` ile yazılır, otomatik onay yolu hiç yok.

**KİMLİK ALANLARI HERKESE ZORUNLU, BİÇİM ÜLKEYE GÖRE (2026-09-14, kullanıcı:
"bu evrensel bir sistem, yurtdışı yurtiçi firması diye bir şey yok").**
`company-docs.service.ts` `submit()` tek bir `if (isTR)` taşıyordu: yabancı
firmadan sicil no, banka bilgisi ve hesap sahibi HİÇ istenmiyordu ve ekran
"Yurt dışı firmalarda bu alanlar zorunlu değildir" yazıyordu. Sicil BELGESİNİ
sekiz ülkenin hepsinde isteyip numarasını istememek tutarsızdı. Artık:
sicil/kayıt no + banka + hesap sahibi **her ülkede zorunlu**; MERSİS yalnız
TR'de ÇİZİLİR (başka ülkede karşılığı YOK — "opsiyonel" değil); banka alanı
`CountryProfile.usesIban` ile ayrışır — IBAN ülkelerinde mod-97 (`ibanChecksumOk`,
TR'de `isValidIbanTr`), RU/UZ/CN'de serbest biçimli hesap numarası ama yine
zorunlu. Sözleşme: `foreign-verification.spec.ts`.

Kapı YALNIZ YENİ KAYDA uygulanır: `COUNTRIES` (98) kısaltılmadı; mevcut
firmaların ülkesi gösterilebilmeli, adres defterinde her ülke seçilebilmeli.

**TALEP GÖRÜNÜRLÜK ÜLKESİ — YURTİÇİ/ULUSLARARASI KAPSAMI KALKTI (2026-09-21,
kullanıcı kararı: "tüm alım talepleri görülsün herkese; sadece belirli
ülkelerde de açabilsin").** Tek kaynak `@rothern/shared`
`helpers/listing-scope.ts`: `Listing.targetCountries` BOŞ = tüm ülkeler
(varsayılan), dolu = yalnız o ülkeler (sahibin ülkesi listede olabilir).
`countryCanSee` görünürlük (`sellerVisibleWhere`, `isCountryEligible`,
belge servisi, bağlantı firma talepleri, kategori eşleşme bildirimi) ve
herkese açık dizin `?ulke=` süzgeci/facet'i bundan okur. `isInternational`
kolonu KURAL TAŞIMAZ, yalnız türetilir (`deriveIsInternational`: "yalnız
kendi ülkesi" değilse true) — eski projeksiyonlar/DTO bozulmasın diye durur,
DTO'da gelen değer yok sayılır. **Şartlar ülkeye göre süzülmez:** ödeme
şekli (akreditif/vesaik/açık hesap/çek/senet) ve kısmi peşin her talepte
serbest; teslim şekli tek listede (yurtiçi merdiveni + Incoterm). Adalet
teslim NOKTASINDAN gelir: platform varsayılanı "adrese teslim"
(`REQUEST_DEFAULTS_FALLBACK.deliveryTerm = DOMESTIC_DELIVERED`, kapıya
inmiş fiyat); teslim noktası tedarikçi kapısıysa (EXW/FCA/FAS/FOB/yurtiçi
fabrika-ambar) ve talep birden fazla ülkeye açıksa `sellerDoorPriceWarning`
formda ve Ticari şartlar panelinde uyarır; Gelen Teklifler'de yabancı
tedarikçinin ülkesi rozetle görünür (`bidderCountry`). Açık Talepler
merdiveninde **aynı ülke** kategori eşleşmesinden sonra sıra sinyali
(`sameCountry`), eleme değil. `RequestDefaults.isInternational` →
`targetCountries` (eski JSON `normalize` ile dönüşür: yurtiçi → [firma
ülkesi]). Talep Şartları formu "Görünürlük ülkesi: Tüm ülkeler / Seçili
ülkeler" (+ ülke çipleri); kartlarda `ScopeChip` ("Tüm ülkeler" · "Yalnız
Türkiye" · "Türkiye, Almanya" · "Türkiye +3 ülke"). Veri dönüşümü
`pnpm --filter @rothern/db backfill-listing-scope` (yurtiçi+boş hedef →
[sahip ülkesi]; uluslararası+boş → tüm ülkeler kalır). Sözleşmeler:
`auction-hardening.spec` teslim şekli testi, web `form-schema.test`,
`request-defaults.test`, `list-filter-params.test`.

**KYC kapısının yeri — prensip: doğrulama, PLATFORMUN KEFİL OLDUĞU yerde istenir.**

| Aksiyon | VERIFIED şart mı |
|---------|------------------|
| Gezinme · bağlantı · mesaj · TASLAK | ❌ |
| **Davetli/bağlantılı** talebe teklif | ❌ (alıcı firmayı tanıyor) |
| PUBLIC talebe tanımadan teklif | ✅ (+ SILVER) |
| Talep yayınlama · kazandırma | ✅ (+ GOLD) |
| Paket satın alma | ✅ **TEK ŞART** (2FA ve web sitesi 2026-09-15'te kalktı) |
| Sipariş kabulü | ❌ bugün (platform parayı taşımıyor; **escrow gelirse buraya taşınmalı**) |

Belgesiz teklif veren firma alıcıya **"Doğrulanmamış firma"** ibaresiyle görünür.
Sözleşme: `kyc-bid-gate.spec.ts`.

---

## Çok Dillilik (i18n) — Faz 0 + Faz 1 (herkese açık yüzey ve kimlik akışı) TAMAM (2026-09-23)

Plan ve fazlar: **`docs/plan-i18n.md`**. Dil seti TR (kaynak) + EN + RU;
Çince/Arapça sonra. Terim: "talep" → EN **Request** (asla "tender"), RU
**запрос** (asla "тендер") — sözlük `packages/i18n/src/glossary.json`.

- **Geliştirici YALNIZ `tr` yazar.** Anahtar + Türkçe metin
  `packages/i18n/src/messages/tr/<ad-alanı>.json` (web `common`+`web`, API
  `common`+`api`+`email`). Anahtarlar kararlı ve alan bazlı
  (`web.settings.language.label`); Türkçe metin anahtar DEĞİL.
- **MAKİNE ÇEVİRİSİ YOK (kullanıcı kararı 2026-09-23, "Gemini Flash
  bağlama"):** EN/RU metinleri **Claude** yazar — fazlar sırasında ekran
  bağlamıyla TR ile birlikte; ICU çoğul (`{n, plural, one {…} other {…}}`)
  EN/RU'da gerekir, TR'de gerekmez. `pnpm i18n:sync` yalnız eksik/bayat
  anahtarları listeler (`--out`), `--apply <dosya>` uygular ve `reviewed`
  işaretler, `--mark-reviewed <önek>` onaylar. Sonradan insan eliyle eklenen
  dizeler için ayrı çözüm bulunacak; Flash'a geri dönülmez.
- **Eksik çeviri ekranı bozmaz:** çalışma zamanı `ru → en → tr` düşer
  (`messagesFor`). Anahtar `tr`de de yoksa anahtar yolu görünür (geliştirici hatası).
- **CI kapısı `pnpm i18n:check`:** orphan anahtar · ICU yer tutucu paritesi ·
  yasaklı terim · **EN %100 (eksik + bayat = 0)** · RU rapor · **cırcır**:
  dosya başına sabit Türkçe literal sayısı tabanı AŞAMAZ, yeni dosya SIFIR
  olmalı (`ratchet:update` yalnız düşürür; artış `--force` ister ve incelemede
  görünür). Sezgisel Türkçe ÖZEL harfe bakar (ç ğ ı ö ş ü); "Kaydet" gibi
  ASCII sözcükleri görmez — bilinçli sınır.
- **Dil kullanıcıda:** `CompanyUser.locale` (`/me` döner, `PATCH company-auth/me
  { locale }` yazar). Web `NEXT_LOCALE` çerezine yansıtır (`LocaleCookieSync`)
  ve her API isteğine `Accept-Language` koyar; API `LocaleMiddleware` → ALS
  (`currentLocale()`), başlık desteklenen dil vermediyse JWT stratejisi kullanıcının
  kayıtlı dilini uygular. Bildirim/e-posta ALICININ dilini kullanır (Faz 3).
- **API'de metin:** `tApi("api.validation.required")` ya da DI `I18nService`;
  istisna için `throw new BadRequestException(i18nMessage("api.business.expired",
  undefined, "BID_EXPIRED"))` (istek dilinde mesaj + `code` + `i18nKey`).
  class-validator VARSAYILAN mesajları `translateValidatorMessage` ile istek
  dilinde; DTO'daki elle `message:` dizeleri Faz 3'e kadar Türkçe kalır (sınıf
  tanımında değerlenir, dil bilmez → fonksiyon biçimine geçecek).
- **YÖNLENDİRME (Faz 1, 2026-09-23): tüm sayfalar `src/app/[locale]/`
  altında.** Türkçe ÖN EKSİZ (`/urunler`, bugünkü her adres aynen), diğer
  diller ön ekli (`/en/urunler`, `/ru/company/…`); `localePrefix: "as-needed"`,
  **otomatik dil tespiti KAPALI** (`localeDetection: false` — Googlebot `/`den
  `/en`e atılmaz, kök sayfa önbellekli kalır); dil seçici ve panelde
  `LocaleUrlSync` (üyenin kayıtlı dili ≠ adresteki dil → aynı sayfayı doğru
  ön ekle açar) tek geçiş yolu. Yol PARÇALARI çevrilmez (`/en/urunler`,
  `/en/products` değil — `pathnames` her bağlantıyı tipli nesneye çevirmeyi
  isterdi). Tek kaynaklar: `src/i18n/{routing,navigation,request,href,params}.ts`.
  Kök rota işleyicileri (`api`, `sitemaps`, `sitemap.xml`, `robots.ts`,
  `llms*.txt`, `indexnow`) ve `global-error.tsx` `[locale]` DIŞINDA kalır;
  middleware bunları ve uzantılı dosyaları next-intl'e SOKMAZ (soksa
  `/tr/sitemap.xml`e yazılıp 404 olur).
  **ÖN YÜKLEME İSTEKLERİ DE MIDDLEWARE'DEN GEÇER (2026-09-23 akşam):** `matcher`
  `Next-Router-Prefetch` / `Purpose: prefetch` isteklerini muaf tutuyordu (CSP
  nonce optimizasyonu); TR adresler ön eksiz olduğu için `<Link>` ön yüklemeleri
  `/tr/…` yeniden yazımından geçmeyip `[locale]="urunler"` gibi yanlış eşleşiyor,
  `/urunler?_rsc=…` 404 dönüyor, tıklamada "Sayfa bulunamadı" açılıyordu.
  `missing` bir daha EKLENMEZ; `src/middleware.test.ts` kilitler.
- **`next/link` ve `next/navigation` YASAK yerler:** `Link`, `useRouter`,
  `usePathname`, `redirect`, `permanentRedirect` HER ZAMAN `@/i18n/navigation`
  dan (ön ek otomatik; `usePathname` ön eksiz döner). `useSearchParams`,
  `useParams`, `notFound` `next/navigation`da kalır. `permanentRedirect({ href,
  locale })` nesne alır. `window.location.href = "/company/…"` yerine
  `localizePath(path, runtimeLocale())`; yol karşılaştırmasında `stripLocale`.
  `<a href="/…">` iç bağlantı `no-html-link-for-pages` lint'ini kırar → `Link`.
  Testlerde `vitest.setup.ts` `@/i18n/navigation`ı Next'in hook'larına geçirir
  (dosya bazlı `next/navigation` sahteleri aynen çalışır).
- **Statiklik:** `src/i18n/request.ts` YALNIZ `requestLocale` (segment) okur,
  çerez/başlık OKUMAZ → herkese açık sayfalar dil başına prerender
  (`.next/server/app/<dil>/urunler.html` üretilir). `[locale]/layout.tsx`
  `generateStaticParams` + `setRequestLocale` taşır. **Etiket tuzağı
  (ölçüldü):** derleme tablosu `[locale]` altındaki HER rotayı ● (SSG)
  etiketler, panel dahil; `force-dynamic` yine geçerlidir — kanıt: panel için
  `.html` üretilmez ve `prerender-manifest.json`da yer almaz. Etikete bakıp
  `connection()`/`cookies()` ekleme.
- **SEO:** `buildMetadata({ …, locale })` kanonik = o dilin adresi,
  `alternates.languages` tr/en/ru + `x-default` (tr), `og:locale`; her herkese
  açık `page.tsx` `generateMetadata({ params })` + `localeFromParams`. Varlık
  üreticileri `productSeo/companySeo/listingSeo(input, { locale, t })`. Sitemap
  her URL'de `<xhtml:link hreflang>` (üç dil + x-default; `located()` tek
  yardımcı), robots `/en/`·`/ru/` izin + `/en/company/` vb. yasak,
  `next.config` yönlendirmeleri `withLocales` ile üç dilde.
- **React dışı yerde** (axios interceptor, zod hata haritası) `tRuntime(
  "common.errors.*")` — köprü (`I18nRuntimeBridge`) yoksa Türkçe `common`
  yedeği. Katalogun tamamını istemciye gömme (üç dilin metni paket boyutunu
  şişirir): kök `@rothern/i18n` hafiftir, kataloglar `@rothern/i18n/messages`,
  çevirmen `@rothern/i18n/translator` alt yollarından gelir.
- **Testler:** web `vitest.setup.ts` next-intl'i TR katalogla SAHTELER —
  bileşen testleri sağlayıcısız koşar, Türkçe beklentiler değişmez. API jest
  `@rothern/i18n`'i **dist**'ten okur (use-intl yalnız ESM; paket build'i
  çevirmeni esbuild ile CJS'e gömer) → testten önce
  `pnpm --filter @rothern/i18n build` ŞART.
- **Yeni workspace paketi ÜÇ yere eklenir** (2026-09-23'te yakalandı):
  `apps/api/Dockerfile` (`COPY packages/<ad>/package.json` + build satırı),
  `apps/web/vercel.json` `buildCommand`, jest `moduleNameMapper`. Biri
  unutulursa yerel yeşil, dağıtım kırmızı.
- **FAZ 1 KAPSAMI (2026-09-23, 9 parti):** pazarlama başlığı/altbilgi,
  anasayfa iki yüz, pazar yeri dizinleri/süzgeçleri/kartları/detay sayfaları,
  Hakkımızda · İletişim · SSS · Nasıl Çalışır, talep-onayla/davet-kapat/şifre
  sıfırlama, giriş · kayıt · şifremi unuttum · ekip daveti · firma doğrulama
  sihirbazı, dil seçici (üst çubuk küre menüsü + mobil menü + altbilgi) ve
  Ayarlar › Hesap Bilgileri › Dil (anında `PATCH me { locale }` + aynı sayfa
  yeni ön ekle). **Panel metinleri Faz 2** (cırcır tabanı 433 dosya / 6.194
  literal; hepsi panel/admin/API).
- **Sunucu sayfası kalıbı:** `generateMetadata` → `getTranslations({ locale,
  namespace })`; gövde `await getTranslations("web.…")`; bağlantılı cümle
  `t.rich("key", { faq: (c) => <Link …>{c}</Link> })` — çeviride sözcük sırası
  değişince bağlantı yerini kaybetmesin. Kırıntı: `breadcrumbNode(items,
  locale)` (adres o dilin ön ekiyle, ad `web.marketing.breadcrumbHome`).
- **İstemciye GİTMEYEN ad alanları** (`src/i18n/client-messages.ts`
  `SERVER_ONLY_NAMESPACES`: `web.marketing.{about,contact,faq,legal,
  inquiryVerify}`): kök düzen `NextIntlClientProvider messages={clientMessages(…)}`
  ile ayıklar; `client-messages.test` "use client" dosyalarını tarar — bir
  istemci bileşeni bu ad alanından okursa kırmızı (çalışma zamanında ham anahtar
  basardı). Listeye ekleme = o testi koşmak. (`web.seo` listede DEĞİL: ürün/
  talep detayı ve panel formlarının parçacık önizlemesi istemcide okur.)
- **`server-only` ZİNCİR TUZAĞI (2026-09-23, staging 3 dağıtım kırmızı):**
  `src/i18n/server.ts` `server-only` işaretli (katalog yükleyici istemciye
  girmesin). İstemcide de çizilen paylaşılan bir modül (`lib/seo/entities.ts`
  → `product-detail`, `listing-detail`, ürün formu, Profilim) onu import
  edince `next build` kırılır; vitest/tsc/lint GÖRMEZ. Kural: paylaşılan
  üreticiler çevirmeni PARAMETRE alır — `productSeo/companySeo/listingSeo(
  input, { locale, t })`; sunucuda `t: seoT(locale)` (i18n/server.ts),
  istemcide `t: useSeoT()` (i18n/domain.ts). Sayı biçimi `i18n/format.ts`
  (saf). `@/i18n/server`ı yalnız sayfalar, rota işleyicileri, `faq-data`,
  `og/content` import eder. Kökten herkese açık yüzeye dokunan değişiklikte
  yerel `pnpm build` ŞART.
- **Sözleşme metinleri YALNIZ TÜRKÇE** (hukuki metin çevrilmez): `LegalDoc`
  EN/RU'da üstte "Türkçe metin esastır" notu basar, gövde `lang="tr"`, JSON-LD
  `inLanguage` tr-TR; yalnız kabuk ve meta çevrilir; `updatedAt` ISO tarih.
- **Paket kartı metni katalogda** (`web.pricing.plans.*`, pazarlama sayfası
  `usePricingPlans`); panel Faz 2'ye kadar `PRICING_PLANS`i okur ve
  `plans-i18n.test` iki kaynağı BİREBİR tutar (özellik sayısı dahil). Segment
  sloganları `web.marketing.taglines.s<kod>` + `useSegmentTagline`.
- **SSS tek kaynak `faqGroups(locale)`** (`sss/faq-data.ts`): sayfa, `FAQPage`
  JSON-LD ve `llms-full.txt` (TR) aynı fonksiyondan; `faq.test` üç dilde
  kalite kapısı (soru "?" ile biter, cevap ≥120 karakter, fiyat yazmaz).
- **Kimlik akışı ortak parçaları:** `usePasswordRules` + `PasswordStrength`,
  `ConsentRows` (kayıt ve davet kabul kopyaları birleşti); zod şemaları
  `useMemo(() => makeSchema(t), [t])` ile dil bilen. Dil seçici etiketleri
  dilin KENDİ adıyla ve çevrilmez (`LOCALE_LABELS`). Üst çubukta
  `useSearchParams` YOK (statik sayfada Suspense ister) — sorgu `window`dan
  efektte okunur.
- **Faz 1'de düzeltilen bayat vaatler:** Nasıl Çalışır "teslim belgesi"
  (sipariş belgesi 2026-08-22'de kalktı) ve "sınırsız kullanıcı" (koltuk 2/4/6)
  metinden çıktı; "ilan" → "talep" (alıcı yüzü).
- **KULLANICI İÇERİĞİ OTOMATİK ÇEVRİLİR (Faz 1e, 2026-09-23, kullanıcı kararı
  "her eklenen otomatik çevrilsin", motor Gemini PRO — pilot gerçek staging
  içeriğiyle ölçüldü, Flash DEĞİL):** ürün (ad, açıklama, anahtar kelime,
  nitelik etiket/değer), alım talebi (başlık, açıklama, kalem adları, anahtar
  kelime), firma profili (tanıtım, hizmetler, sektör). Tablo
  `content_translations` (migration `20260923180000`; varlık × dil satırı,
  `sourceHash`, `fields` JSON; kaynak dilin satırı `fields=NULL`). Modül
  `modules/content-translation/` — `logic.ts` SAF (istem, doğrulama, üzerine
  yazma), `service.ts` (kuyruk + Gemini + okuma), 5 dk süpürücü cron,
  `admin/content-translations/{status,backfill}` (SUPER_ADMIN).
  Tetikler fail-open `void this.translations?.enqueue(...)`: ürün onayı
  (tekli/toplu), yayındaki ürünün vitrin güncellemesi, talep yayını / eski
  onay akışı / güncelleme / yeni tur (`listingChanged` yanına), profil kaydı
  (tanıtım/hizmet/sektör). Kaynak değişince hash değişir → yeniden; aynı
  kaynak ikinci kez ÇEVRİLMEZ.
  **Uydurma kapısı:** kaynaktaki her SAYI hedefte de olmalı (binlik ayraç
  normalize), liste alanları aynı uzunlukta; ihlalde bir düzeltme turu, yine
  bozuksa FAILED (≤3 deneme). Sözlük: talep → request/запрос, tender YASAK.
  **Okuma:** herkese açık uçlar `currentLocale()` (Accept-Language) ile
  `localize{Products,Listings,Companies}` — DONE satır yoksa özgün metin;
  `translatedFrom` alanı gelir, web `AutoTranslatedNote` "Otomatik çeviri
  (kaynak: Türkçe)" basar. Bunun için `PUBLIC_*_SELECT`lere `id` girdi —
  mapper'lar yanıta YAZMAZ (anonimlik sözleşmesi korunur); `relatedProducts`
  `ids` döner, herkese açık uç soyar. Web `marketplace-api.ts` her isteğe
  `accept-language` (next-intl `getLocale`, rota işleyicisinde tr) koyar —
  Next veri önbelleği başlığı anahtara katar. Arama v1'de ÖZGÜN metinde
  (İngilizce sorgu Türkçe adı bulmaz — sonraki adım). Firma bütçesine
  yazılmaz; maliyet satırda (`costUsd`). **Ölçüldü (staging backfill
  2026-09-23, 168 kayıt, Vertex `gemini-3.1-pro-preview`):** toplam 8,16 USD;
  düşük thinking ile kayıt başına ≈ 4 sent (varsayılan thinking ile ≈ 8,5
  sent), ~5 kayıt/dk. Kategori adları ayrı (Faz 4).
  Sözleşme: `test/unit/content-translation.spec.ts` (yerel PG yoksa
  `--globalSetup=<noop>` ile koşulur).
  **Kategori adları da üç dilde (Faz 4, aynı gün) — bkz. Kategori Kataloğu.**
  **JSON-LD `inLanguage` sayfa dilinden** (`LANG_TAG`); sözleşmeler tr-TR kalır;
  `WebSite` düğümü üç dili listeler.
- **BAŞTAN AŞAĞI TARAMA (2026-09-23 gece, kullanıcı: "her şeyi kontrol et,
  çeviri kusursuz olmalı"):** herkese açık 20 yolun SSR metni EN/RU'da Türkçe
  harf sezgiseliyle tarandı (`tr-leftover-scan.py`, özel adlar hariç). Kapanan
  kalıntılar: hero dekor kartları (`hero-decor.tsx` başlık/ipucu artık
  `web.marketing.heroDecor.*` anahtarı, `HeroDecor` `t.has` ile çevirir),
  firma faaliyet tipi (`useActivityLabel` — `companyActivityLabel` herkese açık
  bileşende KULLANILMAZ), ülke adları (`countryDisplayName` — telefon kodu listesi,
  firma kartı, bayrak başlığı, profil), `CompanyProfileView` metinleri
  (`web.marketplace.profile.*`; panel de aynı bileşen), ölçü birimleri
  (`useUnitLabel`, `web.domain.unit.<KOD>`; ürün kartı/detayı, talep kalemleri),
  firma dizini kart önizleme ürün adları (`buildDirectory` `opts.localizeProducts`),
  talep sayfasındaki alıcı sektörü (`localizeListingCompanies`, firma çevirisinden),
  nitelik ETİKETLERİ + SEÇENEKLERİ (Faz 4b: `CategoryAttribute.nameEn/nameRu/
  optionsEn/optionsRu`, migration `20260923235000`; `ResolvedAttribute.nameTr`
  yerel etiket + `optionLabels`; facet `values[].label`; TSV
  `category-attribute-names.i18n.tsv` + `apply/export-category-attribute-names-i18n`;
  toplu iş `admin/content-translations/categories/attributes/backfill`).
  **Giriş dili hesaba yazılır:** `useCompanyLogin.onSuccess` giriş sayfasının
  dili ≠ kayıtlı dil ise `PATCH me { locale }` (yoksa `LocaleUrlSync` paneli
  eski dile atıyordu — kullanıcı bulgusu "İngilizce seçtiğim hâlde her şey
  Türkçe"); kayıt ve davet kabulü `locale: currentLocale()` ile doğar.
  **Şehir adları üç dilde (2026-09-24):** `@rothern/shared`
  `TR_PROVINCE_NAMES_I18N` (81 il; EN = İngilizce Vikipedi yazımı — yalnız
  Istanbul/Izmir/Hakkari aksansız, kalanı Türkçe imla; RU Kiril, Стамбул) +
  `provinceDisplayName(raw, locale)`; web `cityDisplayName`/`useCityLabel`
  (`i18n/domain.ts`). Bağlı yerler: SEO üreticileri (`entities.ts` başlık/
  açıklama/JSON-LD `addressLocality`), OG kartları, şehir açılış sayfası
  başlığı/h1/özne, kart/detay/typeahead, süzgeç facet ETİKETLERİ ve aktif
  çipler (anahtar ham TR adı kalır — `?sehir=` değeri değişmez). Tanınmayan
  şehir (yabancı, ilçe) olduğu gibi; Türkçede ham metin. Sözleşme
  `i18n/__tests__/city-display.test`. **Serbest metin ölçü birimi:**
  `unitCode`süz üründe `unit` metni çeviri kaynağına girer ve çevrilir; kodlu
  birim katalogdan (`useUnitLabel`). **Talep yayını sahibinin firma profilini
  de kuyruğa alır** (`enqueue("LISTING")` → sahip COMPANY; backfill de
  sahipleri kapsar) — talep sayfasındaki alıcı sektörü firma çevirisinden.
  Bilinçli kalanlar: ürün/firma ÖZEL ADLARI ve yabancı şehirler, sözleşme
  metinleri (TR), panel arayüz metinleri (Faz 2), arama Türkçe. Süzgeç kenar çubuğu etiketi
  ürün dilinde "Süzgeçler" (Faz 1'de "Filtreler" yazılmıştı; e2e onu arar).
  **MODEL ADI TUZAĞI (2026-09-23, staging'de ölçüldü):** Vertex AI
  `gemini-pro-latest` alias'ını TANIMAZ (404 NOT_FOUND) — Generative Language
  API tanır. Render'daki `AI_MODEL_PREMIUM=gemini-pro-latest` bu yüzden
  Vertex'te ÇALIŞMAZ (premium yükseltme yolu da). Çeviri servisi aday
  listesiyle kendini kurtarır (`CONTENT_TRANSLATION_MODEL` → premium →
  `gemini-3.1-pro` → `-preview` → `gemini-2.5-pro`; 404 alan elenir, çalışan
  hatırlanır; `status` ucu çalışan modeli gösterir). Kalıcı çözüm Render
  env'inde Vertex'in tanıdığı Pro adı.
- **PANEL DE OKUYUCUNUN DİLİNDE (Faz 1e kapanış, 2026-09-23 akşam, kullanıcı:
  "kalemler çevrilmemiş"):** başka firmanın verisini okuyan panel uçları da
  çeviri servisinden geçer — `company/listings/seller-tenders` (başlık +
  `itemNames`), teklifçi `getOne` dalı (başlık/açıklama/anahtar/kalem adı),
  `company/items/discover*` (kart adı/özet/özellik satırı + detay),
  `company/directory/search` ve `companies/:rothernId` (tanıtım/hizmet/sektör).
  Dil `currentLocale()`: Accept-Language ya da JWT'deki kayıtlı dil. KENDİ
  verisi (sahip dalı, kendi profili/ürünü) HAM kalır — sahibi düzenler. Panel
  talep detayı `AutoTranslatedNote` basar; ürün/profil sayfaları paylaşılan
  gövdeyle zaten basıyor. **Yeni çapraz-firma okuma ucu = `localize*` çağrısı.**
- **TALEP ADRESİ DİLDEN BAĞIMSIZ (aynı tur):** `/en/talep/<slug>` = `/talep/<slug>`
  — slug KAYNAK başlıktan; API her talep yanıtında `slug` verir, web
  `listingHref(l)` kullanır (`listingPath(number, title)` yalnız yedek/test).
  Çevrilmiş başlıktan slug üretmek sitemap hreflang'ında 308 zinciri ve Kiril
  düşünce çıplak RU slug'ı (`rot-000007`) üretiyordu — staging'de ölçüldü.
  Ürün/firma slug'ı zaten donuk sütun. Sözleşme: `listing-page.test`,
  `marketplace.test` "listingHref".

---

## Konvansiyonlar
- Validation: react-hook-form + zod (web), class-validator (API DTO). Hata
  mesajları Türkçe. `<Field error hint>` sarmalama.
- Button: primary | secondary | ghost · sm | md | lg. Toast: sonner top-right, richColors.
- `<RequireAuth>` / `<RequireAdminAuth>` boundary; component yolu `@/components/*`.
- API çağrıları `useQuery`/`useMutation` + axios instance.
- **Auth = httpOnly cookie oturum** (token JS'ten OKUNMAZ). Zustand persist
  YALNIZ UI snapshot'ı (`user`/`company`) tutar, token DEĞİL. Kimlik `/me` ile.
  Mutating isteklerde CSRF double-submit (`rk_csrf` → `X-CSRF-Token`).
  **STAGING AYRI KAYITLI ALAN ADINDA (2026-09-15, kullanıcı kararı "tamamen
  ayrılsın"):** `staging.supkeys.com` · `admin.staging.supkeys.com` ·
  `api.staging.supkeys.com` · `cdn.staging.supkeys.com` (2026-09-16: CDN de
  taşındı — canlı çerezleri artık staging'in HİÇBİR konağına gitmiyor; kayıtlı
  adresler `rewrite-image-host` betiğiyle güncellendi). Staging e-postaları
  ayrı gönderen alan adından çıkar (`staging@supkeys.com`) — rothern.com'un
  gönderen itibarı staging trafiğinden etkilenmesin. Gerekçe: canlı çerezleri `.rothern.com` alanında; staging
  `staging.rothern.com`dayken tarayıcı canlı `rk_csrf`i staging'e de
  gönderiyor, web ilk API son kopyayı okuyup kayıtta "CSRF doğrulaması
  başarısız" veriyordu. Önce `rks_` ön ekiyle yamandı, alan adı taşınınca yama
  SÖKÜLDÜ. **Staging'i yeniden `rothern.com` altına ALMA.**
  **Kayan oturum:** `AuthCookieInterceptor` ömrün yarısı geçince taze token basar.
- **KOYU MOD (2026-09-11, kullanıcı kararı):** ürün arayüzü her zaman AÇIK —
  `dark` variant'ı class tabanlı (`.dark` hiç eklenmez) ve `:root` `color-scheme:
  light` (web + admin) → OS koyu temasında native kontrol/scrollbar da açık kalır.
  Doğrulandı: 14 sayfa `colorScheme: "dark"` emülasyonuyla tarandı, koyu kutu/
  kontrol yok. **E-POSTA AYRI DÜNYA:** Gmail/Apple Mail zemini ve metni ters
  çevirir ama GÖRSELİ ÇEVİRMEZ; `prefers-color-scheme`/CSS `filter` çoğu
  istemcide çalışmaz. Bu yüzden e-posta logosu KENDİ beyaz yuvarlak kart
  zeminini taşır (`packages/email/scripts/build-email-logo.mjs` → `src/assets/
  logo.ts`). Logoyu değiştirirken scripti yeniden koş; şeffaf zeminli siyah logo
  koyu modda KAYBOLUR (2026-09-11'de canlıda görüldü).
- **"parola" DEĞİL "şifre" (2026-09-10 kararının kalanı 2026-09-11'de kapandı):**
  giriş, kayıt, davet ve şifre sıfırlama ekranları dahil kullanıcı metinlerinin
  hepsi "şifre"; kod içi değişken adları (`password`) değişmez.
- **MONO FONT YOK (2026-09-10, kullanıcı kararı):** talep/sipariş numarası, IBAN,
  kod, Rothern ID dahil hiçbir yerde `font-mono` kullanma ("robotik" görünüm);
  rakam hizası gerekiyorsa `tabular-nums`. Tema `--font-mono` Inter'e eşli
  (web + admin) → `<code>`/`<kbd>` de Inter basar.
- Küçük metinde `text-zinc-400` KULLANMA (beyazda 2,6:1) — en az zinc-500.
- Gri zeminde `bg-zinc-50` yasak (brand-50 = sayfa zemini); tint min zinc-100.
- **Zemin zinc-100 ise metin en az `text-zinc-600`** — zinc-500 orada 4,39:1
  kalır (dizin sayfalarının zemini zinc-100). Beyaz üstünde zinc-500 yeterli.
- **Erişilebilirlik kapısı:** `e2e/staging-a11y.spec.ts` 12 sayfada axe koşar,
  **critical + serious** ihlalde kırmızı. Tuzaklar: `role="row"` tablo bağlamı
  olmadan KRİTİK ihlaldir; `<dl>` altında yalnız `dt`/`dd`/`div` olabilir
  (ikon ya da ipucu sarmalayıcısı `<dd>` İÇİNE alınmalı).

## Tek Kaynaklar — dokunmadan önce buraya bak

> Denetim boyunca en sık tekrar eden hata: **helper yazılır, çağrı yerlerinin
> bir kısmı bağlanmaz** ve iki hesap sessizce ayrışır.

| Konu | Tek kaynak |
|------|-----------|
| İzin kataloğu / hazır setler / türetme | `@rothern/shared` `constants/company-permissions.ts` |
| Paket kademeleri / koltuk limitleri | `@rothern/shared` `helpers/tier.ts` |
| Firma alanı menüsü (Şirketim) | `lib/company/portals.ts` `COMPANY_AREA` |
| İlan görünürlüğü | `common/company/listing-visibility.ts` |
| Efektif paket (INV-TIER-1) | `common/company/effective-tier.ts` |
| Public profil + ürün kapısı | `common/company/public-profile-gate.ts` |
| Bağlantı geçerliliği | `common/company/valid-connection.ts` |
| Firma dizini | `common/company/company-directory.ts` `buildDirectory` |
| Ürün dizini süzgeç/sıra/facet | `common/company/product-index.ts` |
| İlişkili ürün blokları | `common/company/related-products.ts` |
| Ürün skoru + yayın kapısı | `@rothern/shared` `helpers/product-completion.ts` |
| Kategori nitelik çözümleyici | `common/company/category-attributes.ts` |
| Kategori ata zinciri / ön ek | `@rothern/shared` `category-code.ts` (`categoryPrefix`) |
| Model kategori ipucu → kod (AI) | `modules/ai/category-hint-resolver.ts` |
| Katalog seçimi (discovery/tam) | `@rothern/shared` `constants/category-catalog.ts` |
| Arama katlama + tokenleme + kök | `@rothern/shared` `helpers/search-fold.ts` (`stemPrefix`) |
| Para/kur bazı · kalem toplamı · ödeme durumu | `common/company/{report-currency,bid-items,order-payments}.ts` |
| Teslim SÜRESİ → tarih | `common/company/delivery-time.ts` |
| Faz O dar-bağlam | `common/company/full-read-context.ts` |
| Web derin bağlantıları (CTA) | `common/company/app-routes.ts` |
| Public görsel yükleme · metin kalitesi | `common/company/{public-image-upload,public-text-quality}.ts` |
| Yüklenen tablo dosyası okuma | `common/files/spreadsheet-reader.ts` |
| İçe aktarma sütun/limit (talep kalemi · teklif) | `@rothern/shared` `item-import.ts` / `bid-import.ts` |
| IBAN (TR + yabancı mod-97) | `@rothern/shared` `ibanChecksumOk` / `isValidIbanTr` |
| Ölçü birimi · faaliyet tipi · kayıt ülkesi | `@rothern/shared` `constants/{units,company-activities}.ts`, `data/country-profiles.ts` |
| Görünürlük katmanı (public) | `lib/public/visibility.ts` (`VISIBILITY`, `canSee`, `loginHref`) |
| Pazar yeri sözcükleri/rotaları · yayın anahtarı | `lib/public/{marketplace,marketplace-live}.ts` |
| Panel pazar adresleri (satınalma `PANEL_MARKET`, satış `SELLER_MARKET`, portal seçici `marketCompaniesPath`) | `lib/company/panel-market.ts` |
| Süzgeç URL şemaları | `lib/public/{product,listing,company}-filter-params.ts`, `lib/company/request-filter-params.ts` |
| Süzgeç kabuğu + yapı taşları | `components/marketplace/{filter-shell,filter-primitives}.tsx` |
| Panel liste süzgeçleri (durum ÇOKLU seçim) | `components/list/{filter-select,filter-multi-select}.tsx` — durum süzgeçleri `FilterMultiSelect` (dizi; `?status=A,B`), tek seçimli olanlar `FilterSelect` (2026-09-10 kullanıcı kararı) |
| KPI seçicileri (pano ↔ listeler) | `lib/company/kpi-selectors.ts` |
| Profil tamamlanma | `@rothern/shared` `profileCompleteness` (10 madde; "Fotoğraflar" 2026-09-10'da kalktı) |
| Ayarlar sayfaları başlık/açıklama/adres (hub kartı = sayfa kabuğu) | `lib/company/settings-pages.ts` `SETTINGS_PAGES` — `SettingsShell page={…}`; uzun açıklama `description` ile ezer |
| Doğrulama durumu etiketi + KYC kilidi (web) | `lib/company/verification-status.ts` (`verificationMeta`, `isKycLocked`) — hub rozeti, Doğrulama ve Firma Bilgileri aynı sözlük; backend `LOCKED_KYC` = name·legalName·mersisNo·tradeRegistryNo·ibanHolder (+IBAN), PENDING/VERIFIED'da |
| Paket adı · fiyat · özellik listesi (pazarlama + panel Paketler + satın alma) | `apps/web` `lib/pricing/plans.ts` (`PRICING_PLANS`) |
| Para birimi sembolü · tarih · para gösterimi (web) | `lib/tenders/labels.ts` · `lib/format-date.ts` · `components/ui/money.tsx` |
| İzin aynası (web) | `lib/company/permissions.ts` |
| Herkese açık adres şeması (ürün/firma/talep/kategori/şehir) | `@rothern/shared` `helpers/public-paths.ts` (web `lib/public/{marketplace,city}.ts` yeniden dışa aktarır) |
| Sayfa metası + JSON-LD + tanım cümlesi | `lib/seo/meta.ts` `buildMetadata` · `lib/seo/entities.ts` `{product,company,listing}Seo` |
| OG/Twitter kartı içeriği ve çizimi | `lib/seo/og/{content.ts,card.tsx}` |
| Sitemap parçaları · XML | `lib/seo/sitemap-parts.ts` · `lib/seo/sitemap-xml.ts` (API `public-sitemap.service.ts`) |
| Önbellek etiketleri (web ⇔ API) | `lib/seo/tags.ts` ⇔ `modules/seo-index/seo-index.service.ts` `SEO_TAGS` |
| Arama görünürlüğü puanı (ürün/firma/talep) | `@rothern/shared` `helpers/seo-readiness.ts` |
| Dil listesi · varsayılan · çerez adı · düşüş zinciri · `Accept-Language` müzakeresi | `@rothern/i18n` `locales.ts` (`LOCALES`, `DEFAULT_LOCALE`, `LOCALE_COOKIE`, `negotiateLocale`) |
| Çeviri katalogları (tr kaynak) · terim sözlüğü + yasaklı sözcükler · cırcır tabanı | `packages/i18n/src/messages/<dil>/*.json` · `src/glossary.json` · `baseline/hardcoded.json` |
| İstek dili (API) · çevirmen · anahtarlı istisna | `common/i18n/{locale-context,i18n.service,http-i18n}.ts` (`currentLocale`, `tApi`, `i18nMessage`) |
| React dışı çeviri köprüsü (web) · dil çerezi | `src/i18n/{runtime,locale-cookie}.ts` (`tRuntime`, `effectiveClientLocale`) |

---

## Kategori Kataloğu (Ariba, BİREBİR)

**4 seviye** (Segment/Family/Class/Commodity), `Category.id = 8 haneli kod`,
hiyerarşi koddan türer.

**İKİ katalog, TEK tablo:** talep/ilan kategorisi **discovery** alt kümesini
(158.005), firma kategori beyanı **tam** kataloğu (158.018) kullanır. Fark
yalnız L4'te (13 yaprak + 31 kodda ikinci ad) → ayrı tablo yok, `Category.
inDiscovery` bayrağı. **Çakışan 31 kodda DISCOVERY'nin adı kazanır** (ad iki
katalogda AYNI olmalı, yoksa eşleştirme alakasız iki ürünü çiftler); düşen ad
`keywords`e yazılır, arama yine bulur. Liste: `docs/category-duplicate-codes.md`.

**Kaynak birebir, gösterim Türkçe.** `ariba-categories.tsv` kısaltılmaz/
gizlenmez; Türkçeleştirme ÜSTÜNE binen ayrı katmandır
(`category-translations.curated.tsv`: `<kod> ⇥ <TR ad> ⇥ <kaynak ad>` — 3.
sütun kaynağın o anki hâli, diff'lenebilsin). Aynı katman kaynak KUSURLARINI da
düzeltir (yanlış element sembolü, yazım, dallar-arası çakışan 36 ad) →
`docs/category-source-defects.md`.

> Kaynak TSV'ye YAZILMAZ: `import-ariba-csv.ts` onu her koşumda CSV'lerden
> yeniden üretir; oraya yazılan düzeltme sessizce kaybolur.

Kapsam: L1 (58) · L2 (558) · L3 (7.966) · L4 çekirdek (15.231) %100 TR; kalan
134k yaprak kaynak dilinde (bilinçli — arama İngilizce özgün adı da bulur).

**Ad TEKİLLİĞİ çeviri katmanının en tehlikeli hatasıdır** (iki farklı İngilizce
ad aynı Türkçe karşılığa düşerse eşleşme sessizce bölünür):
`check-category-translations.ts` çakışma bulursa **exit 1**, uygulama koşmaz.
Tuzak: "İngilizce mi?" sezgiseli `-lar`/`-ler` arıyordu → collar, chiller,
controller, trailer, modular "zaten Türkçe" sanıldı (226 satır atlandı).

**Arama:** TR-katlanmış `searchText = fold(nameTr + " " + keywords)`,
TOKENLİ (kelimelere bölünüp AND'lenir), Türkçe ek toleranslı (`stemPrefix`).
`pg_trgm` GIN indeksi (`20260902100100`) — trigram ≥3 karakterde çalışır.
`searchText` kod tabanında YALNIZ aramada kullanılır; eşleştirmede/bildirimde/
yetkide DEĞİL.

**Kapı BACKEND'de:** `validateListingBusinessRules` → `level ≥ 3 ∧ inDiscovery`.
`catalog` query parametresi yalnız hangi ağacın GÖSTERİLECEĞİNİ seçer.
Sözleşme: `category-catalog.spec.ts`.

**Seçim seviyeleri:** talep/ilan min L3 (discovery) · firma ANA kategori exact
L1 (tam) · firma ALT kategori L2-4 (tam) · AI önerisi 2 aşamalı → L3.
Ana ve alt AYRI eksen; eşleştirme (`deriveCategoryMatchCandidates`) koddan tüm
üst seviyeleri türetir.

**Tavanlar TEK KAYNAK (2026-09-14):** `@rothern/shared`
`MAX_COMPANY_MAIN_CATEGORIES = 5` · **seçim** tavanı `MAX_COMPANY_SUB_PICKS = 50`
· **depolama** tavanı `MAX_COMPANY_SUB_CATEGORIES = 200` (ata zinciri dahil).
İki sayı AYRI: tek sayı olsaydı 50 yaprak seçen kullanıcı zincir genişlemesiyle
tavanı aşıp anlamsız hata alırdı.
Öncesinde ana kategori tavanı ÜÇ AYRI değerdi — kayıt DTO'su 3, ayarlar ekranı
10 (`maxSelection` prop'u hiç geçilmemiş, varsayılan), ayarlar DTO'su 50 →
`validateCategorySelection`'ın "1-3" kuralı ayarlar yolunda HİÇ çalışmıyordu.
Sözleşme: `test/unit/company-category-limits.spec.ts` (sayıyı değil İLİŞKİYİ
kilitler). Ayrıca ayarlar ucunda **iki eksen birden boşalamaz** — kategori
alanına dokunan istek firmayı sıfır kategoriyle bırakamaz (sıfır kategorili
firma hiç bildirim almaz ve sebebini hiçbir ekranda göremezdi).

**ARAYÜZ TEK SORU SORAR (2026-09-14, kullanıcı: "frontendi hoş değil"):** ekran
aynı ağaçtan iki kez seçim istiyordu (L1 modalı + L3-4 modalı + çip duvarı =
üç etkileşim deseni). Artık TEK seçim var; kullanıcı **L2-L4 arası hangi
derinlikte düşünüyorsa orada** seçer (`CompanyCategoryPicker`).

**SEÇİM ↔ DEPOLAMA AYRI — tek kaynak `helpers/company-category-selection.ts`:**
seçilen kodun ATA ZİNCİRİ de beyana yazılır (L2+L3+L4 → `*SubCategoryIds`,
L1 → `*CategoryIds`). Gerekçe ölçüldü: eşleştirme ata zincirini **talebin**
kodundan YUKARI çıkarıyor (`deriveCategoryMatchCandidates` → `categoryAncestors`),
firmanın beyanından AŞAĞI inmiyor; talepler ise en az L3. Zincir yazılmasaydı
`39121614` beyan eden firma, alıcı `39121600` talebi açtığında dar eksende
eşleşmez ve geniş eksene (segmentin TAMAMI) düşerdi — daralttığını sanırken
genişlerdi. Gösterim `deepestCategoryPicks` ile yalnız kullanıcının seçtiklerini
çizer (türetilmiş üstler ayrı çip olmaz; zincir breadcrumb'da okunur).

Kural: seçim eklenince zincir + segment belirir · seçim silinince zinciri gider
ve o segmentte başka seçim kalmadıysa **segment de düşer** (aksi hâlde tek
yaprağı silen firma sessizce segmentin tamamından bildirim almaya başlardı) ·
segment silinince altındakiler de gider. Bütün sektörde çalışan firma için
"Sektör geneli ekle" kaçış yolu (yaprağı olmayan segment = "her şeyi yaparım").
**Kayıtta kategori ZORUNLU** — üç katman: arayüz `step2Valid`, DTO
`@ArrayMinSize(1)`, servis `validateCategorySelection`.
Kayıt ve Ayarlar AYNI bileşeni kullanır (`CompanyActivityPicker` de öyle).
Sözleşmeler: `company-category-picker.test.tsx` · `company-category-selection.spec.ts`.

**Dizin facet'i (2026-09-14 düzeltildi):** süzgeç DÖRT diziye bakıyordu ama
sayaç yalnız iki ana diziyi okuyordu → alt kategorisiyle eşleşen firma listeye
girip SAYIYA girmiyordu. Sayaç artık dört diziyi okuyor ve alt kodları
**segmentine yuvarlıyor** (ham sayılsaydı facet 158 bin kodluk bir liste
üretirdi; facet gezinme aracıdır, kod sayımı değil).

**Kayıt TEK soru sorar, dört alana yazar** (`company-auth.service.ts`
completeOnboarding: `mainIds` → buyer+seller, `subIds` → her iki sub). Bilinçli:
yeni kullanıcı alışı satıştan ayıracak durumda değil. Ayrıştırma Ayarlar ›
Kategoriler'de ("Ne alırım" / "Ne satarım") ve kayıt ekranının ipucu metni
bunu SÖYLER.

**İKİNCİ EKSEN — faaliyet tipi:** `Company.activities` (tavan 3, tek kaynak
`company-activities.ts`) kategori NE'yi, faaliyet tipi NASIL'ı söyler.
2026-09-14'e kadar YALNIZ süzgeç/facet'ti — `company-listings.service.ts`,
`company-affinity.service.ts` ve `supplier-discovery.service.ts` içinde
`activities` SIFIR kez geçiyordu, çünkü alıcının tercihini söyleyeceği alan
yoktu. Eklendi: **`Listing.preferredActivities`** (migration
`20260914120000`, tavan `MAX_COMPANY_ACTIVITIES`, boş = fark etmez).
**ELEME DEĞİL SIRALAMA** — uyan firmalar duyuruda (`notifyCategoryMatchedCompanies`,
kararlı sıra: ilgi düzeni korunur) ve Açık Talepler merdiveninde (`activityMatch`,
kategoriden sonra ilgi skorundan önce) ÖNE alınır; uymayan ELENMEZ. Sert süzgeç
tipini eksik beyan etmiş firmayı görünmez yapar ve o firma bedelini asla
göremezdi. Herkese açık talep sayfasında "Aranan tedarikçi tipi" olarak görünür
(talebin NİTELİĞİ, sahibinin kimliği değil).

**Nitelik matrisi MİRASLI:** `CategoryAttribute` üst düğümde tanımlanır, alt
düğümler devralır (aynı `groupKey` daha spesifik düğümde varsa O kazanır) —
158.018 kategoriye tek tek satır yazmadan. 58/58 segment dolu (237 nitelik /
59 düğüm). Doldurulmamış dalda form nitelik SORMAZ ve akış çalışır.

**Koşum sırası (canlı):**
```bash
pnpm --filter @rothern/db import-ariba-csv -- <tum-csv> <discovery-csv>   # sıra ÖNEMLİ
ALLOW_REMOTE_MIGRATION=1 pnpm --filter @rothern/db migrate:deploy
pnpm --filter @rothern/db seed-categories            # tek tx, sil+kur (FK yok → seçimler korunur)
npx tsx prisma/scripts/check-category-translations.ts # çakışma varsa exit 1
npx tsx prisma/scripts/apply-category-translations.ts # reseed'siz canlıya yazmak için
pnpm --filter @rothern/db apply-category-keywords     # opsiyonel
pnpm --filter @rothern/db seed-category-attributes    # seed-categories'ten SONRA
```
Sözlük önceliği: üretilen dosya ÖNCE, elle yazılan SONRA → insan kararı kazanır.
`import-ariba-csv` fail-loud (L1/L2/L3 ayrışması, öksüz düğüm → durur).

> ⚠️ `cleanup-categories` bu akışın **PARÇASI DEĞİL** (segment gizler, ad
> değiştirir → birebir garantisini bozar). `gen-category-leaves` **SİLİNDİ**.

**Kürasyon:** sonuçsuz aramalar `category_search_misses`'e → admin paneli.

**Nitelik etiketleri/seçenekleri de üç dilde (Faz 4b, 2026-09-23 gece):** bkz. Çok Dillilik § Baştan aşağı tarama.

**KATEGORİ ADI ÜÇ DİLDE (i18n Faz 4, 2026-09-23):** `Category.nameEn` /
`nameRu` (migration `20260923230000`, NULL = çeviri yok → Türkçeye düşer).
Tek kaynak `src/seeds/category-names.i18n.tsv` (`kod ⇥ EN ⇥ RU`): staging'de
Gemini Pro TOPLU işi üretir (`POST admin/content-translations/categories/
backfill`, 120'lik partiler, kod kümesi + Kiril/Türkçe-harf kapıları, hatalı
parti ikiye bölünür; `GET …/categories/status`), sonra
`pnpm --filter @rothern/db export-category-names-i18n` dosyayı depoya yazar;
`seed-categories` ve `apply-category-names-i18n` oradan okur — CANLIDA MODEL
ÇAĞRISI YOK. Kapsam: görünür 29 segmentin tüm satırları (19.132), gizli
segmentler çevrilmez. **Okuma kuralı:** kategori satırı seçilirken
`...CATEGORY_NAME_SELECT`, yanıta dönüşürken `categoryName(row)` ya da toplu
`localizeCategoryRows(rows)` (`common/company/category-name.ts`; dil
`currentLocale()`). Herkese açık uçlar, `categories/*` (panel seçicileri
`nameTr` alanında YEREL adı alır — alan adı geriye dönük), Açık Talepler,
ürün keşfi, dizin/profil bağlı. **ADRES SLUG'I HER ZAMAN TÜRKÇE ADDAN**
(`categorySlug`): API kategori nesnelerine `slug` verir, web `categoryHref(c)`
kullanır — `/en/urunler/kategori/<kod>-<tr-slug>`. Arama (`searchText`) ve
`nameTr ILIKE` yine Türkçe; nitelik ETİKETLERİ (`CategoryAttribute.nameTr`) ve
süzgeç değerleri henüz çevrilmedi (küçük, sonraki adım). Sözleşme:
`test/unit/category-name.spec.ts`, `category-translation.spec.ts`, web
`marketplace.test` "categoryHref".

**KATALOG SADELEŞTİRME — 29 SEGMENT GİZLİ (2026-09-19, kullanıcı kararı:
"endüstriyel, inşaat, sanayi tarzı şeyler hariç gereksiz kategorileri
kaldır").** Satır SİLİNMEDİ (birebir garantisi ve `seed-categories` akışı
aynen); tek kaynak `@rothern/shared` `category-catalog.ts`
`HIDDEN_SEGMENTS` (ilk iki hane) + `isHiddenCategory` + `hiddenCategoryWhere`
(Prisma `NOT startsWith`). `categoryCatalogWhere` artık bu parçayı da
döndürür → `childrenOf`/`searchHierarchical` otomatik süzer; ayrıca
`getAllActive`, `getSegments`, `validateIds`, firma beyanı
(`category-selection.helper`), talep kapısı (`company-listings`), herkese açık
arama önerisi/facet/sayaç (`public-marketplace`), sitemap segmentleri, dizin
facet'i (`company-directory`), AI kategori ipucu/önerisi ve web'de
`category-showcase.ts` (satınalma + herkese açık anasayfa vitrini,
`SHOWCASE_ORDER` sanayi odaklı), `/urunler/kategori/<kod>` ve panel kategori
sayfası (gizliyse 404) hepsi buradan okur. Gizlenenler: 10 42 43 44 45 48
49 50 51 52 53 54 55 56 57 60 64 70 80 82 83 84 85 86 90 91 92 93 94
(≈137 bin yaprak, kataloğun %86'sı). Kalan 29: malzeme 11 12 13 14 15 30 31
32 · makine/ekipman 20 21 22 23 24 25 26 27 39 40 41 46 47 · hizmet 71 72 73
76 77 78 81 · 95. Canlıda o tarihte sıfır firma/ürün/talep vardı → veri
taşıma gerekmedi. Geri almak = listeden çıkarmak. Eşleştirme/bildirim eski
beyanlara dokunmaz; admin kategori ekranı süzmez (tam katalogu görür).
Sözleşme: API `test/unit/hidden-segments.spec.ts`, web `category-showcase.test`.

**Kategori fotoğrafları:** 58/58 segment, `apps/web/public/categories/<kod>.webp`
(CC0/PDM, künye `docs/category-photo-credits.md`). Gerçek fotoğraf YALNIZ iki
yerde: **ürün** (firma yükler) ve **kategori**. **Satın alma talebi fotoğraf
TAŞIMAZ** — tonlu segment ikonunda kalır. Tek kaynak `category-photos.ts`.
**Firma profili GALERİSİ KALDIRILDI (2026-09-10, kullanıcı kararı):** Profilim
ve herkese açık profil fotoğraf bölümü çizmez, yükleme yolu yok; `Company.
photos` kolonu duruyor (migration yok), web göndermez. Logo/kapak/sertifika
görselleri kalır.

**Firma profili SERTİFİKA bölümü KALDIRILDI (2026-09-17, kullanıcı kararı):**
Profilim ve herkese açık profil "Sertifikalar" bölümünü çizmez, düzenleme slotu
yok; `Company.certifications`/`certificateImages` kolonları duruyor (migration
yok), kayıt gövdesi göndermez. Pazar yeri kartlarındaki sertifika çipleri
DOKUNULMADI (ayrı yüzey).
**TALEP SATIRI v3 (2026-09-19, kullanıcı mockup'ı "alım talep boxlarını bu
şekilde yap"):** `ListingCard row` (panel satış/satınalma listeleri, firma
sayfası açık talepleri, herkese açık `ListingTeaserRow`) — sol kenar portal
renginde kalın şerit (`strip` verilmezse), başlıkta belge ikonu karosu
(portal tonu) + numara pili + `text-lg` başlık + eşleşme çipleri; sağ üstte
durum pili (+ `menu` ⋮ isteğe bağlı); metrik şeridi ikon karolu sütunlar
(`factIcon`: firma/alıcı · kalem · kapsam · kapanış kırmızı + kalan süre pil
altında · kategori mavi) dikey ayraçlarla; altta "Detayları göster" oku
(erişilebilir adı yine "Kalemleri göster") ve büyük dolgulu "Teklif ver"
(uçak ikonu). **Boyut ESKİ satırla aynı** (aynı gün, kullanıcı: "çok büyük
yapmışsın"): px-3 py-2.5, başlık 13 px, etiket 10 px, değer 13 px, ikon
karoları küçük (size-8 / size-7). `dense` pano widget'ı eski tek satır.
Kategori FOTOĞRAFI yine yok. Sözleşme: `listing-card-footer.test`,
`home-faces.test`.
**TEKLİFLERİM KARTI v2 (2026-09-19, kullanıcı mockup'ı; "hepsinde mor yapma,
şu anki renklere sadık kal"):** `my-bids-list.tsx` `MyBidCard` — kalın sol
şerit ve durum pili STATÜYE göre (Değerlendirmede mor · Kazandı yeşil · Taslak
amber · Elendi gri), numara pili | "Açık Talep" mavi çip, `text-xl` başlık,
ikon karolu "Alıcı" · dikey ayraç · mavi tutar pili · taahhüt; alt satır
ayraçlı: takvim "Verildi", sağda gri geri sayım pili (saat ikonu).
**Taleplerim satırı sütunları (2026-09-19 akşam, kullanıcı: "teklifler ve
davetli yerlerini değiştir"):** `IhaleListRow` metrik şeridi Sorumlu ·
**Teklifler** (bağlantı) · Kapsam · Yayın · Kapanış · Kategori; **Davetli**
sağ alt metrikte. Sözleşme: `ihale-list-row.test`.
**Talep satırı alt çizgisi (2026-09-17, kullanıcı kararı):** `ListingCard row`
alt satırında kalem açma düğmesi EN SOLDA — **yazısız, yalnız aşağı ok**
(`size-5`, slate-600, hover zemin; erişilebilir adı "Kalemleri göster/gizle"),
"Teklif ver" EN SAĞDA ve `text-sm` (eskiden "Kalemler ⌄" ve eylem sağda yan
yana, 11 px); Teklifim metriği ortada.
**ÖNİZLEME PANEL İÇİNDE (2026-09-17, aynı gün ikinci karar, kullanıcı:
"önizleme yapınca sistemden çıkıp anasayfaya dönüyor"):** Profilim'deki
"Profilimi önizle" artık `/company/firma/<RothernID>` (üyenin gördüğü sayfa,
aynı `CompanyProfileView`, panel kabuğu içinde, AYNI sekme). Herkese açık
`/firma/<slug>` yeni sekmede pazarlama üst çubuğuyla (Giriş Yap / Kaydol)
açılıyor ve oturum kapanmış hissi veriyordu. Profil kaydı
`["company-directory","profile"]` sorgusunu da düşürür (dizin kopyası 5 dk
bayat kalırdı). `?onizleme=1` yolu DURUYOR (herkese açık sayfayı taze
görmek isteyen için), Profilim ona bağlanmaz.
**Herkese açık sayfa önbelleksiz görünüm:** `/firma/<slug>?onizleme=1` sayfa o parametreyle profil + ürünleri
`cache: "no-store"` çeker (ISR 5 dk + etiket tazeleme; tazeleme kanalı Render
`SEO_REVALIDATE_SECRET` girilmemişse HİÇ çalışmaz → sahibi az önce yüklediğini
göremezdi). Şablon aynı, yalnız veri tazedir. **Asıl kök neden ikinciydi:**
`SafeCoverImage` görseli `opacity-0` başlatıp `onLoad`da açıyordu; sunucu
HTML'iyle gelen görsel React bağlanmadan yüklenince olay hiç ateşlenmiyor,
kapak yüklü ama görünmez kalıyordu (staging'de naturalWidth 1102 / opacity 0
ölçüldü) → mount sonrası `img.complete` denetimi. Kural: SSR'lı `<img onLoad>`
ile durum kurma, hidrasyon sonrası `complete`i de oku. Not: staging web Vercel
Authentication arkasında (Pro'yla geldi) — curl 302 `vercel.com/sso-api`
döner, e2e `x-vercel-protection-bypass` ile geçer.
**Profilim düzeni (2026-09-10):** SOLDA profil (başkalarının gördüğü hâl,
`CompanyProfileView layout="stacked"` — tek sütun, yerinde düzenleme), SAĞDA
yapışkan ray (`Profil durumu` %tamam + eksikler + "alıcıların sizi bulması
için" → `SearchVisibilityCard` → Ürünlerim). **"Ziyaretlerim karşı tarafa
görünsün" anahtarı raydan ÇIKTI (2026-09-19, kullanıcı: "profil kısmında
saçma duruyor")** → Şirketim › Ziyaret Edenler sayfasının başında
`VisitsVisibilityCard`, anında kaydeder (`visitsVisible`). Ürün formuyla aynı
kalıp; xl altında ray profilin altına iner. Herkese açık sayfa `columns`
düzeninde, değişmedi.

---

## Paketler, İzinler, Koltuk

### Üç paket
Tek kaynak `@rothern/shared` `helpers/tier.ts` (`TIER_ORDER` STANDART<SILVER<GOLD,
`PAID_TIER="SILVER"`, `BUYING_TIER="GOLD"`, `SEAT_LIMITS` 2/4/6). Bronz KALDIRILDI.

| Paket | Ne | Koltuk |
|-------|----|--------|
| STANDART (ücretsiz) | profil + 50 ürünlük vitrin + dizinde yer (paketlilerden SONRA); davetli/bağlantılı talebe teklif, mesaj, sipariş; **PUBLIC talepleri GÖRMEZ**, bağlantı daveti gönderemez, gelen bilgi talebi ANONİM | 2 |
| SILVER (satış paneli) | dizinde öncelik + "Doğrulanmış", sınırsız ürün + belge/video, PUBLIC talep görme/teklif, bağlantı daveti, bilgi talebi kimliği+yanıt, Ziyaret Edenler, İş Analizi, satış AI'ı | 4 |
| GOLD (iki panel) | Silver + satınalma paneli (talep açma, kazandırma, onay akışı, raporlar, şablonlar, talep AI'ı) + "Gold Üye" | 6 |

Kapı: `CompanyPaidTierGuard` + `@RequireTier("GOLD")` (varsayılan SILVER).

**PAKETE GEÇİŞİN TEK ŞARTI DOĞRULAMA (2026-09-15, kullanıcı kararı).** Önce üç
şart vardı (VERIFIED + 2FA + web sitesi); ikisi kaldırıldı — ekran (`premium-gate.tsx`)
ve backend (`upgradeToPremium`) AYNI turda, ayrışsalardı ekran "hazır" der
sunucu reddederdi. **2FA neden çıktı:** kapı yalnız yükseltme ANINDA bakıyordu,
kullanıcı ertesi gün `disableTwoFactor` ile kapatabiliyordu → onay kutusuydu,
kontrol değil. Gerçekten isteniyorsa yeri KAZANDIRMA ve FATURA işlemleridir
(sürekli denetlenir) — ödeme turunda oraya konmalı.

**DOĞRULAMA ÜCRETSİZ VE PAKET SATMADAN TEŞVİK EDİLİR:** "Doğrulanmış" rozeti
`companyVerificationStatus`tan gelir, pakete BAĞLI DEĞİL. Üç yüzey paket değil
ROZET satar: Profilim sağ rayındaki "Ücretsiz doğrulanın" kartı, Ayarlar
hub'ındaki kart açıklaması, Doğrulama sayfasının giriş metni.

⚠️ TEST TUZAĞI (2026-09-15'te yakalandı): `upgradeToPremium` testlerinden biri
YANLIŞ SEBEPLE yeşildi — factory firmayı VERIFIED doğurduğu için doğrulama
kapısı hiç tetiklenmiyordu; yeşil kalan şey 2FA hatasıydı ve mesajı
("iki adımlı **doğrula**mayı") `/doğrula/i` desenine uyuyordu. Kademe/durum
sınayan test koşulu AÇIKÇA kurmalı.
Fiyatlar (Silver 160 / Gold 230) kullanıcı kararı BEKLİYOR.

**PROFİL OTOMATİK YAYINDA + AYRI İNDEKS KAPISI (2026-09-15, kullanıcı kararı
"profiller otomatik yayına alınsın").** Kayıt tamamlanınca `publicEnabled=true`
ve slug kurulur (`company-auth.service.ts` completeOnboarding — signup'ta DEĞİL,
firma adı ancak orada gerçek oluyor). Slug tek kaynak
`common/company/company-slug.ts` (Profilim'in "ilk kez yayınla" yolu da onu
okur; iki kopya P2002 üretirdi).

**VİTRİN ≠ İNDEKS profil tarafında da:** `isProfileIndexable` (tek kaynak
`public-profile-gate.ts`) = anlamlı tanıtım metni (`looksLikeProse`) ∧ (logo ∨
web sitesi ∨ yayında ürün). Sitemap (`listPublicSlugs`) ve sayfanın `robots`
etiketi AYNI fonksiyonu okur — ayrışsalardı sitemap'te olup `noindex` taşıyan
sayfalar üretirdik. Gerekçe ölçüldü: staging'de 26 firmanın SIFIRININ logosu
vardı; eşiksiz açmak toplu ince içerik indeksletir ve kazanmaya çalıştığımız
alan otoritesini aşındırır. Sayfa vitrinde KALIR, yalnız aramaya girmez.
Sözleşme: `profile-indexable.spec.ts` + `onboarding.spec.ts`.

**Web sitesi onboarding'de SORULUR ama ZORUNLU DEĞİL** (doğrulamada zorunlu —
bkz. Kayıt Ülkeleri). Zorunlu tutmak, sitesi olmayan ama ürün yükleyecek
imalatçıyı kapıda elerdi; o firma bizim için sitesi olup ürün eklemeyenden daha
değerli. Bedel kapıda değil sonuçta: giren firmanın profilini AI doldurur,
girmeyen elle yazana kadar indeks eşiğini geçemez.

**Ücretsiz vitrin ilkesi: görünmek ücretsiz, öne çıkmak paketli.**
`hasPublicProfile`/`publicProductWhere` PAKET ŞARTI TAŞIMAZ; paketin karşılığı
sıralama önceliği, ürün tavanı (`PRODUCT_LIMITS`, publish anında 403) ve
belge/video (`PRODUCT_MEDIA_TIER`). Kademe düşünce `enforceProductLimit` fazla
ürünü taslağa çeker (silmez). "Doğrulanmamış" etiketi yalnız PROFİLDE.

**PUBLIC talep kilidi:** `listingBidEligibility` → `{canBid, hidden}`;
`hidden` = PUBLIC ∧ bağsız ∧ davetsiz ∧ STANDART → satır sorguya HİÇ girmez,
`getOne` **403 `{code:"TIER_REQUIRED"}`** (404 değil — pazar yerinde teaser
zaten açık). İstisna: bağlıyken teklif vermiş firma (`hasBid`) bağlantı düşse de
kendi teklifinin talebini açar. Kilit kartı gerçek SAYI gösterir
(`locked-summary`), maskeli önizleme KALKTI.

### İzin modeli
**Doğruluk kaynağı `CompanyUser.permissions String[]`**; `roles` ETİKET (listeden
türetilir). Kurucu: yönetim+onay+görüntüleme+sahibe-özel ÖRTÜK; işlem izinleri
açıkça yazılır. Geçiş emniyeti: liste boş + roller dolu → rol hazır seti.

| Grup | Anahtarlar | Koltuk |
|------|-----------|--------|
| Satınalma | `buy:view` · `buy:listing:manage` · `buy:award` · `buy:order:manage` · `buy:inquiry:send` · `buy:reports:view` | görüntüleme/rapor hariç |
| Satış | `sell:view` · `sell:bid:submit` · `sell:order:manage` · `sell:product:manage` · `sell:inquiry:reply` | görüntüleme hariç |
| Onay | `approval:act` · `approvals:manage` | — |
| Yönetim | `company:manage` · `users:manage` (yalnız Kurucu VERİR) · `connections:manage` · `templates:manage` · `addresses:manage` · `insights:view` | — |
| Sahibe özel | `billing:manage` · `company:delete` · `ownership:transfer` | işaretlenemez |

- `company*` prefix'li HER handler statik `@RequireCompanyPermission` taşır
  (dizi = any-of); `company-permission-drift.spec.ts` controller metadata'sını
  okur — izinsiz handler kırmızı.
- Faz O dar-bağlam TARAF bilir: `hasReadContext(user, "buy"|"sell")`.
  **Onaylayıcı-only** üye pano/dizin/talep/sipariş/bağlantı uçlarından 403 alır
  ve talep detayını onaya bağlı olsa da GÖREMEZ — kararı için gereken her şey
  `GET company/approvals/:id` projeksiyonundadır (tedarikçi iletişim/adres TAŞIMAZ).
- Mesaj OKUMA görüntüleme iznine açık, GÖNDERME işlem izni.
- Kimse kendi rol/izin satırını düzenleyemez (Kurucu yalnız kendi işlem tikleri).
- Bildirim alıcıları izinden: `portal` → o portalı görüntüleyenler; `audience`
  (any-of) → bağlantı `connections:manage`, admin duyurusu yönetim+koltuk.
  E-posta alıcısı tek kaynak `pickCompanyRecipients`.
- Web sayfa kapıları `components/company/permission-gate.tsx` (`PermissionGate`).
- **Ayarlar denetimi (2026-09-10):** hub kartı kapısı = sayfa `layout.tsx`
  kapısı (izin; `managerOnly` yok); Firma Profili kartı düz
  `/company/sirketim/profil`. **Onay Akışları kartı AYARLAR'DAN KALDIRILDI
  (2026-09-14, kullanıcı kararı "bir daha orada olmasına gerek yok")** — aynı
  özelliğe iki giriş vardı, ikisi de aynı yere gidiyordu; tek giriş Onaylar
  sayfasının başlığındaki düğme (eski `/company/ayarlar/onay-akislari` →
  `next.config` 308 DURUYOR; `ApprovalFlowsSection` `onaylar/_components/`). Bölüm içinde sayfa
  başlığı TEKRAR EDİLMEZ (Banka, 2FA, Firma Bilgileri). Liste bölümleri
  `isError` + "Yeniden dene" taşır; Aktivite/AI 403 ile genel hatayı ayırır.
  Form hataları satır içi `<ErrorMessage>` (Hesap, Şifre, Davet). Tek
  kaynaklar: telefon `lib/company/phone.ts` `isValidPhone`, IBAN
  `isValidIbanTr`/`normalizeIban` (Doğrulama sayfası da). Doğrulama "Gönder"
  eksik listesi (`MissingFields`). Sözleşme: `ayarlar/__tests__/page.test`,
  `invite-user-dialog.test`.
- **ŞİRKETİM › GENEL BAKIŞ ve RAPORLAR TARAFA GÖRE (2026-09-17, kullanıcı
  kararı: "biri diğeri hakkında bilgi edinememeli").** API zaten ayrıktı
  (`dashboard/satinalma*` buy:view, `dashboard/satis*` sell:view,
  `action-center?portal=` hasReadContext, raporlar buy:reports:view, İş
  Analizi/Ziyaret Edenler insights:view — staging'de rol matrisiyle ÖLÇÜLDÜ).
  Web açıkları kapandı: (a) `/sirketim/raporlar` kökü Gold + buy:reports:view
  ile BÜTÜN alt sayfaları kilitliyordu → İş Analizi (SATIŞ raporu, Silver +
  insights:view) satışçıya kapalıydı; kapılar artık rapor türünün KENDİ
  düzeninde (`PurchasingReportGate` ×3, is-analizi PermissionGate+SILVER),
  kök düzen kapısız; (b) hub yetkisiz kartı hiç çizmez
  (`raporlar/__tests__/page.test`); (c) menü "Raporlar" satırı any-of
  [buy:reports:view, insights:view] + SILVER; (d) Genel Bakış'taki Ziyaret
  Edenler/İş Analizi bağlantıları insights:view'e bağlı, sorgu izinsiz atılmaz.
  KPI/sekme/aksiyon merkezi zaten `accessiblePortals` ile portala göre.
- **Firma Bilgileri (2026-09-10):** Kimlik kartı salt-okunur (firma kodu,
  kayıt ülkesi, hukuki yapı, vergi kimliği — etiket ülke profilinden, Vergi
  Dairesi/KEP yalnız TR — yetkili kimlik no MASKELİ `maskNationalId`; şahıs
  firmasında vergi no=TCKN de maskeli). **Firma adı da KYC kilidinde**
  (kullanıcı kararı: "Doğrulanmış" rozeti ada kefildir). Form yalnız DEĞİŞEN
  alanı gönderir; Kaydet kirli değilse pasif, Vazgeç, beforeunload. Sözleşme
  `company-profile-section.test`; API `company-profile.spec` "FİRMA ADI".
  Tuzak: test factory VERIFIED doğurur → "alakasız alan" olarak `name` KULLANMA.
- **Ayarlar sayfa-sayfa turu (2026-09-10, 12 sayfa):** hub grup sırası Firma
  → Kişisel; her formda hatalar SATIR İÇİ ve Kaydet kirli değilse pasif
  (Firma Bilgileri, Kullanıcı düzenle, Adres, Banka, Hesap Bilgileri);
  Kurucu olmayan yönetici kendi satırında yetki tablosunu düzenleyemez
  (backend `assertNotSelf` aynası); Kurucu vurgusu AMBER (mor yok); IBAN
  denetimi her yüzeyde mod-97 (web Banka Hesapları yabancı IBAN + API
  `company-docs.submit` eskiden gevşekti); MERSİS 16 hane; yabancı belge
  etiketleri Türkçe + İngilizce parantez; şifre/parola → her yerde "şifre".
- **Onaylar sayfası (2026-09-10 sadeleşti):** iki görünüm — "Sıra sizde"
  (`approvals/pending`, karar kartı: Onayla/Reddet/Detay) ve "Tüm istekler"
  (`approvals/all` TEK liste; çipler Tümü/Bekleyen/Başlattıklarım/Sonuçlanan
  istemcide, arama sunucuda; `history` ucu web'den ÇAĞRILMAZ, `?tab=history`
  "all"a düşer). Onay akışları sekme değil, başlıktaki düğme → `?tab=flows`
  (`ApprovalFlowsSection` aynen). Kartta Alış/Satış rozeti YOK (satış ilanı
  kalktı), adımlar `<details>` ile katlı. Sözleşme `onaylar/__tests__/page.test`.
- Yetki tablosu ekranı: `components/company/permission-table.tsx` (hazır set
  çipleri + 4 grup tik tablosu); yazma `PUT company/users/:id/permissions`.

### Koltuk = (kişi, grup)
Satınalmada bir işlem izni 1, satışta 1; aynı kişide ikisi 2. Görüntüleme/rapor/
onay/yönetim tüketmez. `seatGroupsOf` + `countSeats` (shared); kapı
`assertSeatAvailable` (davet/kabul/atama/reaktivasyon aynı kapı, bekleyen
davetler grup bazında rezerve). Düşüşte `POST company/users/seat-selection`.

**SATINALMA YETKİSİ YALNIZ GOLD'DA VERİLEBİLİR (2026-09-14, kullanıcı kararı).**
`assertSeatAvailable` artık `need: number` değil `groups: Set<"buy"|"sell">`
alıyor — sayıya indirgemek "hangi grup" bilgisini kapıya girmeden kaybediyordu
ve sekiz çağrı yerinden biri bağlanmadan kalırdı. Buy grubu isteniyorsa ve
efektif kademe < `BUYING_TIER` (GOLD; **SILVER de yetmez**, o satış paketi) →
koltuk sayımından ÖNCE reddedilir ("koltuk dolu" demek yanıltıcı olurdu).
Yetki tablosu aynasını `canGrantBuy` ile çizer.

**Kayıtta koltuk sorusu KALDIRILDI.** Eskiden signup kurucuya hem SATIN_ALMACI
hem SATISCI veriyordu ve onboarding son adımı "Bu hesapla ne yapacaksınız?"
diye soruyordu — ikisi de işaretli. Üç kusur: satınalma koltuğu ücretsiz
pakette işe yaramıyor · kurucu tek başına STANDART'ın 2 koltuğunu dolduruyor
(ilk çalışan davetinde "koltuk dolu") · karar ikinci kişi davet edilirken
doğuyor, kayıtta değil. Artık kurucu **yalnız SATIŞ** koltuğuyla doğar;
satınalma koltuğu GOLD'a geçişte `ensureOwnerBuySeat` ile açılır (self-upgrade
ve admin `setTier` yollarının İKİSİNDEN de çağrılır, fail-safe).
Sözleşme: `seats.spec.ts` "Satınalma yetkisi paket kapısı" + `onboarding.spec.ts`.

---

## Görünürlük ve Pazar Yeri

### Yayın anahtarı — İKİ yerde, ikisi de fail-closed
| Nerede | Env | Etkisi |
|--------|-----|--------|
| Web (Vercel) | `NEXT_PUBLIC_MARKETPLACE_LIVE=true` | `/` pazar yerine döner, rotalar 404'ten çıkar, robots/sitemap açılır |
| API (Render) | `MARKETPLACE_LIVE=true` | `/public/listings*` + `/public/companies/directory*` 404'ten çıkar |

Ayrı, çünkü web anahtarı yalnız SAYFALARI kapatır. Env yoksa KAPALI; yalnız
tam olarak `"true"` açar. (İkisi de 2026-09-04'te AÇILDI.)

### GÖRÜNÜRLÜK ≠ İNDEKSLENME
Ürün, firmanın zaten herkese açık profilinin ALTINDA yaşar → görünürlüğü
**profil kapısına** bağlıdır (`publicProductWhere`), pazar yeri anahtarına
DEĞİL. Anahtarın koruduğu **indekslenmedir**: ürün sitemap'i, `/urunler` dizini,
`/public/products*` anahtara tabi; `/firma/<slug>` ve tekil ürün sayfası değil.
Sözleşme `public-product.spec.ts` guard metadata'sını okur.

### İki kapı — vitrin ve indeks AYRI
Tek kaynak `listing-visibility.ts`:
```
VİTRİN = PUBLIC ∧ company.publicListingsEnabled ∧ firma aktif/bloksuz
         ∧ publishedAt ∧ embargo geçmiş
         ∧ statü ∈ {OPEN, IN_AWARD, IN_AWARD_APPROVAL, AWARDED, CLOSED_NO_AWARD}
İNDEKS = vitrin ∧ listing.publicIndexable ∧ statü = OPEN
```
`CLOSED` (admin moderasyonu) ve `CANCELLED` vitrine bile ÇIKMAZ. Kapanmış ilan
sitede DURUR (gelen bağlantı kırılmasın) ama `noindex` alır.

### İLAN SAHİBİ ANONİM
Herkese açık talep sayfasında firma adı/logosu/profil bağlantısı GÖSTERİLMEZ;
`PUBLIC_LISTING_SELECT` bir **beyaz listedir** (listelenmeyen kolon Prisma'dan
hiç dönmez) ve JSON-LD'de `Organization` düğümü YOKTUR. Gerekçe: "kim alıyor"
rekabet istihbaratıdır. Gösterilen: şehir, ülke, sektör, faaliyet tipi —
kimlik değil nitelik.

**Kalem ADLARI herkese açık (2026-09-18, kullanıcı kararı: "kalemlerin neler
olduğu gözüksün, firma bilgisi zaten gizli"):** `items[].name` projeksiyonda;
marka/açıklama/şartname/ekli belge ve alıcı kimliği yine dışarıda. Herkese
açık talep sayfasının üstündeki kategori görsel bandı da kaldırıldı. **Talep
kartlarında HİÇBİR YERDE kategori görseli/tonlu ikon yok** (aynı gün, kullanıcı:
"her yerden tamamen kaldır") — `ListingCard` tile/row ve herkese açık kart
yalnız numara + başlık + sütunlar; `imageMode` prop'u geriye dönük duruyor.
DIŞARIDA ayrıca: teklifler **ve teklif SAYISI** · `targetPrice` · pazarlık
tabanı · `terms`/`paymentNote` (serbest metin, IBAN taşıyabilir) · logistics/
adresler · `internalNotes` · cuid id'ler. `description` DAHİL.
Sözleşme `public-marketplace.spec.ts` yanıt ağacını gezip yasaklı anahtar arar.

Firma adının herkese açık göründüğü tek yer `/firma/<slug>` profilidir (opt-in
`publicEnabled`, her pakete açık).

### Üye ↔ ziyaretçi TUTARLILIĞI
**Üye, ziyaretçinin gördüğü her şeyi AYNI bileşenle görür + üyeye özel alanlar.**
`buildDirectory`, `product-index.ts`, `related-products.ts`, `CompanyProfileView`
ikisinde de ortak. Panel fiyatı kaybetmesin diye ayrı üye ucu
(`company/items/discover/:firma/:urun`). Gizlenen alan HTML'e HİÇ yazılmaz
(`null` bile RSC yüküne anahtar adı düşürür).

**Pazar yerinin herkese açık uçları PANELDE KULLANILMAZ:** anahtar kapalıyken
boş dönerler, maskeleme/davet/bağlantı görünürlüğünü taşımazlar.

**Test verisi herkese açık yüzeyde ÇIKMAZ:** `looksLikeProse` (≥40 karakter,
≥3 sözcük, %60 sesli) — geçmeyen "Hakkında" hiç dönmez, yazma engellenmez.

### Slug kuralı — kod/numara ÖNDE
`/talep/rot-000042-celik-boru`, `/urunler/kategori/39000000-elektrik-malzemeleri`,
panel `kategori/<kod>-<ad>`. Ayrıştırma tek regex'e iner; ad sonda olsaydı
"…-39000000" ile biten bir ad sessizce YANLIŞ kaydı açardı. Kanonik olmayan yol
**308**. Sitemap ve kanonik etiket AYNI helper'dan üretilir.
**Ürün slug'ı DONAR** (ad değişse de URL korunur).

Kanonik adresler: ürün `/firma/<firma>/urun/<ürün>` (slug firma içinde tekil),
talep `/talep/rot-…`, kategori `/urunler/kategori/<kod>-<ad>`.

---

## SEO / GEO — "eklenen her şey otomatik yüksek görünürlük" (2026-09-09, Parça 1-9)

Kullanıcı kararı: yeni firma/ürün/talep/sayfa **elle iş yapılmadan** yüksek
SEO ve GEO (üretken motorlarda alıntılanma) alır. Zincir dört halkadır; biri
eksikse "otomatik" değildir:

1. **Şablon (Parça 1-2, 7):** herkese açık her `page.tsx` metasını
   `buildMetadata` ya da varlık üreticilerinden (`productSeo`/`companySeo`/
   `listingSeo`) alır — kanonik + OG + Twitter + robots + JSON-LD + sayfada
   görünen tanım cümlesi AYNI olgulardan. **`page-meta-contract.test`** dosya
   sisteminden zorunlu tutar; başlığa elle "Rothern" eklenemez (kök şablon
   ekliyor — "… — Rothern · Rothern" canlıda görüldü).
2. **Yayın anı bildirimi (Parça 5):** API `SeoIndexService` (global,
   `@Optional()` SONDA) ürün publish/unpublish/güncelleme/arşiv, firma profili
   değişimi/askı, ilan yayın/kapanış/iptal/kazandırma/embargo açılışında
   5 sn'de toplayıp TEK istekle **IndexNow** (Bing/Yandex → Copilot, ChatGPT
   araması) + web `POST /api/seo/revalidate` (ISR anında tazelenir) çağırır.
   Google'a kanal doğru `lastmod`lu sitemap (push API'si yok). Fail-open;
   `INDEXNOW_KEY` + `SEO_REVALIDATE_SECRET` (Render + Vercel AYNI değer)
   yoksa kanal KAPALI ve yalnız YAVAŞ. Adresler `public-paths.ts`ten — web
   kanoniğiyle aynı fonksiyon. Kapalı içerik IndexNow'a gitmez.
3. **Sitemap + OG (Parça 5-6):** `/sitemap.xml` İNDEKS, parçalar
   `/sitemaps/{pages,categories,cities,products[-N],companies[-N],listings[-N]}.xml`
   (20k/parça; ürünlerde image uzantısı; kategori/şehir `lastmod` = daldaki
   en yeni ürün — "şimdi" YAZILMAZ). Her herkese açık sayfa `opengraph-image`
   + `twitter-image` (kök marka kartı + varlık kartları; Inter TTF dosyadan,
   WebP → `/_next/image` JPEG). **Alım talebi kartı sahip adı almaz.**
4. **Giriş anı kalite (Parça 8):** `seo-readiness.ts` puanı + eksik ipuçları +
   **Google parçacığı önizlemesi** (aynı şablon fonksiyonu) ürün formu,
   Profilim ve talep sihirbazı 4. adımda (`SearchVisibilityCard`). Yayın
   kapısı DEĞİŞMEDİ (`productPublishBlockers`). "AI ile açıklamayı güçlendir"
   (`POST company/ai/seo-enrich`, Silver+): model yalnız verilen olguları
   cümleye çevirir, ölçü/standart/fiyat UYDURMAZ, taslak kullanıcı onayıyla
   uygulanır (AI çerçevesi kuralı).

- **Firma `sameAs`** (web sitesi + LinkedIn) herkese açık projeksiyonda
  (kullanıcı kararı 2026-09-09); Instagram/Rothern ID üyede kalır.
- **Canlı denetim:** `pnpm --filter @rothern/web seo:audit` (`SITE=…`) —
  robots/sitemap/llms + her parçadan örnek sayfa: başlık, açıklama, kanonik,
  OG 200, JSON-LD zorunlu alanlar, h1, noindex; sorun → exit 1.
- Search Console/Bing doğrulama: `NEXT_PUBLIC_{GOOGLE,BING}_SITE_VERIFICATION`.
- Tuzaklar: `fetch(new URL(…, import.meta.url))` Node'da çalışmaz (edge'e
  özgü) → font `readFile` + `outputFileTracingIncludes`; route-handler-only
  segmentler (`/api`, `/sitemaps`) public-routes render değişmezinden muaf;
  web sitemap fetch'leri `SEO_TAGS.sitemap` etiketi taşımalı.

---

## Panel — pazar bölgesi ve anasayfalar

**İki bölge, ortak token:** panel bölgesi (KPI, Taleplerim, Siparişler, Ayarlar)
yumuşak gölgeli/ferah KALIR; pazar bölgesi katalog dili (küçük yarıçap,
hairline çerçeve, gölge yalnız hover, yoğun ızgara). Marka çapası her pazar
sayfasının başındaki bant, üst çubuk DEĞİL.

| Rota | Ne |
|------|-----|
| `/company/satinalma` | pazar GİRİŞİ (hero arama → öneri şeridi → kategori vitrini → yeni eklenenler) |
| `/company/satinalma/urunler` · `/firmalar` · `/kategori/<kod>-<ad>` | dizinler + kategori sayfası |
| herkese açık `/firmalar` | **ÜYELİĞE YÖNLENDİREN VİTRİN (2026-09-22, kullanıcı: "hepsini sıralamayalım, tamamını görmek için üye olmaya yönlendirelim, sayı görünmesin")** — `CompanyIndex` en fazla 6 kart + üyelik kartı; süzgeç/arama/sayfalama/sayaç YOK; JSON-LD `totalItems` yok; `crossCounts` firma sayısı basmaz; typeahead varsayılan kapsamı ürün+talep; `/firmalar/sehir/<il>` → `/firmalar` 308 ve sitemap/llms'ten çıktı; llms-full firma sayısı yazmaz. Panel dizini ve `/firma/<slug>` profilleri (sitemap `companies.xml`) DOKUNULMADI. Footer'da Mesafeli Satış + İptal-İade bağlantıları (aynı gün) |
| `/company/satinalma/urunler/<firma>/<ürün>` | ürün detayı |
| `/company/satinalma/tedarikcilerim` · `/company/satis/musterilerim` | YALNIZ ilişki yönetimi (`ConnectionsView portal=…`, 2026-09-10 dördüncü tur = TABLO): Keşfet/sekme/ray YOK; başlıkta "Firma bul" → portalın dizini + "Davet et" tek diyalog (tek/toplu) + Rothern ID satırı; arama ÜSTTE, altında görünüm çipleri (Bağlantılarım · Gelen istekler · Bekleyenler, sayılı, gelen amber), altında dense tablo (Firma · Sektör/Şehir · Durum · Eylem); 50'şer çizim — **uzun vade kuralı: liste büyüyünce sayfa uzamaz** |
| `/company/satis` | açık talepler TAM listesi (kenar süzgeçli, `SellerTendersView embedded`); hero anahtarı "Talep \| Firma" |
| `/company/satis/firmalar` | satış firma dizini (`PanelCompanyIndex portal="satis"`; sekme/ürün şeridi yok, nötr renk) — Bağlantılar › Keşfet "Tüm firmaları ara" PORTALINA göre gider (2026-09-10) |
| `/company/sirketim/*` | Genel Bakış · Profil · Ziyaret Edenler · Raporlar |

Adres tek kaynağı `lib/company/panel-market.ts`.

- **PORTAL GEÇİŞİ ÜST ÇUBUKTA, TEK TUŞ (2026-09-15, kullanıcı kararı):**
  `portal-switch.tsx` — üstünde iki portalın ikonu ve aralarında değişim oku,
  altında aktif portalın adı; tıklayınca iki paneli AÇIKLAYAN popover açılır.
  Sol menüdeki segmentli pil KALDIRILDI (aynı işe iki giriş bırakmak Ayarlar'daki
  Onay Akışları kartının tekrarı olurdu). Yeri: Şirketim'in SOLU — "hangi
  paneldeyim" sorusu "firmam"dan önce gelir. Dar ekranda GİZLENMEZ: orada sol
  menü çekmece olduğu için geçişin tek görünür yolu bu.
  **Görünüm (aynı gün iki revizyon, kullanıcı geri bildirimi):** gri
  ikon+etiket "kendini belli etmiyor", renkli çerçeveli çip "çok farklı"
  bulundu. Orta yol: düzen diğer düğmelerle AYNI (h-12, ikon + altında 10 px
  etiket, çerçevesiz); ayrışma yalnız **ikon aktif portal renginde** (mavi/
  emerald) + koyu etiket + aç/kapa işareti + sağında ince dikey ayırıcı.
  Çip/dolgu/çerçeveye GERİ DÖNME. **Üçüncü tur (aynı gün, kullanıcı: "satıştayken satınalma logosu da
  gözüksün, hangisinde olduğum belli olsun"):** tuşta İKİ portalın ikonu arada
  değişim okuyla; aktif ikon portal renginde, diğeri `zinc-400`; altında aktif
  portal adı + aç/kapa işareti. Yer, açılan liste ve ayırıcı aynı.
  `visiblePortals`/`available` hesabı sol menüyle BİREBİR; ayrışsalardı biri
  kilidi gösterir diğeri göstermezdi. Sözleşme: `portal-switch.test.tsx`.

- **PREMIUM ÇAĞRILARI PANELDEN ÇIKARMAZ (2026-09-15, kullanıcı bildirdi):**
  `PRICING_HREF` artık `/company/premium` — eskiden `/nasil-calisir#fiyatlar`
  idi ve panelde çalışan kullanıcı "Paketleri Gör"e basınca herkese açık
  pazarlama sayfasına düşüyordu (üst çubuk, sol menü, firma bağlamı gidiyor →
  "sistemden çıkmış" hissi). Pazarlama başlığındaki fiyat bağlantısı AYRI ve
  public kalır.

- **PAKETLER EKRANI YALNIZ PAKET KARTLARI (2026-09-15, kullanıcı kararı "sadece
  paketlerde gözüksün, şık; önce doğrulamaya yönlendirsin, doğrulanmışsa direkt
  satın alma ekranı gelsin").** `/company/premium` ve kilitli sayfalardaki
  `PremiumGate` AYNI `PackagesView`i çizer (eski "neler açılır" listesi,
  doğrulama kutusu, "Gold manuel onayla" notu KALKTI; kilitli sayfada başlık
  "Bu sayfa X paketiyle açılır." der). Karar SATIN AL tıklamasında:
  doğrulanmamış (PENDING dahil) → `/company/ayarlar/dogrulama` + toast ·
  doğrulanmış → `/company/premium/satin-al?paket=silver|gold`. Satın alma
  ekranı adresle açılabildiği için aynı kapıları KENDİ uygular; paket işlemi
  yalnız kurucuda. **Ödeme altyapısı yok:** ödeme düğmesi çizilmez ve "kartla
  ödeme yakında" türü yazı/düğme de EKLENMEZ (kullanıcı kararı); tek eylem
  destek ekibine hazır konulu e-posta; PayTR gelince yalnız özet kartının
  eylemi değişir. (`PREMIUM_SELF_UPGRADE_ENABLED` açıksa Gold'da eski uç
  çağrılır — o uç yalnız GOLD'a yükseltir.) Ad/fiyat/özellik TEK KAYNAK
  `lib/pricing/plans.ts` (pazarlama sayfası da oradan okur). Sözleşme:
  `components/company/packages/__tests__/{packages,checkout}-view.test.tsx`.

- **BİRİNCİL DÜĞME RENGİ PORTALDAN (2026-09-17, kullanıcı kararı: "sistemde
  tuşlar siyah, istemiyorum — satınalmada mavi, satışta yeşil"):** firma
  kabuğu `ButtonAccentProvider` (`components/ui/button-accent.tsx`) ile aktif
  portalın rengini sağlar (satınalma `blue`, satış `emerald`; portal-nötr
  sayfalar son portalı izler); Catalyst `Button` `color` verilmemişse bağlamı
  okur → `ui/button` primary ve doğrudan Catalyst çağrılarının HEPSİ boyanır.
  Kabuk dışı (herkese açık pazar yeri, giriş/kayıt) **varsayılan MAVİ** (aynı
  gün ikinci kullanıcı kararı: "herkese açık yerlerde de mavi olsun") —
  bağlam varsayılanı `blue`, elle `bg-zinc-950` boyanmış 27 CTA (pazar yeri,
  pazarlama başlığı, firma/ürün/talep sayfaları, 404/hata, talep-onayla)
  `bg-blue-600 hover:bg-blue-700` oldu. Public yüzeyin GERİ KALANI monokrom
  (koyu bantlar, chip'ler, metin). Siyah düğme yalnız açıkça
  `color="dark/zinc"` ile. Admin uygulaması ayrı, dokunulmadı. "Tek eylem
  rengi" kuralı korunur: dolgu yalnız birincil eylemde. Sözleşme:
  `button-accent.test`.
- **ASİSTAN YAN ÇEKMECE, MODAL DEĞİL (2026-09-17, kullanıcı: "asistan açıkken
  sol taraf kullanılabilir olmalı"):** `assistant-launcher.tsx` Headless
  `Dialog`/`DialogBackdrop` yerine sabit `<aside>`; perde ve odak kilidi yok,
  Escape ile kapanır. İçindeki kullanıcı balonu, onay/gönder düğmeleri ve
  yazıyor noktaları `ButtonAccent`tan boyanır (satınalma mavi, satış emerald;
  eski `bg-brand-*` = siyah). Yuvarlak açma düğmesi de aynı renk.
- **Sol menü panel kimliğidir, DEĞİŞMEZ.** Pazar sayfaları `secondaryNav`da:
  o liste sol menüyü değil ROTA KAYDINI besler (breadcrumb + başlık + tier kapısı).
- **SONUÇ TÜRÜ SEKMESİ** (Ürünler ve hizmetler | Tedarikçiler) üç sayfada AYNI;
  aramayı ve kategoriyi karşı tarafa taşır, karşılığı olmayan süzgeç (fiyat/
  MOQ/nitelik) TAŞINMAZ.
- **SATINALMADA SİYAH YOK** (kullanıcı kuralı): birincil renk **mavi**, zemin
  beyaz. Süzgeç yüzeyi kabuktan boyanır (`FilterShellCore accent="blue"` →
  `useFilterAccent`; her bileşene ayrı prop taşımak tek siyah leke bırakırdı).
  Satış portalı siyah/emerald; herkese açık pazar yeri MONOKROM. **Renk
  çağırandan gelir, bileşen portal bilmez.**
- **TEK EYLEM RENGİ:** dolgulu renk YALNIZ birincil eylemde. Sıralama çipleri ve
  sayfalama nötr seçili durum. **İstisna (2026-09-19, kullanıcı):** Açık
  Talepler "Sırala" çipleri (`RequestSortControl`) seçiliyken portal
  renginde (satış emerald, satınalma mavi) — siyah seçili çip istenmedi.
- Kartta `Doğrulanmış` gövdede okunur etiket, `Gold Üye` kapakta sessiz şerit.
  Özellik satırı ürünün KENDİ nitelik tablosundan — açıklamadan cümle AYIKLANMAZ.
- SÜZGEÇ değişimi `replace`, **SAYFA değişimi `push`**. "Tümünü temizle"
  süzgeçleri siler, ARAMA ve GÖRÜNÜM tercihlerini korur.
- Panel anasayfası public anasayfanın KOPYASI DEĞİLDİR (denendi, kullanıcı geri
  aldırdı — `satinalma-home.test`). Başlık şeridi ve "BUGÜN" bandı kalktı;
  bekleyen işlerin tam listesi Şirketim › Genel Bakış'ta.
- **Uydurma sinyal basılmaz:** "N tedarikçi inceledi", "popüler aramalar",
  teslimat bölgesi — veri tutulmuyor, bölüm çizilmiyor. ("Hızlı yanıt veren"
  bu listeden ÇIKTI: 2026-09-07'de gerçek ölçü geldi — `common/company/
  reply-time.ts` ortanca ilk yanıt süresi, gece cron'u `Company.
  medianReplyHours`e yazar, eşik 24 saat; İş Analizi ile AYNI kaynak.)
- Portal yönü içeriği belirler: satınalma şeridinde başkalarının **ürünleri**
  (`company/items/discover`), satışta başkalarının **alım talepleri**
  (`seller-tenders`). Sözleşme `portal-discovery.test.tsx`.
- Sektör sayaçları ile liste TEK KAYNAK (`sellerVisibleWhere`) — ayrışsalardı
  "12 ilan" yazıp 5 ilan çıkardı. `limit` SIRALAMADAN SONRA kırpar.

**HERO ARKA PLANI DÜZ BEYAZ (2026-09-17, kullanıcı kararı: "arama kısmının
arkasındaki fotoğrafı tamamen kaldır, beyaz olsun; anasayfadakini de"):**
`PanelHeroSearch` fotoğraf sahnesi (`/hero/hero-scene*.webp` SİLİNDİ), renk
yayılımı ve nokta deseni çizmez; `backdrop` yalnız tam genişlik + `min-h-[30rem]`
bant düzenini seçer, bant `bg-white`. Herkese açık anasayfanın hidrasyon
öncesi kabuğu (`home-hero.tsx` `HeroShell`/`BAND`) aynı sınıfları taşır.
**KÖŞE KARTLARI + KOLİ (2026-09-17, kullanıcı referans görseli):** `widgets`
(dekoratif kartlar; fotoğraf yığını yalnız CC0 kategori fotoğraflarından, kişi
yok, sayı/istatistik yok) ve `objects` (`public/hero/kutu.webp` — kullanıcı
varlığı, şeffaf koli renderı; PNG → 640 px WebP Chromium canvas ile, ~33 KB).
Yalnız `2xl`, `aria-hidden`, `-z-10`. **Canlılık (2026-09-18, kullanıcı
mockup'ı):** widget'lı bant zemini portal tonunda hafif gradyan
(`from-blue-50/80` · `from-emerald-50/80` → beyaz), düzlemler `*-100/60`, kart
ikonları `text-blue-600`/`text-emerald-600`; widget'sız bant düz beyaz kalır.
**Herkese açık anasayfa da AYNI dekoru
alır (2026-09-18, kullanıcı):** tek kaynak `lib/company/hero-decor.tsx`
(`BUYER_*`/`SELLER_*`), kabuk `HeroShell` de `HeroDecor` çizer (hidrasyonda
belirmesin). Anasayfanın tedarikçi yüzü `ButtonAccentProvider emerald` içinde
("Teklif ver" yeşil).
Sözleşme: `panel-hero-search.test` "arka plan".

### Herkese açık anasayfa = panel anasayfalarının anonim hâli
Ziyaretçi `AudienceSwitch` ile tarafını seçer; sayfa o portalın panel
anasayfasını o portalın rengiyle gösterir (alıcı mavi, tedarikçi yeşil).
**VARSAYILAN YÜZ TEDARİKÇİ, tuşta Tedarikçiyim SOLDA · Alıcıyım SAĞDA
(2026-09-21, kullanıcı kararı):** sunucu ve `HeroShell` tedarikçi yüzünü
basar (`DEFAULT_AUDIENCE`), kayıtlı tercih efektte okunur; üst çubuğun
"Ücretsiz Kaydol"u ilk açılışta yeşil. **FİRMA ARAMA ANASAYFADA YOK (aynı
gün, kullanıcı: "firma arama özelliğini kaldıralım, firmaları
görüntüleyemesin"):** hero "Ürün | Firma" / "Talep | Firma" kapsam pili,
`#firmalar` bölümleri ve dizin çekimi kalktı; `AudienceProvider` yalnız yüzü
taşır. `/firmalar` dizini, üst çubuk sekmesi ve altbilgi bağlantısı
DOKUNULMADI (ayrı yüzey — kapatılacaksa ayrı karar). **Alıcı yüzünde "Öne
çıkan ürünler" şeridi YOK (2026-09-22, kullanıcı: "kategoriler gelsin
direkt"):** hero → kategori vitrini → yeni eklenen ürünler; `fetchFeaturedProducts`
anasayfada çağrılmaz. **Alıcı yüzü kategori vitrini FOTOĞRAFSIZ:** `CategoryShowcaseRows visual="icon"` → `CategoryTile
visual="icon"` çizgisel lucide segment ikonu (`category-visual.ts`
`TONE_CLASS.iconStrong`, tam opaklık), promo kartta mavi zeminde beyaz ikon;
panel vitrini (`/company/satinalma`) fotoğraflı KALIR (`visual` varsayılanı
"photo"). Sözleşme: `home-faces.test`, `audience-switch.test`,
`marketing-header-audience.test`.
**PANEL DOSYALARINA DOKUNULMADI** — `PanelHeroSearch` ve `CategoryShowcaseRows`
prop'la sürülüyor. Monokrom kuralı **yalnız `/` için** delindi; diğer public
sayfalar siyah kalır.

**Anonimde karşılığı olmayan uydurulmaz, çizilmez:** AI ile ara (Silver+ ∧
koltuk), "size uygun ürünler" (firmanın alım kategorileri gerekiyor →
"Öne çıkan ürünler"), `SellerTendersView` (→ **satır listesi**
`ListingTeaserRow`: panelin `BrowseTenderRow`uyla aynı `ListingCard row`,
görselsiz, alt alta — 2026-09-10 kullanıcı kararı; teaser ızgarası
anasayfadan kalktı, `ListingTeaserCard` dizin/detayda duruyor), KPI'lar.

**Hero kapsam pili "Ürün | Firma" (2026-09-10, kullanıcı kararı; "Tedarikçi"
sözcüğü pil/dizin/sekmede KALKTI):** panelde ve herkese açık anasayfada
"Firma" seçiliyken hero'nun ALTI ürün/talep değil FİRMA listesidir
(panel `HomeCompanyList`, public `HomeBuyer` `#firmalar` bloğu — iki blok
HTML'de, görünmeyen `hidden`; kapsam `AudienceProvider` bağlamında,
localStorage'a yazılmaz). Sunucu her zaman "products" basar.

Kategori kartı tuzağı: public kategori sayfası ürünü OLMAYAN kodda 404 verir →
vitrin `count === 0` olan dalı `/urunler?kategori=<kod>`e gönderir (dürüst boş
liste, kırık bağlantı değil).

### AI ile ara
İki anasayfanın arama kutusunda "Ara | ✨ AI ile ara" anahtarı.
`POST company/ai/search-intent` yalnız **SÜZGEÇ** döner (sonuç/kod değil);
model kategori KODU yazamaz — `categoryHint` backend'de katalogda aranır
(`category-hint-resolver.ts`, ürün çıkarımıyla ORTAK). `<metin>` VERİ, şema +
sanitizer son savunma. Web `lib/company/ai-search.ts` yorumu URL şemasına
çevirir; `AiIntentBand` "AI şöyle anladı" + kaldırılabilir çipler.
Sonuç 0 ise **sunucuda gevşetme**: kategori → fiyat → adet → faaliyet →
doğrulanmış → şehir sırasıyla kaldırılır, sonra arama "biri hariç" denenerek
kısaltılır; bant neyin kaldırıldığını yazar. Silver altı: anahtar devre dışı.

---

## Satın alma talebi açma — HIZLI TALEP + ticari profil (2026-09-09)

**İlke: talep = niyet + ticari şartlar.** Niyet her seferinde yeni (ne ·
nereye · ne zamana · kime), şartlar neredeyse hiç değişmez → ayrıldı.
Geri dönüş noktası: git etiketi `talep-v1-oncesi-2026-09-09`.

- **Talep şartları (ticari profil):** `Company.requestDefaults` JSONB, tip
  `@rothern/shared` `RequestDefaults`; `GET/PUT company/request-defaults`
  (kayıtlı → son yayımlanan talepten türetilmiş → none; zod + Prisma enum,
  kapsam-ödeme tutarlılığı sihirbaz kurallarıyla aynı). Ayar sayfası
  Şablonlar › Talep Şartları; form `components/tenders/request-defaults-form`.
  Profil↔form köprüsü `lib/tenders/request-defaults.ts` (gidiş-dönüş testli).
- **Hızlı talep (varsayılan giriş `taleplerim/yeni`):**
  `components/tenders/quick/*` — **kalemler sihirbazla AYNI bileşen**
  (`wizard/step-2-items` `Step2Items`: Kalem Adı · Miktar · Birim · Stok
  Kodu, Detaylar, Katalogdan/Excel/Yeni Kalem; kullanıcı kararı 2026-09-10
  "detaylı sihirbazdaki gibi olacak" — serbest metin "Ne lazım?" kutusu,
  `search-intent` çağrısı ve katalog otomatik tamamlama KALDIRILDI;
  `quick-parse.ts` yalnız `titleFromItems` için duruyor, başlık boşsa
  yayında kalemlerden türetilir), üstte "Belgeden Doldur" (AI-1, sihirbaz
  sayfasındaki kart), kategori (discovery), adres (+satır içi ekleme), süre
  çipleri 3·7·14, ödeme şekli (2. bölümde, Şartlar paneliyle aynı değer),
  kime (PUBLIC/CONNECTIONS/PRIVATE + kompakt bağlantı seçici); sağda Şartlar
  paneli (satır satır "değiştir", "varsayılan yap"), teklif kalitesi
  (`listingSeoReadiness`), yayın/taslak/şablon. Profil yoksa 3 soruluk kurulum kartı. **Aynı form modeli ve doğrulama** (`tenderFormSchema`)
  ve **aynı gövde** (`lib/tenders/map-to-input.ts` — sihirbazdan buraya
  taşındı, TEK KAYNAK); yeni backend akışı YOK. Yayın sonrası panel:
  tedarikçi önerisi (AI) + talep bağlantısı. Taslak `sessionStorage`
  (`quick-draft.ts`).
- **HIZLI TALEP 1. BÖLÜM DÜZENİ (2026-09-17, kullanıcı kararı):** kalemler →
  **Talep başlığı** → altında **"AI ile başlık ve kategori bul"** düğmesi →
  **Kategori** (tek sütun; eski iki sütunlu başlık|kategori ızgarası kalktı).
  Düğme iki ucu PARALEL çağırır: `tender-extract/title-suggest` (YENİ —
  kalemlerden 4-10 sözcüklük Türkçe başlık, `title-suggest.ts`
  `sanitizeSuggestedTitle`; uydurma ölçü/sayı yok, hata → `{title:null}`) +
  `tender-extract/category-suggest` (mevcut, ≤3 L3). Başlık ve kategori ÜZERİNE
  yazılır (düğmeye bilinçli basıldı), anahtar kelimeler yalnız boşsa. Hook
  `useAiRequestDraftSuggest`. Sözleşme: `test/unit/ai-title-suggest.spec.ts`.
- **DAVET SEÇİCİSİ İKİ PANEL + KALEM SIRALAMASI (2026-09-19, kullanıcı
  mockup'ı):** `quick/supplier-picker.tsx` — SOL "Davet edilecek firmalar"
  (arama, Sektör/Şehir süzgeci, Tümünü seç, tablo Firma·Şehir·Sektör·Firma
  türü, 7'şer "Daha fazla yükle"), SAĞ "Seçilen firmalar N" (kaldır, "N
  firmayı davet et" → yayın düğmesine kaydırır `#talep-yayinla`, Seçimi
  temizle). Sıra **uygunluk puanına** göre (`relevance`): talep kategorisiyle
  satış beyanı aynı aile 4 / segment 2 + kalem adı kökleri firmanın
  sektör/ad/faaliyet metninde (≤5); puanlılar "Kalemlere uygun" çipiyle önde.
  Bunun için bağlantı kartı `categoryIds` (satış ana+alt beyanı) taşır
  (`company-connections.service` `COMPANY_CARD_SELECT`). Özet + Yayınla kartı
  sağ rayın EN ALTINDA (kullanıcı: "bu kısım en aşağıda olmalı").
  Sözleşme: `quick/__tests__/supplier-picker.test.tsx`.
- **BAĞLANTILARIM = GÖRÜNÜRLÜK LİSTESİ (2026-09-19 akşam, kullanıcı kararı:
  "o kişiyi çıkarırsa bildirim ve e-posta gitmediği gibi alım talebini de
  görmeyecek"):** "Bağlantılarım" seçilince seçici TÜM bağlantıları işaretli
  açar (`SupplierPicker mode="connections"`, işaretliler üstte, çıkarılanlar
  altta "Görmez" etiketli, "Tümünü seç / Tümünü kaldır", sayaç N/M). Sunucuda
  dışlama kavramı YOK → tek kaynak `lib/tenders/connections-scope.ts`
  `applyConnectionsScope`: kimse çıkarılmadıysa CONNECTIONS + herkese davet
  (yeni bağlantılar da görür), biri çıkarıldıysa PRIVATE + yalnız işaretliler
  (çıkarılan görmez, bildirim almaz). Yayın ve taslak yolu bu fonksiyondan
  geçer; düzenlemede talep sunucudaki hâliyle (Özel) açılır. Herkese açık ve
  Özel boş başlar. **Seçilenler paneli tablonun ALTINDA, tablo tam genişlik**
  (aynı gün, kullanıcı: "sağına değil altına"). Sözleşme:
  `supplier-picker.test` "Bağlantılarım kipi", `quick-request.test`
  "görünürlük listesi", `connections-scope.test`.
- **Kalem araç çubuğu (2026-09-19):** "Katalogdan Ekle" ve "Excel ile İçe
  Aktar" listenin SAĞ ÜSTÜNDE, "Yeni Kalem Ekle" altta kalır. Aranan tedarikçi
  tipi çipleri: "Fark etmez" → **"Hepsi dahil"**, seçili çip mavi (siyah değil).
- **AI TEDARİKÇİ KEŞFİ 3. BÖLÜMDE (2026-09-17):** "Kimler görsün?" bölümünün
  başında "AI ile daha fazla tedarikçiye eriş" kartı; modal kategori + KALEM
  ADLARIYLA açılır (web araması kalemleri bağlam alır). Sihirbaz 3. adımı da
  kalem adlarını geçer. Modal web sekmesi: **e-postası olmayan firma
  listelenmez**, "Davet E-postası Gönder" liste kaydırılsa da görünen SABİT
  alt şeritte.
- **⛔ DETAYLI SİHİRBAZ KALDIRILDI (2026-09-19, kullanıcı kararı "gerek yok,
  sistemde de gözükmesin").** `taleplerim/yeni/detayli` rotası, `TenderWizard`,
  adım 0/1/3/4 ve yayın onay diyaloğu SİLİNDİ; eski adres `next.config` ile
  hızlı karta 308 (sorgu korunur). Üç giriş artık hızlı kartı DOLU açar
  (`yeni/page.tsx`): kopya `?from=` (`mapDetailToForm forCopy`), AI belge
  `?ai=1` (`AI_TENDER_DRAFT_KEY` → `mapAiDraftToForm`), şablon `?template=`
  (tarih/davetli/tip düşülür). **Düzenleme de hızlı kartla:**
  `taleplerim/[id]/duzenle` → `QuickRequest mode="edit" listingId` (güncelle
  → gerekirse yayınla). Rayda "Detaylı sihirbaza geç" yerine **"Şablon olarak
  kaydet"** (`SaveTemplateDialog`, wizard klasöründe kalan paylaşılan parça).
  `wizard/` klasöründe yalnız paylaşılanlar duruyor: `step-2-items`,
  `catalog-picker-dialog`, `item-detail-modal`, `item-question-modal`,
  `staged-documents`, `save-template-dialog`. Şablonlar sayfası düğmesi
  "Talepte kullan".

**TALEP DETAYI DÜZENİ (2026-09-17, kullanıcı kararı):** `/company/ilan/[id]`
iki görünümde de sekme sayısı İKİ — `Kalemler` (kalemler + Genel Bilgi
kartları + sahipte davetliler TEK akış) ve `Dosyalar (N)` (dosya varsa sayı
parantezde; sayaç `useListingDocuments`, FilesTab ile aynı sorgu). Teklif
sekme DEĞİL: teklifçide "Teklifim" kutusu (`MyBidStatusPanel` + notlar)
sekmelerin ÜSTÜNDE, sahipte "Gelen Teklifler" iş tezgâhı üstte `card` içinde.
`?tab=` yalnız 0/1. **"AI ile tedarikçi bul" görünür düğme** (başlık kartı,
`Sparkles`): koşul sahip ∧ `buy:listing:manage` ∧ DRAFT/OPEN; Gold değilse
pasif + ipucu. Eskiden yalnız ⋮ menüsünde ve menü yalnız ilanı OLUŞTURANA
çiziliyordu (`canManage`) → başkasının açtığı talepte hiç yoktu. API
`company/ai/supplier-discovery` (+`/external`) `@RequireTier("GOLD")`;
`published-panel` kapısı SILVER→GOLD hizalandı. Staging'de doğrulandı
(2026-09-17): platform önerisi 1,4 sn, web araması (Gemini) ~35 sn, ikisi 201.

**TALEP DETAYI — TEKLİFÇİ BAŞLIK KARTI v2 (2026-09-19, kullanıcı mockup'ı;
"Takip et" tuşu bilinçli YOK):** üst satırda geri bağlantısı + sağda
"Paylaş" (adresi panoya kopyalar); başlık kartı iki sütun — solda numara ·
durum pili, `text-3xl` başlık, tonlu ikonlu çipler (Alış mavi · Yurtiçi/
Uluslararası gri · format mor), anahtar kelimeler, "Alıcı Firma" ikon
karosu, açıklama; sağda geri sayım kartı (saat ikonu, KAPANMASINA, süre,
tarih) + tam genişlik "Teklif Ver ›". Meta şeridi büyük ikon karolu. Kapalı
zarf notu `sellerBidSection`ın küçük Callout'undan çıkıp sayfa düzeyinde
BANT oldu (kilit ikonu, iki satır, "Nasıl çalışır?" → `/nasil-calisir#nasil`)
— RFQ ∧ teklif alımı açıkken. Sekmeler yine iki (Kalemler N · Dosyalar).

## Ürün Kataloğu (firma vitrini)

`CompanyItem` hem ilana eklenen kalem hem herkese açık vitrin kaydıdır — ayrı
varlık AÇILMADI (ikiye bölmek aynı ürünü iki yerde güncelleme borcu üretirdi).
Panel `/company/satis/urunlerim`, public `/firma/<slug>/urun/<slug>`.

- **ÜRÜN MODERASYONU (2026-09-09, kullanıcı kararı): her ürün vitrine çıkmadan
  admin onayından geçer.** `CompanyItem.reviewStatus` DRAFT→PENDING→APPROVED|
  REJECTED (+ `submittedAt/reviewedAt/reviewedByAdminId/rejectReason`).
  `isPublic` YALNIZ `AdminProductsService.approve` ile true olur → herkese
  açık sorgular (`publicProductWhere`) değişmedi. Firma tarafı `publish` =
  **onaya gönder** (yayın kapısı + paket tavanı: yayında + bekleyen ≤ limit).
  Yayındaki ürünün İÇERİK alanı (ad/açıklama/kategori/görsel/anahtar kelime/
  nitelik) değişince yeniden PENDING'e düşer ama **vitrinde kalır**; red
  vitrinden çeker. Vitrinden çekmek taslağa döndürür (yeniden onay ister).
  Admin: `/admin/urunler` kuyruğu (SUPER_ADMIN + SUPPORT karar verir, SALES
  yalnız okur), onay → SEO bildirimi + firma e-posta/bildirim;
  **"Düzeltmeye gönder"** (eski adı reddet; enum `REJECTED` KALDI) gerekçe
  zorunlu.
- **TOPLU ONAY + FİRMA SÜZGECİ (2026-09-14):** ücretsiz ürün tavanı 10→50
  çıkınca tek onaylayıcılı kuyruk darboğaz olurdu. **Otomatik onay YOK**
  (kullanıcı kararı: "otomatik ürün onayına gerek yok") — kararı yine admin
  verir, 50 tıklama 1'e iner. `POST admin/products/bulk-approve` (tavan 100,
  `BULK_APPROVE_MAX`), kuyrukta satır seçimi + "Seçilenleri onayla", firma
  adına tıklayınca `companyId` süzgeci. **Bayat satır yığını DÜŞÜRMEZ** —
  atlanır ve gerekçesiyle döner. **Bildirim ürün başına değil FİRMA başına**
  (50 ürün = 50 e-posta spam olurdu ve staging Resend kotasını bitirirdi);
  audit ve SEO ürün başına KALIR. Sözleşme: `admin-products.service.spec.ts`
  "approveMany". Web durum sözlüğü `lib/company/product-status.ts`
  (Taslak · Onay bekliyor · Yayında · Yayında·incelemede · Düzeltme istendi).
- **İNCELEME KİLİDİ (2026-09-10, kullanıcı kararı):** PENDING ürün admin
  karar verene dek DEĞİŞTİRİLEMEZ — `CompanyItemsService.assertNotInReview`
  kalem/vitrin güncelleme ve yeniden gönderimde **409 `PRODUCT_IN_REVIEW`**;
  firma Ürünlerim'de formu değil salt-okunur önizlemeyi görür
  (`components/products/product-preview.tsx`, gövde herkese açık sayfayla
  AYNI `ProductDetailBody`). Tek çıkış admin kararı; firmanın kendi
  kendine geri çekmesi bilinçli YOK. Yayındaki ürünü vitrinden çekmek ve
  arşivlemek serbest (içerik değişikliği değil). Düzenleyici/önizleme
  `GET company/items/:id/showcase` ile açılır — **eski boş PATCH açılışı
  sunucuda görsel/etiket/fiyatı SİLİYORDU** (normalizer `?? []`), o yol kapandı.
  Sözleşme: `product-catalog.spec` "İNCELEME KİLİDİ" + web
  `products-view.test`/`product-preview.test`.
- **ÜRÜNLERİM TABLO (2026-09-18, kullanıcı kararı):** liste TABLO (Ürün ·
  Durum · Kategori · Fiyat · Min. sipariş · Görüntülenme · Eklenme · ⋮),
  üstteki durum kutuları KALKTI → arama yanında sayılı hap süzgeçleri.
  **Yatay kaydırma YOK** ("scroll bar olmasın, tabloyu oturt"):
  `overflow-x-auto`/`min-w` yok, sütunlar kesme noktasıyla gizlenir (Eklenme +
  Kategori yalnız 2xl, Min. sipariş + Görüntülenme xl, Fiyat sm); kategori ad
  altındaki satırda zaten okunur. Sözleşme: `products-view.test` "yatay kaydırmaz".
- **ÜRÜN AÇILIŞI: YAYINDAYSA ÖNCE ÖNİZLEME, "DÜZENLE" FORMA (2026-09-19,
  kullanıcı kararı; 18'indeki "önizleme üstte" ve "yan yana Kart|Sayfa paneli"
  denemeleri beğenilmedi, ikisi de KALDIRILDI).** Ürünlerim'de yayındaki
  (APPROVED ∧ isPublic) ürüne tıklayınca `ProductPreview variant="published"`
  (alıcının gördüğü hâl + Düzenle · Herkese açık sayfayı aç · Vitrinden çek);
  Düzenle `editorOpen` ile forma geçirir. Taslak/düzeltme istenen doğrudan
  form; PENDING yine kilitli `review` önizlemesi. Form: üstte yapışkan
  **eylem çubuğu** (`product-action-bar.tsx`: ad + durum + kaydedilmemiş
  işareti, portal renginde Kaydet/Onaya gönder, ⋮ menü), solda 5 bölüm, sağda
  yapışkan **ray** (`editor-rail.tsx`: tamamlanma + onay için eksik çipleri →
  `sectionFor` ile bölüme kayar + katlanabilir Öneriler). **Yayındaki üründe
  değişiklik yokken Kaydet KAPALI** (`dirty` yoksa) — kullanıcı bulgusu:
  değişmeden kaydedince ürün yeniden incelemeye düşüyordu. API tarafı da
  düzeltildi: `updateShowcase` içerik farkını artık `JSON.stringify` ile değil
  kanonik `showcaseContentChanged` (`common/company/product-content-diff.ts`)
  ile ölçer — eski yol `Prisma.DbNull` ("{}") ile `null`ı ve boş açıklamayı
  farklı sayıyordu. Sayfa başlığı (`PageHeader`) düzenleme/yeni modunda YOK.
  Sözleşme: `products-view.test` (önizleme → Düzenle → form),
  `product-preview.test` "published"/"EditorRail", API
  `test/unit/product-content-diff.spec.ts`.
- **VİTRİN PATCH'İ KISMİ (2026-09-19 incelemesi, K-3):** `PATCH company/items/
  :id/showcase` gönderilmeyen alanı DEĞİŞTİRMEZ — `undefined` = dokunma,
  `null`/`[]` = bilinçli silme; tek kaynak `common/company/showcase-merge.ts`
  (+ `showcase-merge.spec`). Eskiden normalizer gövdeyi TAM vitrin sayıyordu:
  yalnız açıklama gönderen istek görsel/anahtar kelime/nitelik/belge/fiyatı
  sıfırlıyor, ürün "≥1 görsel" kapısına takılıp yeniden yayınlanamıyordu (web
  formu her alanı gönderdiği için ekranda görünmedi; staging'de iki demo ürün
  boşaldı). Kısmi gövde gönderen yeni yol (asistan/AI/mobil) bu kurala güvenir.
- **Ürün ekleme İLAN AÇMAYA BENZEMEZ:** ilan sihirbaz, ürün TEK SAYFA
  (2026-09-09 düzeni: 5 numaralı bölüm + yapışkan bölüm çipleri, sürükle-
  bırak/sıralanır görsel, virgülle çoklu anahtar kelime + öneri çipleri, sağda
  TEK durum kartı + arama görünürlüğü; kaydedilmemiş değişiklik uyarısı).
  `POST company/items/product` kaydı ve vitrin alanlarını TEK çağrıda yazar.
  Sıra: ad → kategori → açıklama → görseller → anahtar kelimeler → nitelikler →
  fiyat/MOQ. Ürün TASLAK doğar; yayımlamak ayrı ve bilinçli adım.
- **Fiyat üç mod** (`FIXED`/`TIERED`/`ON_REQUEST`) ve **üçü de tamamlanma
  skorunda TAM PUAN alır** — dürüst seçeneği cezalandırmak kullanıcıyı sahte
  fiyata iter (Europages'te "1,00 €" sorunu).
- **Skor ≠ yayın kapısı:** skor (0-100) yönlendirir; `productPublishBlockers`
  engeller (ad, kategori, ≥100 karakter açıklama, ≥1 görsel, ≥1 anahtar kelime).
  Fiyat ve nitelik kapıda YOK.
- **⛔ TOPLU ÜRÜN EKLEME KALDIRILDI (2026-09-15, kullanıcı kararı).** Excel/CSV
  şablonu (`company/items/import/{template,parse,commit}`) ve katalog PDF/foto
  AI çıkarımı (`ai/product-extract`) web, API ve `@rothern/shared`
  `product-import.ts` dahil TAMAMEN söküldü. Gerekçe: Excel görselsiz ürün
  üretiyordu (yayın kapısı ≥1 görsel ister → toplu taslak yığını), 200-300
  sayfalık katalogdan çıkarım pratikte çalışmıyordu. Ürün TEK TEK, görseliyle
  "Yeni ürün" formundan eklenir. GERİ GETİRME. (Talep kalemi içe aktarma
  `item-import.ts` ve teklif şablonu `bid-import.ts` AYRI özellikler, duruyor.)
- **⛔ WEB SİTESİNDEN ÜRÜN ÇEKME — bilinçli olarak YAPILMAYACAK** (kullanıcı
  kararı): sahiplik doğrulanamaz (rakip URL'i → biz yayıncı oluruz), uydurulan
  fiyat/MOQ ticari beyandır, canlı site prompt-injection yüzeyidir. (`common/website-import.ts` bundan
  ETKİLENMEZ — o, firmanın KENDİ sitesinden profil zenginleştirmesidir.)

### Bilgi talepleri — İKİ PORTAL, İKİ YÖN
| Portal | Sayfa | Ne |
|--------|-------|-----|
| Satınalma | `satinalma/bilgi-taleplerim` | GÖNDERDİĞİM sorular |
| Satış | `satis/bilgi-talepleri` | ürünlerime GELEN sorular |

Tek bileşen (`InquiriesView portal=…`); karşı yönün sorgusu o portalda hiç
açılmaz. **Kayıtlı alıcı yolu AYRI uç** (`POST company/inquiries`, auth'lu, KYC
yok): kimlik kanıtlı olduğu için doğrulama jetonu/bot savunması/kimlik alanı yok,
misafir tavanı uygulanmaz (frenler: aynı ürüne 24 saatte tek talep + firma başına
30/gün). Yanıt bildirimi kayıtlı/misafire göre AYRIŞIR. Ücretsiz satıcıda gelen
talep ANONİMLEŞTİRİLİR (mesaj/adet/ürün/şehir kalır), yanıt Silver+.

**Ürün → talep köprüsü:** "Bu ürünü satın alma talebime ekle" ürünü sihirbaza
İLK KALEM olarak taşır; miktar ve fiyat TAŞINMAZ (MOQ satıcının tabanı, vitrin
fiyatı müzakereyi çıpalar). `sessionStorage` anahtarı AI taslağından AYRI.

### Menüden ulaşılamayan sayfa bırakma
`module-reachability.test.ts` dosya sistemi üzerinden zorunlu tutar: menüde
olmayan her sayfa gerekçesiyle listede olmalı; `MODULE_LABELS`teki her ad bir
menü satırında kullanılmalı.

---

## Ziyaret Edenler + İş Analizi

`modules/company-views/`, tablo `company_views`. Kayıt iki yüzey: **PANEL**
(üye başkasının profilini/ürününü açınca kimlikli; `visitsVisible=false` ise
anonimleştirilir) ve **PUBLIC** (beacon → `POST public/views`, 60/dk/IP,
3 sn okuma + görünür sekme, çerezsiz, bot süzülür). **IP'den firma tahmini YOK**
(KVKK). Tekilleştirme `dedupeKey` + unique; 180 gün sonra cron siler.
Sayılar herkese, kimlikli LİSTE Silver+; İş Analizi Silver+.

---

## Migration ve Dağıtım

> ⚠️ **`render.yaml` `autoDeploy: true`** — main'e push edilen API kodu prod'a
> KENDİLİĞİNDEN gider. Şema kullanan değişikliği push ettiysen migration'ı
> AYNI turda uygula, yoksa canlı kod olmayan kolonu okur ve uç 500 döner.
> `ALLOW_REMOTE_MIGRATION=1 pnpm --filter @rothern/db migrate:deploy`
> (`assert-migration-target.ts` uzak host'u onaysız reddeder).

- Son migration `20260923235000_category_attribute_names_i18n`
  (`category_attributes.nameEn/nameRu/optionsEn/optionsRu`). Öncesi
  `20260923230000_category_names_i18n`, `20260923180000_content_translations`,
  `20260923120000_company_user_locale`. Dördü de eklemeli, staging'e 2026-09-23'te
  uygulandı, **CANLIDA BEKLİYOR** (PR #57 birleştirilmeden önce, sırayla).
  Öncesi `20260914120000_listing_preferred_activities`.
- Şema değişikliği: `migrate` (dev) → `migrate:deploy` (prod). Manuel SQL için
  `prisma/migrations/<timestamp>_<ad>/migration.sql`. **Her yeni migration'dan
  ÖNCE `docs/migration-safety.md` kontrol listesini oku.**
- **API'ye parametre ekleyen değişiklikte API ÖNCE push** (`forbidNonWhitelisted`
  → eski API yeni parametreye 400 döner).
- NOT: yerel dev artık STAGING DB'ye bağlı (2026-09-11); canlı migration için
  `.env.prod.local` değerleriyle `ALLOW_REMOTE_MIGRATION=1 migrate:deploy`.
- **ŞEMA BEKLEYEN (migration onayı yok):** ürün öne çıkan özellikler / paket içi
  adet / teslim süresi-bölgesi; firma teslimat bölgesi; "Toptancı" faaliyet
  tipi; ilan görüntülenme sayacı.
- Launch adımları: `docs/launch-checklist.md`.

## Geliştirme Notları ve Tuzaklar

- **NestJS CLI watch modu WSL'de bozuk.** `apps/api` `dev` script'i
  `concurrently` + `tsc -w` + `nodemon`. `nest start --watch` KULLANMAYIN.
- **Prisma `.env` symlink:** `packages/db/.env` → `../../.env`.
- **gitleaks pre-commit:** klonladıktan sonra `git config core.hooksPath .githooks`.
  Binary yoksa fail-closed engeller; acil atlama `SKIP_GITLEAKS=1`.
- **Yol adına göre RENDER DALLANMASI yapma.** `usePathname()` statik/ISR
  üretimde "/" DÖNMÜYOR → hydration #418. "Şu an neredeyim" bilgisini istemci
  efektinden al. (Teşhis: JS'siz DOM ile hydration sonrası DOM'u ÖZNİTELİK
  düzeyinde karşılaştır; `next dev` tam ağacı basar, prod build yalnız "#418".)
- **`useSearchParams` + statik sayfa = BUILD hatası** (`next dev` HİÇ
  göstermez). Herkese açık statik sayfaya panel bileşeni takarken **yerelde
  üretim derlemesi al.** `<Suspense>` yedeği BOŞ KUTU OLAMAZ — sınırın içindeki
  her şey istemciye ertelenir, `<h1>` statik HTML'den düşer (SEO kaybı).
- **YUMUŞAK 404 TUZAĞI — `loading.tsx` + `notFound()` (2026-09-24, canlıda da
  ölçüldü):** `loading.tsx` bir Suspense sınırıdır; altındaki dinamik sayfa
  `notFound()` atınca kabuk çoktan akmıştır → Next **200** + `<meta
  name="robots" content="noindex">` döner (Googlebot'a da 200 = soft 404).
  `/urunler/loading.tsx` altındaki `kategori/[slug]` ve `sehir/[il]` böyle
  200 dönüyordu; iskelet `urunler/(dizin)/` rota grubuna taşındı (yalnız dizin
  sayfasını sarar), alt sayfalar sınırın DIŞINDA → gerçek 404. Kural:
  `notFound()` atabilen dinamik segmentin ÜSTÜNE `loading.tsx` koyma; iskelet
  istiyorsan rota grubuyla yalnız o sayfayı sar. `/firma/*` ve `/talep/*`
  zaten sınırsız (404 doğru).
- **Rig stub gotcha (denetimde 8 kez tekrarladı):** yaygın enjekte edilen bir
  servise YENİ bağımlılık eklendiğinde elle kurulan test rig'leri kırılır —
  (a) eksik stub → `x is not a function`, (b) **constructor SIRASI kayması** →
  yanlış nesne enjekte olur, hata yalnız o bağımlılığa ULAŞAN testte çıkar.
  Böyle bir değişiklikten sonra **TAM api suite'i** koşulmalı.
- **SAAT DİLİMİ TEK KAYNAK `lib/time-zone.ts` (2026-09-22):** takvim günü
  (`daysUntil` → `calendarDaysBetween`) ve tarih/saat metni (`formatDate`,
  `formatTime` → `toAppWallClock`/`wallClock`) HER ZAMAN `Europe/Istanbul`
  duvar saatiyle. Kök neden: sunucu (Vercel fra1, UTC) ile Türkiye'deki
  tarayıcı 21:00–24:00 UTC arasında farklı takvim günündeydi → herkese açık
  anasayfada "3 gün kaldı"/"2 gün kaldı" hidrasyon #418 (staging'de her
  gece 00:00–03:00 ölçüldü). Kural: gösterim tarihi için `new Date()` +
  yerel `getHours/getDate`/`differenceInCalendarDays` KULLANMA; testte
  tarihi `+03:00` ofsetli ISO ile kur (`date.test`, `seller-state.test`).
- **`useHeroGone`:** panel kabuğu sayfadan ÖNCE mount olur → sentinel'i
  4 sn `MutationObserver` ile bekler; `usePathname` YALNIZ efekt bağımlılığı.
- **`Badge` tabanı `shrink-0` taşır** — daralması gereken rozete `shrink` ver.
- **Node HER YERDE 22 (2026-09-16 hizalandı):** Vercel iki projeyi de 24.x ile
  derliyordu; API Docker imajı, CI iş akışları ve yerel geliştirme 22'deydi.
  Vercel proje ayarı 22.x'e çekildi ve canlı web + admin o sürümle YENİDEN
  DERLENİP doğrulandı (ayar değiştirip ilk deploy'u şansa bırakmak, hatayı
  günler sonra ve acil bir anda çıkarırdı). Bir platform Node'u zorla
  yükseltirse üçünü BİRLİKTE taşı.
- **SENTRY PROJE EŞLEŞMESİ (2026-09-16):** her uygulama KENDİ projesine yazar —
  web `rothern-web`, admin `rothern-admin`, API (canlı + staging) `rothern-api`.
  Öncesinde canlı web/admin/API'nin HEPSİ `node-nestjs` projesine yazıyordu:
  kaynak haritaları `rothern-web`/`rothern-admin`e yüklenirken olaylar başka
  projeye düşüyordu → yığın izi okunmazdı ve uyarı kuralları yanlış projedeydi.
  `node-nestjs` artık ESKİ kayıt deposu; yeni olay almamalı.
- **PNPM KURULUM İZİNLERİ TEK YERDE (`pnpm-workspace.yaml` `allowBuilds`):**
  `package.json` `pnpm.onlyBuiltDependencies` yazmak o listeyi EZER; 2026-09-16'da
  Prisma izni düştü ve temiz Vercel derlemesi "has no exported member
  PrismaClient" ile kırıldı (yerelde node_modules'te eski istemci durduğu için
  görünmedi). Yeni bir paketin kurulum betiği gerekiyorsa `allowBuilds`e ekle.
- **VERCEL PRO (2026-09-16):** takım `rothern` Pro'ya geçti (Hobby ticari
  kullanıma kapalıydı ve SLA yoktu). Açılan ayar: **sapma koruması 12 saat** —
  kullanıcı eski sekmeyle dolaşırken yeni sürüm yayınlanınca eski varlıklar
  12 saat daha servis edilir (aksi hâlde "chunk yüklenemedi" hatası).
- **VERCEL FONKSİYON BÖLGESİ `fra1` (2026-09-16):** web ve admin sunucu
  fonksiyonları `iad1`de (Washington) koşuyordu; API (Render Frankfurt) ve
  veritabanı (Supabase eu-central-1) Avrupa'da → her SSR isteği okyanusu
  geçiyordu. Bölge `apps/*/vercel.json` `regions` ile KODA bağlandı (proje
  ayarından değil: ayar panelde sessizce değişebilir, dosya incelenebilir).
  Doğrulama: yanıt `x-vercel-id` başlığı `fra1::fra1::…`.
- **`NEXT_PUBLIC_CDN_URL` Vercel'de TANIMLI (2026-09-16):** production
  `cdn.rothern.com`, preview `cdn.staging.supkeys.com`. `next/image`
  `remotePatterns`ı bu değerden türetiyor; tanımsızken CDN'den gelen görseller
  `next/image` yolunda 400 alırdı (bugün o yolu yalnız yerel kategori
  görselleri kullanıyor, bu yüzden görünür bir hata yoktu).
- **`NEXT_PUBLIC_API_URL` HER ZAMAN `/api` sonekli** (`https://api.rothern.com/api`,
  staging `https://api.staging.supkeys.com/api`): API `setGlobalPrefix("api")`, web/
  admin sonek EKLEMEZ. 2026-09-11'de soneksiz değer canlı girişi ~14 saat kırdı
  ("Cannot POST /company-auth/login"). Doğrulama: canlı JS chunk'larında adresi ara.
  Vercel CLI yerelde yetkili (`--scope rothern`, `supkeys-web`/`supkeys-admin`).
- **`@rothern/email` değişince** `pnpm --filter @rothern/email build` şart.
- **Görseller `cdn.rothern.com`'dan servis edilir**, `pub-*.r2.dev` DEĞİL
  (o bucket'ın Public Development URL ayarı kapalı — coğrafi engel değil).
  Taşıma scripti `scripts/migrate-public-images.ts` (2026-09-05'te koşuldu,
  DB'de artık `r2.dev` adresi yok).
- Demo doluluk: `pnpm --filter @rothern/db seed-marketplace-demo` (idempotent
  ama SİLMEZ; kaldırma `cleanup-marketplace-demo`). Yerel dev = staging DB.

## Test & Kalite

- API **177 dosya** (parçalı koşum, 2026-09-12 yeşil; i18n birimi 2026-09-23)
  · web **146 / 824** (2026-09-23, Faz 1e kapanış) · admin **17 / 84** · i18n **6 / 22**.
- **Bağımlılık kapısı (2026-09-12):** CI'da `pnpm audit --prod --audit-level high`.
  Tarama yokken üretim bağımlılıklarında 2 kritik + 20 yüksek birikmişti
  (Next 15.5.18 RCE uyarısı dahil) → Next 15.5.25 + hedefli `pnpm.overrides`
  ile kritik ve yüksek SIFIRA indi. Kalan 6 ORTA uyarı ana sürüm göçü ister ve
  bilinçli ertelendi: `@nestjs/core` 10→11, `file-type` 16→21 (ESM-only),
  `uuid` 8→11, `@opentelemetry/core` 1→2.
- **Staging e2e (2026-09-11/12):** `pnpm --filter @rothern/web e2e:staging` — 87 test
  (`e2e/staging-*.spec.ts`: satın alma zinciri, satış zinciri + admin ürün onayı,
  rol kapıları, firma doğrulama + Destek rolü, mobil 400 px, **izin matrisi**,
  **ekran matrisi**, **çok tedarikçili teklif**, **pazarlık turu**, **yazma
  yetkisi matrisi**, **firmalar arası yalıtım**, **onay akışı dar bağlamı**).
  **Yazma matrisi BOŞ GÖVDE ile sınar** (guard doğrulamadan önce çalışır →
  yetkisiz 403, yetkili 400); boş gövdeyle gerçekten iş yapan uçlar bilinçli
  DIŞARIDA (`docs/submit`, `items/product`, `users/seat-selection`, rapor
  indirme, AI). Hız sınırı GLOBAL guard olduğu için izin kapısından ÖNCE çalışır
  → sondada 429 görülürse bir kez beklenip yinelenir.
  **Onay akışı testi akışı PASSIVE'e çekmeden bitmemeli** — aktif
  `LISTING_AWARD` akışı kalırsa sipariş zinciri ve teklif turları da onaya düşer.
  **Kayıt turu** (`staging-signup.spec`) doğrulama kodunu POSTA KUTUSUNDAN
  değil veritabanından alır: kod `sha256` (tuzsuz) saklanıyor, 10^6 uzay
  anında geri çevriliyor. Test sonunda firma + kullanıcı + Supabase hesabı
  silinir (`e2e/db-helpers.ts`). Staging bağlantısı PgBouncer üzerinden
  geldiği için Prisma'ya `pgbouncer=true` verilmeli, yoksa "prepared
  statement does not exist".
  **E-POSTA KOTASI:** staging ücretsiz Resend kademesinde günde 100 e-posta
  gönderiyor. Testler bildirim üreten akışları çalıştırdığı için yoğun günlerde
  kota doluyor (2026-09-13: ürün tavanı testinin temizliği her koşumda 10
  "düzeltme istendi" bildirimi üretiyordu → test ürünleri artık YENİDEN
  KULLANILIYOR, koşum başına ~1 bildirim). `staging-email-content.spec`
  kota hatasını ortam sınırı sayar ve ayrı raporlar; diğer teslimat hataları
  kırmızı kalır.
  **429 metni Türkçe (2026-09-19):** `ThrottlerModule` `errorMessage` →
  `common/http/throttle-message.ts` (giriş formu API mesajını olduğu gibi
  basıyor; kütüphane varsayılanı "ThrottlerException: Too Many Requests" idi).
  **Giriş ucu IP başına 10/dk** (`@Throttle({ auth: … })`): paket büyüdükçe
  tek tek girişler 429 alıp ÜRÜN HATASI gibi görünüyordu → `apiSession`
  e-posta bazında ÖNBELLEKLİ, `uiLogin` 429'da 20 sn bekleyip yineler; eski
  spec'lerin kendi `login()` yardımcıları da bu yola bağlandı.
  **Rol denetimi beklentisi ELLE YAZILMAZ:** `e2e/role-endpoints.ts` API
  kaynağındaki `@RequireCompanyPermission`/`@RequireTier`'ı okur
  (`CompanyPaidTierGuard` @RequireTier'sız = SILVER; `ALL_SEAT_PERMISSIONS` gibi
  sabitler shared'den çözülür; yorumlar temizlenir yoksa "KULLANILMIYOR" yazan
  açıklama guard sanılır). Çıktılar `docs/qa-role-matrix.md` (11 rol × 62 uç)
  ve `docs/qa-role-screens.md` (8 rol × 23 sayfa). Panel kapıları İSTEMCİDE
  çizilir → sınıflandırma tek ölçümle değil, sonuç kesinleşene kadar YOKLAYARAK
  yapılır. QA hesapları
  `seed-staging-roles`; sırlar `.env.staging` + `render.staging.env`
  (gitignore'lu). Sonuç matrisi `docs/qa-launch-matrix.md`, bulgular
  `docs/qa-punchlist.md`. Kurulum adımları API'den, kullanıcıya görünen adımlar
  tarayıcıdan; her aktör AYRI `browser.newContext()` (aynı bağlamda kullanıcı
  değiştirmek oturum anlık görüntüsüyle yarışıp girişe düşürür).
  **Tam API suite bu makinede tek koşumda bellek nöbetçisine takılır** →
  10 dosyalık `--runInBand` parçalarla FOREGROUND koş (~9 dk); `pkill -f jest`
  kendi komut satırını da öldürür.
  2026-09-09 SEO turu: API birim 46 suite yeşil (integration bu makinede
  Docker olmadığı için KOŞULAMADI — sonraki koşumda `public-profile.spec`
  website/linkedinUrl beklentisi güncellendi); web tam suite yeşil.
- **Test DB lokal izole Postgres** (`docker-compose.test.yml`, pg17); remote
  Supabase'e koşulmaz (`test/integration/env.ts` fail-fast).
- **`40P01` TRUNCATE deadlock'un kök nedeni Prisma bağlantı havuzuydu** →
  `test-db.ts` PrismaClient'ında **`connection_limit=1`**. Ağır suite'ler artık
  BİRLİKTE koşar.
```bash
pnpm --filter @rothern/api test:db:up    # lokal test PG (bir kez)
pnpm --filter @rothern/api test          # tüm spec'ler
NODE_OPTIONS=--experimental-vm-modules npx jest <spec>   # tek spec (pdfjs için env şart)
pnpm --filter @rothern/api test:db:down
```
- Kapsam: RBAC matrisi, IDOR, multi-tenant scope, auth attack, DTO validation,
  state machine. Coverage hedefi kritik dosyalarda %80 (auth, ödeme,
  multi-tenant scope, state machine).

### Zamanlanmış işler (cron) — çift tetikleme kilidi

15 `@Cron` işi var ve hepsi tek ortak sarmalayıcıdan geçer
(`trackCronRun`). 2026-09-12'de **advisory lock** eklendi: ikinci bir API
örneği açıldığı gün her iş iki kez koşacaktı (çift hatırlatma, çift özet,
çift temizlik). Kilit `CronLockService`'te, `trackCronRun` onu
`CronRegistryService.lock` üzerinden okur → **scheduler'ların hiçbiri
değişmedi**.

İki tuzak koda yazılı: (1) advisory lock OTURUMA bağlıdır, `DATABASE_URL`
PgBouncer'dan geçtiği için kilit ayrı ve tek bağlantılı `DIRECT_URL`
istemcisinden alınır; (2) **fail-open** — kilit altyapısı bozulursa iş
ATLANMAZ, koşar (aksi hâlde tek yapılandırma hatası tüm cron'ları sessizce
durdururdu). Sözleşme: `test/unit/cron-lock.spec.ts`.

### Sürüm akışı — dal koruması BYPASS EDİLEBİLİYOR

`production` dalında "PR şart + Test kontrolü" kuralı var ama depo sahibi admin
olduğu için `git push origin production` kuralı BYPASS ederek geçiyor (uzak
"Bypassed rule violations" uyarısı basıyor). **2026-09-12'den beri `gh` kurulu
ve yetkili** (`repo`, `workflow` kapsamları) → doğru yol:
`gh pr create --base production --head main` + `gh pr merge --merge`. Doğrudan
push yalnız acil durumda. **Birleştirmeden sonra hemen
`git checkout main`** — 2026-09-12'de `production`da kalınıp oraya commit
atıldı, `checkout -B` ile dal sıfırlanınca commit düştü (reflog'dan kurtarıldı).

### CSRF duruşu (üretim) — KAPANDI, guard açık (2026-09-12 doğrulandı)

Bu bölüm önceden "üretimde `SameSite=none`, double-submit baypas, `lax`
önerisi kullanıcı kararı bekliyor" diyordu. ARTIK GEÇERSİZ: Render
`rothern-api` ortamında `COOKIE_SAMESITE=lax` ve `COOKIE_DOMAIN=.rothern.com`
tanımlı, yani double-submit guard üretimde AÇIK.

`www`/`admin`/`api` aynı kayıtlı alan adı altında olduğu için `lax` çerezleri
göndermeye devam eder. `staging-csrf.spec.ts:53` ("oturum var ama CSRF başlığı
yok → mutasyon reddedilir") bu duruşu her gecelik koşumda CANLI sınar.

İki katmanlı derinlik hâlâ yerinde: (1) API **yalnız JSON** gövde okur —
urlencoded/text parser bilerek kaldırıldı, ön-uçuş gerektirmeyen "basit" form
POST'u gövdesiz kalır; (2) JSON içerik tipi ön-uçuşu zorunlu kılar, CORS beyaz
listesi yabancı kökeni reddeder.

`COOKIE_SAMESITE` ve `COOKIE_DOMAIN` bir ÇİFTTİR — `lax` iken domain boşsa
çerezler host-only yazılır, `www` `rk_csrf`'i okuyamaz, tüm mutasyonlar 403
olur. `prod-config-sanity.ts` bunu boot'ta fail-closed yakalar (`main.ts:89`).

## Güvenlik Durumu

✅ Auth/IDOR/RBAC E2E · httpOnly cookie + CSRF · CSP nonce tabanlı
(`strict-dynamic`, **`force-dynamic` ZORUNLU** — statik prerender nonce alamaz)
· Pino redact + Sentry (kritik-audit ve webhook imza hataları `reportToSentry()`)
· `resolveClientIp` (`TRUST_CF_CONNECTING_IP=true` prod) · admin `tokenVersion`
+ şifreli TOTP sırrı · Supabase Auth 429/5xx → 503.

**SUPABASE VERİ API'Sİ KAPALI (2026-09-16, ölçülerek bulundu).** Staging'de
anonim anahtarla (tarayıcıya giden AÇIK değer) `password_reset_tokens`,
`email_verification_codes`, `platform_admins`, `company_users` dahil TÜM public
tablolar PostgREST üzerinden okunabiliyordu. Uygulama o API'yi hiç kullanmıyor
(Supabase istemcisi yalnız API'de, yalnız Auth için) → `public` şeması "exposed
schemas"tan çıkarıldı; canlıda Data API zaten tümüyle kapalıydı. Doğrulandı:
anonim istek artık `PGRST205` ile 404. **Supabase'de Data API'yi AÇMA** — açılırsa
RLS'siz 25 tablo (staging) yeniden dışarı açılır. Ayrıca: sızmış parola koruması
iki projede AÇIK; canlı Auth Site URL `https://www.rothern.com` (eskiden
localhost'tu); compute iki projede MICRO (ücretsiz yükseltme); canlı projenin
Supabase adı `rothern-prod` (eskiden yanıltıcı biçimde `dev-supkeys`).

**E-POSTA TESLİM İZLEME (2026-09-16):** Resend webhook'u CANLIDA zaten kuruluydu
(`/api/webhooks/resend`, imza sırrı dolu, 200 dönüyor), STAGING'e yeni eklendi —
staging `RESEND_WEBHOOK_SECRET` girilene kadar guard imzasız isteği REDDEDER.
Canlı kancanın `skipped: email_log_not_found` yanıtı BEKLENEN: 2026-09-15'te
canlı `email_logs` tablosu boşaltıldı, eski mesajların olayı eşleşecek kayıt
bulamıyor. Gönderen: canlı `notification@rothern.com`, staging
`staging@supkeys.com`. DNS: iki bölgede de DMARC (`p=none`) ve geniş CAA seti
(Cloudflare yönetimli; issue + issuewild) var.

**SENTRY KAYNAK HARİTALARI YÜKLENİYOR (2026-09-16).** Vercel'de `SENTRY_AUTH_TOKEN`
(gizli, kullanıcı girdi) + `SENTRY_ORG=rothern` + `SENTRY_PROJECT=rothern-web|
rothern-admin` + **`SENTRY_URL=https://de.sentry.io`** (kuruluş EU bölgesinde —
bu değişken olmadan yükleyici yanlış bölgeye gider). İKİ TUZAK birlikte
yaşandı: (a) pnpm 10 `@sentry/cli`nin kurulum betiğini ATLIYOR → yükleyici
binary hiç inmiyor; kök `package.json` `pnpm.onlyBuiltDependencies`e eklendi.
(b) eklenti `silent: true` idi → yükleme hiç olmasa da derleme YEŞİL görünüyordu;
kapatıldı, artık günlükte "Uploaded files to Sentry" + `Release: <commit>` satırı
aranabilir. Doğrulandı: staging ve canlı, web ve admin.

Dört değişken de web ve admin projelerinde HEM production HEM preview'da tanımlı
(2026-09-16 doğrulandı).

**SENTRY UYARI KURALLARI KURULDU (2026-09-16):** üç projede "yeni hata" →
takım e-postası; web ve api'de ayrıca "bir saatte 50+ olay" kuralı (tekrar
aralığı 30 dk). NOT: her projede Sentry'nin hazır "high priority issues" kuralı
da duruyor → yeni ve öncelikli bir hatada İKİ e-posta gelebilir.

⏳ Bekleyen: log drain. **Gecelik e2e ve canlı sağlık denetimi artık kırmızıya düşünce depoda
KONU AÇIYOR** (aynı başlıkta açık konu varsa yorum ekler — her gece yeni konu
gürültü olurdu). `audit_logs` doldurma DOĞRULANDI (staging 3.539 kayıt; giriş,
ürün güncelleme, adres oluşturma izleri yazılıyor).
(2026-09-16 doğrulandı: Vercel'de `SENTRY_DSN` + `SENTRY_ENVIRONMENT` web ve
admin için HEM production HEM preview'da TANIMLI — eski "yok" notu geçersiz.)

**Ön yüz hata izleme (2026-09-12):** tarayıcıda Sentry SDK'sı YOK ve
OLMAYACAK — paylaşılan pakete 83 kB ekliyordu (103→186 kB), organik arama
stratejisine doğrudan zarar. Yerine hafif işaretçi: `lib/client-error.ts`
(`window.error` + `unhandledrejection` + hata sınırları) olayı birkaç alanla
`/api/client-error` rotasına yollar, Sentry'e SUNUCUDA yazılır. Çerez
gönderilmez, adresteki jetonlar `lib/sentry-scrub.ts` ile ayıklanır (şifre
sıfırlama `?token=`, davet `/davet/<token>`), sayfa başına 5 ve IP başına
30/dk tavanı var. DSN yoksa sunucu günlüğüne düşer. Kaynak haritası yalnız
`SENTRY_AUTH_TOKEN` varken yüklenir (`withSentryConfig`).
⚠️ `SENTRY_DSN` boşsa error tracking ve alarmlar tümüyle pasif (tek fail-open
servis); Supabase/R2/Resend env'leri eksikse app boot ETMEZ (fail-closed).
⚠️ RLS: 2026-09-16 staging aktivasyonu ürün keşfini BOŞ döndürdü (`company_items`
politikası çapraz okumayı gizliyor) → staging geri alındı, çapraz okumalar bypass
client'a bağlandı (`rls-cross-tenant-reads.spec`); staging'de YENİDEN AÇILDI ve
e2e paketi RLS açıkken yeşil (2026-09-16 gece). **CANLIDA DA AÇIK (2026-09-17):**
`rothern_app` rolü, Render `DATABASE_URL` kısıtlı rol / `DATABASE_URL_BYPASS`
sahip rol / `RLS_ENABLED=true`; sağlık, herkese açık uçlar ve giriş doğrulandı.
Tuzak: canlı pooler `aws-1-eu-central-1`, staging `aws-0-…` — adres örneği
kopyalanınca ilk dağıtım düştü. Kill-switch: `RLS_ENABLED=false` + `DATABASE_URL`
sahip role (İKİSİ BİRLİKTE). **Kural: çapraz-firma okuyan yeni kod bypass client
kullanır; bayrağı kapatırken DATABASE_URL de sahip role dönmeli.**
Mekanizma: RLS 23 tabloda kurulu; uygulama `rothern_app` (NOBYPASSRLS)
rolüyle bağlanır, `RLS_ENABLED=true`, firma bağlamı her istekte `SET LOCAL
app.current_company_id` ile yazılır; adımlar `docs/pre-launch-hardening.md`
Faz 1'de. **Boot kapısı (2026-09-22):** `RLS_ENABLED=true` iken
`DATABASE_URL_BYPASS` boşsa API açılmaz (`checkRlsBypassConfig`) — bypass
istemcisi sessizce kısıtlı role düşüp sağlık/giriş/cron'u bozamaz.

---

## Bekleyen / Yapılacaklar

> Sürüm/faz kademesi YOK — tek backlog, gruplar yalnızca konuya göre.

**Site bitince — EN SON (kullanıcı kararı 2026-09-09)**
- Google Search Console + Bing Webmaster: `https://www.rothern.com/sitemap.xml`
  gönder; sahiplik `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` /
  `NEXT_PUBLIC_BING_SITE_VERIFICATION` (HTML etiketi) → Vercel → redeploy.
- `INDEXNOW_KEY` + `SEO_REVALIDATE_SECRET` Render ve Vercel'e (AYNI değer);
  Render `WEB_URL` = `https://www.rothern.com`. Ardından
  `pnpm --filter @rothern/web seo:audit`. Adımlar: `docs/launch-checklist.md`
  § SEO yayın anı bildirimi.
- **KÜNYEYE TELEFON NUMARASI** (2026-09-13, numara kullanıcıda): Mesafeli
  Sözleşmeler Yönetmeliği satıcı için telefon ZORUNLU tutuyor, künyede yok.
  Numara gelince `lib/company-info.ts` `OPERATOR`a `phone` alanı eklenir ve
  ÜÇ yere basılır: `/iletisim` künye satırı, mesafeli satış "1. Satıcı
  Bilgileri" bloğu, JSON-LD `organizationNode` → `contactPoint[0].telephone`.
  MERSİS eklerken izlenen yolun aynısı.

**Ürün**
- STANDART → paketli upgrade akışı + ödeme (**PayTR**; iyzico reddetti, Stripe
  TR şirketi kabul etmiyor) + escrow
- Kazandırma geri alma (un-award) — riskli, sonraya (satıcı reddi istisnası 2026-09-19'da geldi, bkz. Mimari Kararlar 7)
- WebSocket real-time bildirim
- Admin: impersonate (güvenlik değerlendirilecek), iade/refund, CSV export,
  dahili not, global arama
- i18n Faz 2–3 (`docs/plan-i18n.md`): panel metinleri (2, cırcır 426 dosya /
  6.023 literal) · API istisna/DTO/bildirim/e-posta (3). Faz 4 kategori adları
  2026-09-23'te BİTTİ; nitelik etiketleri/süzgeç değerleri küçük artık.
  Faz 0 + Faz 1 (herkese açık yüzey, kimlik akışı, dil seçici) + Faz 1e
  (içerik otomatik çevirisi) + Faz 4 (kategori adları) 2026-09-23'te BİTTİ.
  Canlı sırası: üç migration (`20260923120000` locale, `20260923180000`
  content_translations, `20260923230000` category_names_i18n) → PR #57 →
  `apply-category-names-i18n` (TSV'den, model yok) → Render `AI_MODEL_PREMIUM`
  Vertex'in tanıdığı Pro adı (yapıldı) → admin backfill (canlı boş, gerekmez).

**Teknik borç**
- **Tablo okuma tek kaynağı yarım:** `listing-item-import.service.ts` hâlâ
  `spreadsheet-reader.ts`'in KENDİ kopyasını taşıyor — güvenlik düzeltmesi İKİ
  dosyaya da uygulanmalı (ya da o yol tek kaynağa taşınmalı).
- `Supplier.sectors` deprecated kolon kaldırılmalı (migration).
- `@rothern/email` build'i CI'da otomatikleşmeli.
- Ürün dizini sırası ham `tier` okur (cron'a dek 1 gün sapma); publish tavanı
  TOCTOU (kilit yok).
- İlan listelerinde süzgeç hâlâ sorguda — ürün dizinindeki yol-parçası
  dönüşümü oraya da yapılmalı (`/alim-talepleri/kategori/<kod>`).

**AI katmanı** (AI-0…AI-4 BİTTİ — altyapı, belge→talep, asistan, aksiyon çerçevesi)
- AI agent layer (event-bus, MCP, `/api/agents/v1/...`)
- Akıllı şartname motoru, manipülasyon tespiti ("Tercihlerimi Getir" →
  Talep Şartları ile KAPANDI 2026-09-09)

**PROFİL AI'ı ÜCRETSİZDE DE AÇIK — FİRMA BAŞINA BİR KEZ (2026-09-14, kullanıcı
kararı).** `profile-enrich` tek AI özelliği olarak `minTier: "STANDART"` geçer;
merkezi kapı (`assertAiAccess`) varsayılanı SILVER ve öyle KALIR. Adet kapısı
ömürlük: `AiUsage` içinde `feature="profile_enrich"` sayılır (aylık bütçe değil
— bu tekrarlayan bir özellik değil, bir kerelik kurulum adımı). STANDART'a
0,5 USD aylık havuz açıldı; diğer AI özelliklerine ULAŞMAZ çünkü hepsi merkezi
SILVER kapısının arkasında. Gerekçe: dolu profil = indekslenen sayfa = organik
büyüme; tek çağrılık maliyet bilinen en ucuz müşteri edinme. Sözleşme:
`profile-enrich-tier.spec.ts` (para harcayan kapı).

**Profilde "AI ile doldur" düğmesi kendi kendine yeter:** metin kutusunun
ÜSTÜNDE durur ve site girilmemişse YERİNDE sorar (eskiden pasifti ve ipucu
"künyeye girin" diyordu — künye sayfanın en altındaydı). Adres istek GÖVDESİNDE
gider; boş gövde yollanınca sunucu DB'deki kaydedilmemiş/boş değeri okuyordu.

**AI çerçevesinin değişmez kuralları:** model ASLA doğrudan yazamaz —
`request_*` araçları yalnız doğrulanmış `pendingAction` üretir (tek kullanımlık,
10 dk TTL); yürütme YALNIZ kullanıcının confirm ucuyla (CSRF'li) → prompt-
injection zinciri yapısal kırık. Yetki = kullanıcının yetkisi. Onay kartı
içeriği backend özetidir, model metni değil. Bütçe/tavanlar `callAi` kapısından.
**GOTCHA:** Gemini 3 function-calling'de `thoughtSignature` geri beslemede
korunmazsa 400; fnResponse turundan sonra boş user turu EKLEME.

---

## Claude Code Çalışma Kuralları

- `/loop` KULLANMA — her görev tek seferde bitsin.
- "Doygunluğa ulaştı" / "scope dışı" dediğinde **DUR**, yeni tur açma.
- Üretim kodunu değiştirmeden önce **onay bekle**.
- Her büyük görev başında **plan çıkar, onay bekle**, sonra uygula.
- Büyük dosyaları (>1000 satır) modül modül oku.
- Yeni dependency sormadan ekleme. Production secret'ı plain text yazma/loglama.
- "Refactor edeyim mi" deyip kapsamı genişletme — sadece istenen iş.
- `--dangerously-skip-permissions` ile riskli komut çalıştırma.

## Git
Repo `git@github.com:ugur-062/supkeys.git` — GitHub adı `ugur-062/supkeys`
(marka rothern oldu, DEPO ADI DEĞİŞMEDİ; `gh api repos/ugur-062/rothern/…` 404 döner) ·
branch `main`. Her özellikten sonra commit + push (commit'i bekletme).
**`gh pr edit` ÇALIŞMIYOR** (2026-09-23: GitHub Projects classic GraphQL hatası) →
`gh api -X PATCH repos/ugur-062/supkeys/pulls/<N> -f title=… -F body=@dosya`.
