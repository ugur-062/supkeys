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
   Kazandırma UYGULANDIĞI an (onay sonrası `onAwardApproved` dahil)
   `assertWinningBidsAwardable` geçerliliği ve teklifçiyi (askı/pasif → 400) yeniden
   denetler. **RFQ istisnası (derin denetim 2026-09-29 MU-20):** "Yeni Tur"da AUTO
   taşınan SUBMITTED teklif turda BİR KEZ yeniden gönderilebilir (`carriedBidRevisable`:
   ENGLISH_AUCTION değil ∧ currentRound>1 ∧ bid.round=currentRound ∧ activeBidRound≠
   currentRound), taslağa çekilemez; her gönderim `activeBidRound` yazar (eski satırlar
   migration `20260929230000`); web `myBid.canReviseCarried` okur.
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
9. **Body parser 5MB**; belgeler R2 presigned URL ile. **Public kovaya
   (`tenant-profile/`) presigned PUT Content-Type'ı İMZALAR** (`generatePresignedPut`,
   derin denetim 2026-09-29 Y-01): istemci upload-url'e verdiği `mimeType`ı PUT'ta
   BİREBİR gönderir, yoksa R2 403. HEAD MIME kontrolü (`assertUploadedObjectValid`)
   ikinci hat; reddedilen nesnenin silme hatası yutulmaz, anahtar loglanır.
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

## Kayıt Ülkeleri — TÜM ÜLKELER, KAPALI LİSTE HARİÇ (2026-09-27)

Kullanıcı kararı: "tüm ülkeler kayıt olabilsin, Amerika hariç". Tek kaynak
`@rothern/shared` `data/country-profiles.ts` `REGISTRATION_BLOCKED`: **ABD +
toprakları (PR, GU, VI, AS, MP)** ve **kapsamlı yaptırım ülkeleri İran, Kuzey
Kore, Suriye, Küba** (ABD'li altyapı sağlayıcılarının — Vercel, Cloudflare,
Supabase, Resend — kullanım koşulları yasaklıyor). 2026-09-01 – 09-27 arası
yalnız sekiz ülke açıktı (`docs/plan-country-registration.md` tarihsel).

- **Ülke listesi TAM** (`data/countries.ts` `COUNTRY_TABLE`: 245 = ISO +
  `XK` Kosova + `XN` KKTC; kod · Türkçe ad · telefon kodu). STATİK (Intl'den
  türetilmez — sunucu/tarayıcı ICU farkı hidrasyon uyuşmazlığı üretirdi); EN/RU
  adı `countryDisplayName` (Intl + `XN` elle). `XN`/`XK` bayrağı çizilmez.
- **Profil:** özel profiller (TR, KKTC, RU, AZ, KZ, UZ, CN, AE) aynen; profili
  olmayan her geçerli ülke `getCountryProfile` ile VARSAYILAN yabancı profil
  alır — **3 belge** (sicil + vergi kaydı + yetkili kimliği/pasaportu; kullanıcı
  kararı), `usesIban` SWIFT IBAN kaydından (`data/iban-countries.ts`), AB üyeleri
  `EU` grubu + VIES (`EU_VAT_COUNTRIES`; VIES Yunanistan için `EL`, numaradaki
  ülke öneki atılır).
- **BANKA KURALI TEK KAYNAK `helpers/bank-details.ts` `bankDetailsErrors`:**
  bankanın ülkesi IBAN kullanıyorsa IBAN (TR katı, diğerleri mod-97); değilse
  **hesap no + SWIFT/BIC + banka adı** (geçerli IBAN da kabul). **FİRMA
  DOĞRULAMASINDA SWIFT HER ÜLKEDE ZORUNLU** (`{ requireSwift: true }`, kullanıcı
  kararı aynı gün; TR dahil). API `assertBankDetails` (doğrulama `submit`,
  Banka Hesapları, profil, admin); web formları aynı fonksiyonu çizer. IBAN'sız
  ülkede `Company.iban` kolonu HESAP NUMARASINI taşır; `bankSwiftBic`/`bankName`
  ayrı kolon. Banka hesabı defterinde IBAN isteğe bağlı (`accountNumber`,
  `swiftBic`, `bankCountry`); sipariş kabulü hesap no/SWIFT/banka adını da
  kaydeder. Eskiden IBAN'sız ülkenin satıcısı hesap kaydedemediği için SİPARİŞ
  KABUL EDEMİYORDU. SWIFT de KYC kilidinde (IBAN gibi).
  **Yaptırım kapısı üç izden (derin denetim 2026-09-29 MU-17):** banka ülkesi
  (servis) + IBAN öneki (hesap no alanındaki geçerli IBAN dahil) + SWIFT 5-6.
  karakter; son ikisi `bankDetailsErrors` içinde (`ibanCountryBlocked`/
  `swiftCountryBlocked`, erken döner) → API `BANK_COUNTRY_BLOCKED`. Belirli kodlara
  bakan her kapı (admin `assertKycIdentityComplete` dahil) bu iki kodu açıkça işler;
  admin onayı banka eksiğini elle değil `bankDetailsErrors(requireSwift)` ile ölçer
  (`*Required` eksik, `*Invalid` kilitlemez — MU-02).
  IBAN zorunlu olmayan ülkede dolu `iban` alanı geçerli olmalı; hesap no alanındaki IBAN
  biçimli ama mod-97'si tutmayan değer (`isMistypedIban`) `ibanInvalid` verir, hesap no
  sayılmaz (derin denetim 2026-09-30 LU-10).
- **Kapalı ülke keşifte aranmaz, davet almaz (MU-09):** tek kaynak
  `external-invite-policy.ts` `registrationBlockedCountry(etiket, e-posta uzantısı,
  site uzantısı)` (herhangi bir ipucu yeter; uzantı tanınsın diye ülke
  `country-time-zone.ts`te olmalı, `.as` genel ek `GENERIC_CC_TLDS`). Davet kuyruğa
  alınırken VE dağıtıcının gönderim anında denetlenir (MANUAL dahil `COUNTRY_BLOCKED`);
  talep `targetCountries`inde 400 `TARGET_COUNTRY_BLOCKED` (sessiz süzme yok); Talep
  Şartları normalize kapalı ülkeyi süzer, liste boşalırsa firma ülkesine daralır.
- **Hukuki yapı `OTHER`** + `Company.legalFormLocal` (GmbH, LLC, ООО,
  kooperatif…); "Diğer" seçilince yerel ad zorunlu.
- **Adres:** `CompanyAddress.stateRegion`; ülke tam listeye göre doğrulanır;
  her adres gösteriminde ülke (`usePlaceLabel`); hızlı talep "adres ekle" ülke
  seçer (eskiden "TR"ye SABİTTİ); posta kodunda harf serbest (TR hariç).
- **Aranabilir ülke seçici** `components/ui/country-combobox.tsx` (kayıt,
  adres, hızlı talep adresi, banka ülkesi). Telefon: tam liste, ortak kodda
  birincil ülke (+7 → RU, 7xx → KZ; +1 → US), numarasız seçilen ülke kaybolmaz.
  Çok alan kodlu NANP ülkeleri (DO 809/829/849, JM 876/658, PR 787/939) `COUNTRY_TABLE`'da
  "1" kodunu taşır, ülke `phone-codes.ts` `NATIONAL_PREFIX_COUNTRY` ile alan kodundan
  bulunur, ulusal numara alan kodu dahil 10 hane; tek alan kodlu ada ülkeleri 4 haneli kod
  ("1268") + 7 hane (LU-10).
- **Türkiye'ye özgü kalanlar (bilinçli):** MERSİS, vergi dairesi, KEP
  yalnız TR (şehir sayfaları ve "Yakınımda" aynı gün dünya geneline açıldı —
  aşağıda "DÜNYA ŞEHİRLERİ"). Para birimi listesi 2026-09-27'de 21'e çıktı
  (bkz. "ULUSLARARASI TUR 2").
- Migration `20260927120000_global_registration` (eklemeli). Sözleşmeler:
  `country-profiles.spec`, `bank-details-phone.spec`, `onboarding.spec`
  (kapalı liste + DE/OTHER), `foreign-verification.spec` (SWIFT), `bank-accounts.spec`,
  web `country-combobox.test`, onboarding VIES testleri (yeniden etkin), admin
  `docs-tab.test` (belge seti API'den `requiredDocs`).

Kapı YALNIZ YENİ KAYDA uygulanır: kapalı ülkedeki mevcut firmanın belge seti
ve ekranları çalışmaya devam eder.

**YABANCI KAYIT DENETİMİ (2026-09-27, 14 ülke tek tek yürütüldü) — kurallar:**
- **Slug çeviriyazısı** (`helpers/slug.ts`): Türkçe eşleme ÖNCE (Türkçe slug'lar
  birebir aynı), sonra Kiril (ru/uk/kk) + ß/ł/ø/æ…; Çince/Arapça boş slug verir →
  firma `company-<rothernid>`, ürün `product-<id sonu>` (Türkçe "firma-37" DEĞİL);
  boş sonek tek `IN` sorgusuyla (`pickFreeSlug`). Kiril başlıklı talebin adresi
  `rot-000007` → `rot-000007-<latin>` (eskisi 308).
- Ad/soyad tek harf olabilir (王, 李): DTO `@Matches(/\S/)`.
- Telefon: `+`/`00` ile yazılan tam numara ülkeyi değiştirir; ulusal ön sıfır
  düşer (IT/SM/VA… hariç); +1 → CA (US kapalı), ortak kodda seçili ülke korunur.
- Saklanan şehir METNİ tek biçim (`storedCityName`): eşlendiyse TR/XN Türkçe,
  diğerleri İngilizce yazım — seçici arayüz dilinde verse de ("Мюнхен" → "Munich").
- Saat: gösterim İstanbul duvar saati KALIR; en/ru'da saat metnine "(GMT+3)"
  eklenir (`appZoneLabel`), tarih-saat GİRDİSİ de İstanbul duvar saatiyle okunur
  (`parseAppWallClockInput` — eskiden tarayıcı saatiyle okunup İstanbul'la
  gösteriliyordu).
- Yeni talebin para birimi varsayılanı ülkeden (`defaultCurrencyForCountry`: TR/XN
  TRY, euro ülkeleri EUR, GB/CH/JP/AE/CN/RU kendi, diğerleri USD) — kayıtlı
  Talep Şartları önce gelir.
- Admin firma düzenlemesi SWIFT/banka adı yazar (`assertBankDetails`), ülke kodu
  tam listeden doğrulanır.
- Bilinçli açık: ülke dışı ziyaretçi (Çince/Arapça) Türkçe varsayılana düşer
  (`localeDetection: false`); Çince/Arapça şehir adıyla arama yok (GeoNames
  alternatif adları Latin/Kiril süzülerek alındı).

**DÜNYA ŞEHİRLERİ + ÜLKE SAYFALARI (2026-09-27, kullanıcı: "şehir sayfaları
türkiye özel olamaz, bu uluslararası bir sistem").** Tablo `geo_cities`
(migration `20260927150000`): GeoNames `cities15000` (nüfus ≥15.000, TR
HARİÇ, ~33,7 bin) + Türkiye'nin 81 İLİ (id = -(1000+plaka), slug bugünkü il
slug'ı — `/urunler/sehir/bursa` DEĞİŞMEZ; GeoNames'in ilçe ölçekli TR
şehirleri alınmaz) + 6 KKTC şehri (id -2001…, slug `xn-…`); tek kaynak
`@rothern/shared` `data/geo-special-cities.ts`. `Company.cityId` +
`CompanyAddress.cityId` (FK yok). Yabancı slug `<cc>-<ad>` (`de-munich`).
- **Okuma:** API açılışta tabloyu belleğe alır (`GeoCityService` →
  `setGeoIndex`); saf fonksiyonlar `geoIndex()` okur, yüklenmeden önce
  (açılış, birim testi) TR+KKTC YEDEĞİ döner; tablo boşken/hata verince 5 dk'da
  bir yeniden dener (`GEO_RELOAD_RETRY_MS`, örnek başına; yedekteyken public/geo
  kısa önbellekli `GEO_FALLBACK_CACHE_CONTROL`) → seed sonrası API'yi yeniden
  başlatmak GEREKMEZ (derin denetim 2026-09-29 Y-21). `resolveParam` kalıcı adres +
  ESKİ ham il adı (`?sehir=İstanbul` gönderilmiş bağlantılar) çözer.
- **Yazma:** `resolveCityId(ülke, metin, cityId?)` — istemcinin id'si aynı
  ülkedense o, yoksa metinden (`pickGeoCity`: TR il adı; diğer ülkede herhangi
  dildeki TAM ad ya da yerel yazım); eşleşmezse null, metin yine kaydedilir
  (yalnız şehir sayfası/süzgecine girmez). Kayıt, Firma Bilgileri, adres
  defteri, hızlı talep satır içi adresi, admin düzenleme bağlı. Web
  `CityCombobox` (serbest yazım açık; Headless `Input` — düz `<input>`
  Catalyst `Label`ına bağlanmaz). Uçlar `GET public/geo/cities?q&country`,
  `GET public/geo/cities/:slug`.
- **Süzgeç/facet:** şehir facet'i `{city: slug, name, country, count}` (ad
  okuyucunun dilinde); `?ulke=<CC>` SATICI ÜLKESİ süzgeci + facet'i (ürün ve
  firma dizini, panel dahil); "Yakınımda" dünya genelinde (haversine; yabancı
  posta kodu ÇÖZÜLMEZ, rakam yalnız TR). Ülke sayfası `/urunler/ulke/<cc>-<ad>`
  (EN `/products/country/…`, RU `/tovary/strana/…`), sitemap `countries`
  parçası, llms-full şehir+ülke listesi, IndexNow şehir+ülke sayfası.
- **Atıf:** GeoNames CC BY 4.0 — altbilgide ("Şehir verisi: GeoNames");
  kaldırma.
- **Kurulum sırası (staging ve canlı):** migration → `pnpm --filter
  @rothern/db seed-geo-cities` (TSV `src/seeds/geo-cities.tsv` depodadır;
  yeniden üretmek `GEONAMES_DIR=… build-geo-cities`) → `backfill-city-ids`
  (`--dry` önce) → `backfill-price-base` (`--dry` önce; ürün fiyat süzgecinin
  TRY tabanı, bkz. "ULUSLARARASI TUR 2"). Seed koşulmadan API TR yedeğiyle
  çalışır, yabancı şehir sayfası 404 verir. **Veri betikleri ENV_FILE'ı
  `packages/db/prisma/scripts/lib/script-env.ts` `prepareScriptDatabase(label)`
  ile okur** (yeni betik `new PrismaClient({ datasourceUrl: prepareScriptDatabase("<ad>") })`;
  `process.env.DIRECT_URL || DATABASE_URL` YAZILMAZ — Y-21'de geo betikleri canlı
  yerine staging'e yazıyordu). İlk satır `[<betik>] hedef veritabanı: <host> (proje
  <ref>)` — çalıştırınca önce buna bak. Sözleşme: `script-env.spec`,
  `geo-city-reload.spec`, `geo-index.spec`, `product-facets.spec`,
  `public-product-index.spec`, `seo-index.spec`, i18n `pathnames.test`.

**ULUSLARARASI TUR 2 (2026-09-27, kullanıcı: "her biri doğru dillerde gitmeli,
davette kalemler olsun ki cazip gelsin, dil kusursuz, filtreler dahil tüm
ülkelere uygun").** 6 denetim + 9 paralel düzeltme paketi. Kurallar:
- **KAYITSIZ ALICININ DİLİ ÜLKEDEN** (`@rothern/i18n` `recipientLocale`):
  satırda seçilen → ülke (TR/XN/AZ tr; RU/BY/KZ/KG/UZ/TJ/TM/AM ru; UA/GE/MD/
  Baltık dahil diğerleri en) → e-posta/site ccTLD → davet edenin dili. Dış talep
  daveti, AI keşfi (aday `country` ISO-2 taşır), "tedarikçini davet et" ve
  ekip daveti (diyalogda dil seçici) bu kuralla; dil `CompanyReferralInvite.
  locale` / `CompanyUserInvitation.locale`e yazılır, yeniden gönderim aynı
  dili kullanır; kayıt/kabul bağlantısı o dilin ön ekiyle → hesap o dilde doğar.
  Misafir bilgi talebi `PublicInquiry.locale`. KAYITLI alıcıya her zaman
  `CompanyUser.locale`.
- **DIŞ DAVET E-POSTASI = BEYAZ LİSTE** (`TenderExternalInviteData`, içerik tek
  kaynak `common/company/external-invite-content.ts` `InviteContentBuilder`):
  DAVET EDEN FİRMANIN ADI, numara, ilk 10 kalem "ad — miktar birim" (+N), şehir
  + ülke, son tarih (GMT+3), kategori (çoğul), aranan tedarikçi tipi, vitrindeyse
  herkese açık sayfa, "kapalı zarf" + "ücretsiz" cümleleri; kayıt bağlantısı
  `redirect=/company/ilan/<id>`. Hedef fiyat, şartname, marka, belge, ticari
  şart, tam adres ASLA. Konu "ABC İnşaat sizden teklif istiyor: M6 cıvata,
  Rulman +1 kalem", gönderen "ABC İnşaat (Rothern üzerinden)" (`inviteFromName`;
  görünen ad RFC 5322 tırnaklı). Çeviri gelmediyse gönderim 10 dk'ya dek
  ertelenir, sonra özgün metin. Soğuk davet konusunda emoji yok; alt bilgideki
  alan adı gönderen ortamdan (`renderEmail(…, { siteUrl })`), yıl dinamik.
  `/company` kökü `?redirect=` niyetini onboarding durumu bilinmeden tüketmez.
- **BİLDİRİM PARAMETRELERİ TİPLİ** (`common/notifications/notification-params.
  ts`): `dateParam`/`moneyParam`/`numberParam`/`listingTitleParam` alıcı başına
  ve alıcının dilinde çözülür (İstanbul duvar saati, en/ru "(GMT+3)", talep
  başlığı alıcının dilindeki çeviriden). Başka firmaya giden bildirime ÖNCEDEN
  biçimlenmiş tarih/tutar ya da ham başlık VERİLMEZ. "Davetiniz kabul edildi"
  onboarding BİTİNCE (gerçek firma adıyla) gider; kayıttaki geçici ad "Ad Soyad".
- **PARA:** tek liste `@rothern/shared` `CURRENCY_CODES`/`CURRENCY_ENUM` (21;
  Prisma enum'la birebir; DTO'larda elle liste YAZILMAZ). Yeni birim = enum +
  migration (`ADD VALUE` ayrı dosya) + `fx-rates.ts` yedek kuru + `CURRENCY_
  SYMBOLS`. KZT/UZS/PLN/CZK/HUF TCMB'de yok (ikinci kaynak gelince). Sembol
  tek kaynak `CURRENCY_SYMBOLS` (belirsiz sembol yok: JP¥/CN¥, A$/CA$, kr/лв
  yerine ISO); **YERİ dilden** `affixCurrency` (İngilizcede önde "$1,200.00",
  harfli kodda "CHF 1,200.00"; tr/ru sonda). Mesajlar tek `{amount}` alır —
  `{amount} {currency}` kalıbı YAZILMAZ. Ürün fiyat süzgeci/sıralaması/
  histogramı `CompanyItem.priceAmountBase` (TRY karşılığı; yazımda + her kur
  çekiminde ham SQL ile tazelenir) üzerinden, `?para=` (varsayılan ziyaretçide
  dil, panelde firma ülkesi). Pano/rapor firma rapor biriminde
  (`reportCurrencyOf`: Talep Şartları ana birimi → ülke birimi). Yeni ürün
  firma ülkesinin birimiyle doğar. **Çok-birimli teklifte kalem fiyatı HER ZAMAN
  kalemin kendi biriminde** (`bi.currency ?? bid.currency`; derin denetim
  2026-09-29 Y-14); TRY karşılığı API `report-currency.ts` `itemUnitPriceTry` ⇔ web
  `lib/tenders/bid-item-price.ts` (`bidItemUnitPriceTry`/`rankBidsForItem`) — TRY
  çevrimsiz, ana birimle aynı × teklif kuru, farklı × `fxToBase` × teklif kuru;
  damgasız = null → kıyas dışı, ön-seçilmez. Karşılaştırma raporunda genel toplam `totalTry`.
  **Kazandırılmış kalem fiyatı `awardedBidForItem`** (derin denetim 2026-09-29 MU-18;
  kalem↔kazanan ilişkisi saklanmaz): tek fiyatlayan kazanan → kazandırma siparişinde
  (sellerCompanyId = teklifçi) ad + birim fiyat eşleşmesi → en az tasarruflu fiyat
  ("kazananlar arasında en düşük" YANLIŞ). Tasarruf/hacim `awardedSavingsVolumeTry`
  (pano Tasarruf + analitik; teklif kalemleri doğrudan toplanmaz); kategori kırılımı
  segment koduna yuvarlanır, `categoryName()` ile, tutar yüzdeyle aynı `byKey` satırından.
- **WEB BİÇİM:** para/sayı/yüzde/tarih HER ZAMAN arayüz diliyle
  (`useFormatMoney`, `useFormatDate`, `formatPercent`, `intlLocale`); `formatDate`
  dilde ZORUNLU parametre. `"tr-TR"` literali ve `toLocale{Lower,Upper}Case("tr")`
  yalnız izinli dosyalarda (`no-hardcoded-intl-locale.test`). Tutar girişi
  (`MoneyInput`) arayüz dilinin ayraçlarıyla okur (EN "12,500" = 12500).
  Baş harf büyütme `upperForText` (Türkçe harf yoksa dilden bağımsız).
  **Miktar + birim DİLİN ÇOĞUL KURALIYLA:** web `useQuantityLabel` / saf
  `quantityWith` (lib/seo/entities), API `quantityDisplay` (common/i18n/
  unit-label), e-posta `email.domain.qty` — katalog `*.qty.<KOD>` ICU çoğul
  ("100 pieces", "100 коробок", "100 adet"). `${n} ${unitLabel(u)}` yapıştırma
  YASAK (EN/RU "100 piece" basıyordu, herkese açık ürün sayfasında da); mesaj
  tek `{qty}` alır. Tekil etiket yalnız birim TEK BAŞINA ("₺50 / piece",
  sütun başlığı) gösterilirken.
- **GÜN/SAAT (derin denetim 2026-09-29 MU-07/MU-25/MU-27):** tarih seçicisinden gelen
  gün aralığı API'ye YALNIZ `appDayRangeIso(start, end)` (`lib/time-zone.ts`: İstanbul
  00:00 → günün son ms'si); `new Date("YYYY-MM-DD")` (UTC gece yarısı = TR 03:00) ve
  `new Date("…T23:59:59")` (tarayıcı saati) YASAK. Tarih-only form alanı UTC gece yarısı
  yazılır, `getUTC*` ile okunur. AI kapanışı `parseClosingInstant` (yalnız gün → 23:59
  İstanbul, ofsetsiz → İstanbul duvar saati); asistan istemine her turda
  `assistantClockContext()`, onay kartında `formatNotificationDate(…, "dateTime")` —
  ham ISO basılmaz.
- **AI ÇIKTI DİLİ** (`common/i18n/ai-language.ts`, kural satırı istemin SONUNDA):
  İÇERİK alanları (başlık, açıklama, anahtar kelime, kalem, tanıtım) GİRDİNİN
  dilinde — çevrilmez (karışık dilli kayıt çeviriyi FAILED'e düşürüp kaydı
  hiçbir dilde indekslenemez yapıyordu); kullanıcıya görünen özet/gerekçe/eksik
  alan etiketi arayüz dilinde. Model ipucu metni (categoryHint) ham basılmaz.
  `missingRequired` KOD (`AiMissingField`), etiket istemcide. AI arama dünya
  şehri + ülke + para birimi süzgeci üretir. AI istemleri bilinçli Türkçe →
  cırcır artışı `ratchet:update --force` ile kabul edilir (yalnız istem dosyası).
- **SİSTEM METİNLERİ KODLA** (`@rothern/shared` `system-text.ts`, `[[KOD]]
  metin`; red gerekçesi `verification-reason.ts` `[KOD] not`): platformun
  yazdığı gerekçe/not/ödeme yöntemi/adres başlığı/yetkili unvanı Türkçe cümle
  olarak SAKLANMAZ; eski Türkçe kayıtlar tanınır (`legacy-system-texts.ts`,
  `localizeDefaultAddressTitle`). Boş durum/"bulunamadı" cümleleri türe göre
  tam cümle; paket tavanı gibi sayılar `{limit}` parametresiyle.
- **KAYIT/KYC:** VIES yanıtı `isValid` (`valid` DEĞİL; `userError`
  MS_UNAVAILABLE/TIMEOUT… = "servis yanıt vermedi", `"---"` ad/adres = null;
  sonuç audit `company.vies_checked`). Vergi no `normalizeTaxId` (ИНН/VAT/ülke
  öneki, Arap-Hint rakamı) + kural başına uzunluk, web ve API AYNI fonksiyon;
  etiket katalogda (`web.domain.taxId.*`), yerel ad `taxIdLocalName`. Telefon
  ulusal ön eki ülke başına ("0", RU/KZ/BY/TM/TJ "8", HU "06"), uzunluk
  ülkeye göre (`isValidPhoneNumber`/`IsIntlPhone`), varsayılan ülke dilden.
  "IBAN isteğe bağlı" ülkeler (BR, CR, DO…) hesap no + SWIFT kabul eder; IBAN
  uzunluğu ülkeye göre. Kapalı ülke banka ülkesi ve admin ülke düzenlemesinde de
  reddedilir. Onboarding ülkeyi telefon/dilden başlatır (EN'de seçim zorunlu),
  mahalle adres satırına eklenir (yalnız TR), yabancı firma Firma Bilgileri'nde
  eyalet/bölge düzenler. Onboarding başlığı "Şirket bilgileri" (doğrulama DEĞİL).
- **SÜZGEÇ/UYGUNLUK:** Açık Talepler şehir süzgeci kalıcı slug (`?sehir=
  de-munich`; ham metin yedeği) + alıcı ülkesi (`?ulke=`). Ülke kısıtlı talep:
  herkese açık sayfada "Yalnız … merkezli tedarikçiler" notu; panelde uygun
  olmayan firmaya 404 değil 403 `COUNTRY_NOT_ELIGIBLE` (+ `targetCountries`,
  içerik YOK; görünürlük kuralı önce). Talep dizininde ülke süzgecinin anlamı
  "Teklif verebilecek tedarikçi ülkesi" (sayı = tüm ülkelere açık + o ülkeyi
  hedefleyen). Birim eşanlamlıları EN çoğul + RU (шт, кг, кв.м…).
- **SEO/GEO:** hreflang/x-default/sitemap YALNIZ hazır diller (`buildMetadata(
  { locales })`, API detay `readyLocales` + `sourceLocale`; x-default hazır
  ilk dile tr → en → ru). Sözleşme sayfaları yalnız tr (EN/RU kanoniği TR).
  `?sayfa=N` kendi kanoniği, süzgeçli varyant tabana (`lib/seo/landing.ts`);
  şehir/ülke sayfası `MIN_LANDING_PRODUCTS = 3` altında noindex + sitemap dışı.
  JSON-LD `inLanguage` yalnız sayfa düğümünde (ItemPage/ProfilePage/WebPage),
  varlık `@id` dilden bağımsız (TR adres + `#product`/`#company`/`#demand`),
  fiyatsız ürün `offers` taşımaz, ülkesiz firmaya "TR" yazılmaz. Kaynak dilde
  gösterilen blok `lang` taşır. Kök `/llms.txt` İNGİLİZCE, dil sürümleri
  `/<dil>/llms(-full).txt` (`web.marketing.llms.*`, istemciye gitmez). Dil
  yönlendirmeleri tek sıçrama (`localizedRedirectDestination`; next.config
  `@rothern/i18n` import eder). Yandex doğrulaması `NEXT_PUBLIC_YANDEX_SITE_
  VERIFICATION`. Kategori iniş sayfası facet taramasına değil segment + ürün
  `total`ına dayanır.
- **TERİMLER:** EN talep = "buying request" (herkese açık adresle aynı; paket
  satın alma isteği "purchase request" kalır), teklif = "quote" (yalnız "sealed
  bid"), kalem = "line item", giriş "log in", sektör "Industry", satış tarafı
  "Sales", ABD yazımı, sentence case. RU "Вы/Ваш" büyük, onay = "согласование/
  Согласующий", açık eksiltme "аукцион на понижение", eleme "исключить/
  исключено" ("отклонить" yalnız ret), bağlantı "контакт", paket "тариф".
Sözleşmeler: `recipient-locale.test`, `tender-external-invite-email.spec`,
`invite-email-status.spec`, `content-translation-wait.spec`, `notification-
params.spec`, `currency-conversion.spec`, `new-currencies.spec`, `price-base-
refresh.spec`, `foreign-verification.spec` (gerçek VIES biçimi),
`foreign-kyc-identity.spec`, `ai-output-language.spec`, `system-text.spec`,
web `no-hardcoded-intl-locale.test`, `money.test`, `price-currency-filter.test`,
`country-slugs.test`, `llms.test`, `landing.test`.

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
  ön ekle açar) tek geçiş yolu. **YOL PARÇALARI ÜÇ DİLDE (2026-09-24,
  kullanıcı kararı "hangi dilse o dilde"):** `/en/products/category/<kod-ad>`,
  `/ru/tovary/kategoriya/…`, `/en/companies/<firma>/products/<ürün>`,
  `/en/buying-requests/<slug>`, panel `/en/company/purchasing/my-requests`,
  `/ru/kompaniya/zakupki/moi-zayavki` (panel kökü dile göre; Türkçe `/company`
  olduğu gibi — gönderilmiş e-postalar kırılmasın). Rusça LATİN çeviriyazı
  (Kiril paylaşımda `%D0…` oluyordu). Varlık slug'ları hiçbir dilde değişmez —
  TEK İSTİSNA ülke sayfası `[ulke]` (`de-almanya` · `de-germany` ·
  `de-germaniya`; `@rothern/i18n` `country-slugs.ts` + `PARAM_LOCALIZERS`).
  TEK KAYNAK `@rothern/i18n` `ROUTE_PATHNAMES` (iç şablon → dil başına dış
  şablon; `translateRoutePath`/`internalRoutePath` saf, edge-safe). next-intl
  `routing.pathnames` middleware'de dış→iç yeniden yazar ve yanlış biçimi
  (`/en/urunler`, `/products`, `/ru/company/login`) doğru biçime 308'ler.
  **KOD İÇ (Türkçe) YOLU YAZAR:** `Link href="/urunler"`, `router.push`,
  `redirect`, `localizePath` girdisi hep iç yol; çeviriyi `@/i18n/navigation`
  sarmalayıcısı ve `@/i18n/href` yapar (next-intl dize adresi şablona
  eşlemez, `usePathname` dinamik rotada ŞABLON döner → sarmalayıcı şart;
  istemci hook'ları `navigation-client.tsx`te, sunucu importu için ayrı).
  `usePathname`/`stripLocale` her zaman İÇ yol döner (menü aktiflik ve
  `/company/login` karşılaştırmaları dilden bağımsız). `isPublicRoute`
  (CSP profili) dış yolu iç yola indirger — indirgemeseydi `/en/products`
  nonce'lu CSP alıp statik HTML'in betikleri engellenirdi. Yeni sayfa =
  `ROUTE_PATHNAMES`e satır; `pathnames.test` üç dil + çakışma ister.
  Tek kaynaklar: `src/i18n/{routing,navigation,navigation-client,request,href,params}.ts`.
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
- **DIŞ adres ve düz `<form action>` (derin denetim 2026-09-29 Y-13/Y-17):**
  `@/i18n/navigation` HER ZAMAN iç yol bekler; DIŞ (dil önekli) adres önce
  `stripLocale`den geçer. Bildirim CTA'sı (`AppNotification.ctaUrl`, API'de
  alıcının dilinde mutlak dış adres) router/Link'e yalnız `notificationHref(ctaUrl,
  fallback)` (`@/i18n/href`) ile verilir. JS'siz GET formunun `action`ı sarmalayıcıdan
  geçmez → `localizePath(iç yol, locale)` (sunucuda `getLocale()`, bileşende
  `useLocale()`); sözleşme `search-form-locale.test`.
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
- **`next/navigation` HOOK'U SUNUCUDAN İMPORT EDİLEN MODÜLDE OLAMAZ (2026-09-24,
  yerel `next build` yakaladı; tsc/vitest/lint görmedi):** `usePathname` içeren
  modül bir sunucu bileşeninden import edilince derleme "needs usePathname …
  Client Component" ile düşer. Kural: hook'lar `"use client"` dosyada, kabuk
  modül yeniden dışa aktarır (`navigation.tsx` ↔ `navigation-client.tsx`).
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
  JSON-LD ve `llms-full.txt` (dil sürümleriyle) aynı fonksiyondan; `faq.test` üç dilde
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
  dil `loadPublicJson`un `unstable_cache` anahtarında AÇIKÇA yer alır (RM-12). Arama v1'de ÖZGÜN metinde
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
- **FAZ 2 — PANEL METİNLERİ (2026-09-24, kullanıcı: "her şeyi bitir, sonra canlıya
  alacağız"; parti parti):** ad alanı `web.panel.<alan>.<dosyaSlug>.<anahtar>`
  (`web.panel.shell.*` kabuk+panolar, `web.panel.requests.*` talep ekranları …);
  anahtar = Türkçe metnin ASCII camelCase kısaltması. Mekanik dönüşüm git dışı
  codemod ile (`apps/web/.tmp-i18n-codemod.ts`, TS AST: JSX metni, izinli
  öznitelik, toast, koşullu dize, basit şablon → `t()`; bileşene
  `useTranslations` enjekte eder; modül düzeyi sözlük / satır içi zengin metin /
  karmaşık koşum RAPORLANIR ve elle yapılır). **Kurallar:** (1) `web.panel`
  KÖK SAĞLAYICIYA GİTMEZ — `clientMessages()` ayıklar, `company/(authed)/
  layout.tsx` (sunucu) `panelMessages()` ile iç içe ikinci sağlayıcı kurar;
  herkese açık yüzeyle paylaşılan bileşen (`components/marketplace|marketing|
  home`, herkese açık sayfalar) `web.panel` OKUYAMAZ (`client-messages.test`
  dosya sisteminden zorunlu tutar) — paylaşılan pano parçaları
  `web.marketplace.panelHome`. (2) Menü/rota etiketleri KATALOG ANAHTARIDIR:
  `MODULE_LABELS`/`PORTALS`/`COMPANY_AREA`/`routeLabel`/`getCompanyBreadcrumb`
  değerleri `web.panel.nav.*` anahtarı, çizim `useNavLabel()` (`tn(item.label)`);
  `fromLabel` sorgu parametresi anahtar taşırsa detay sayfası çevirir.
  (3) Sözlükler hook oldu (`i18n/domain.ts`): `useEntityLabels` (hâl ekli
  Satın Alma Talebi sözlüğü — EN/RU'da hâl yer tutucusu cümle içinde kalır),
  `useListingTerms`, `useFormatPaymentPlan`, `useListingStatusLabel`,
  `useSellerStateLabel` (`deriveSellerTenderState().key`), `useRoleLabel`,
  `useTierLabel`, `useAiFeatureLabel`, `useAuditActionLabel`, `useLcTypeLabel`,
  `useTransportModeLabel`, `useCurrencyName` (Intl), `useRelativeTime`,
  `useOrderStatusLabel`/`useOrderStepLabel` (sipariş listesi + detayı TEK
  sözlük), ürün durumu `useProductStatusMeta` (`products/product-status-label.ts`);
  eski TR sözlükler (`lib/company/labels.ts`, `lib/tenders/labels.ts`,
  `lib/company/terms.ts`) göç bitene dek durur, yeni kod hook kullanır; ölü
  sözlükler silindi. Modül düzeyi Türkçe yardımcı (`timeAgo`, `timeLabel`,
  `relaxedNote`) → hook (`useRelativeTime`, `useTimeLabel`, `useRelaxedNote`).
  (4) Zod şemaları `make…Schema(t)` fabrikası + `useMemo`. (5) EN/RU'yu Claude
  yazar: `pnpm i18n:sync --out` listesi parçalara bölünüp paralel çevirmen
  ajanlarına verilir, `--apply` ile uygulanır; `i18n:check` yasaklı terimi
  (Türkçe kaynakta "ihale" dahil) yakalar. (6) Tuzaklar: JSX `&apos;` gibi
  entity'ler decode edilmeli; `t` adı bileşende başka bağ olabilir (tema `t`,
  `.map((t) =>`) → codemod çakışmada `tr`/`tPanel`; varsayılan parametre
  değeri (`countNoun = "ürün"`) `t` görmez → gövdeye taşı; typed
  `t(key)` dize anahtarla `as never`; codemod VERİ değerlerini de çevirir
  (`<option value>`, `accept` uzantıları, DOM id'leri, sıralama değerleri) →
  yazma turundan sonra elle geri alınır; kaydedilen `unit` Türkçe ad kalır (API
  sözlüğü), yalnız etiket çevrilir. Partiler 1-5 (kabuk/panolar · talep
  ekranları · teklif/sipariş/ürün/bilgi talebi · ayarlar/şirketim/onaylar/
  raporlar/paketler · lib sözlükleri) BİTTİ.
- **HER ÜRÜN VE TALEP ÜÇ DİLDE — İSTİSNASIZ (2026-09-25, kullanıcı: "bir ürünün
  veya alım talebinin eklendiği diller hariç diğer dillerde karşılığı olmaması
  mümkün değil"; SEO/GEO dahil).** Dört halka: (1) **Tetik** — ürün ONAYA
  GÖNDERİLDİĞİ an (`publish`) çevrilir, onayda EN/RU hazırdır; talep yayında;
  firma profil kaydında. (2) **Kapsam denetimi** `ensureCoverage` (5 dk
  süpürücü, AI açıksa): görünür kayıt (vitrindeki/onay bekleyen ürün,
  YAYINLANMIŞ her durumdaki talep, metni olan kayıtlı firma) çeviri satırı yoksa
  ya da `updatedAt`i son çeviri/denetimden yeniyse kuyruğa alır — `enqueue`
  çağırmayan yollar (admin düzenlemesi, seed/e2e betikleri, özellikten önceki
  kayıtlar) böyle yakalanır; kaynak aynıysa satırlara "denetlendi" damgası
  vurulur. Kalıcı FAILED 6 saat sonra yeniden denenir. Taslak çevrilmez (yalnız
  sahibi görür, HAM okur). (3) **SEO** — çeviri DONE olunca `SeoIndexService`
  tetiklenir (sayfalar çevrilmiş içerikle tazelenir); IndexNow her adresi ÜÇ
  dilde bildirir (`localizedIndexNowUrls`); web tazeleme ucu `/<dil><iç yol>`
  biçimlerini de tazeler. (4) **Çevirisi henüz gelmemiş dil sayfası `noindex`**
  (`translationPending`: ürün `product.translationPending`, talep/firma
  `indexable:false`) — EN adreste Türkçe içerik asla indekslenmez. Kural TEK
  saf fonksiyonda: `readyLocales` (kaynak dil + metni olan diller; satır yoksa
  YA DA kaynak dili henüz bilinmiyorsa Türkçe varsayılır — 2026-09-26'ya dek ilk
  çeviri beklerken/kalıcı FAILED'de TÜRKÇE sayfa da `noindex` alıyordu). Arama
  metni HAM SQL ile yazılır: Prisma `updateMany` `@updatedAt`i ilerletip sitemap
  lastmod'unu ve kapsam denetimini bozardı. (5) **Sitemap her dil sürümünü AYRI
  `<url>` verir** (2026-09-26; önceden yalnız TR `<loc>`tu, EN/RU yalnız
  alternatif — EN `<loc>` sayısı 0 ölçüldü): `sitemap-parts.ts` `located(path,
  extra, locales)`, her girdide tam hreflang seti + `x-default`; ürün/talep/firma
  YALNIZ hazır dillerinde (API sitemap satırı `locales` — `readyLocalesFor`,
  sayfanın `noindex`iyle aynı kural; eski API'de alan yoksa tüm diller). Parça
  5.000 kayıt (API `SITEMAP_PAGE_SIZE` = web `PART_PAGE_SIZE`; × dil sayısı
  50.000 sınırının altında). (6) **SEO denetimi üç dilde**
  (`seo:audit`, `VERCEL_BYPASS=` ile staging): her parçadan her dil örneklenir;
  html lang, og:locale, hreflang kendini içerir + x-default, JSON-LD
  `inLanguage`, EN/RU başlık/açıklama/h1'de küçük harfli Türkçe-harfli sözcük
  (sözleşme h1'i `lang="tr"` muaf) ve her hreflang adresi 200. Sözleşme:
  `content-translation-coverage.spec`, `seo-index-locales.spec`,
  `public-marketplace.spec` "HAZIR dillerinde", web `sitemap.test` "sitemap
  dilleri", `seo-audit-checks.test` "diller".
- **ÇEVİRİ KALİTESİ v2 (2026-09-25, kullanıcı: "kusursuz olmalı, sonradan
  eklenenler de kaliteli çevrilmeli"):** 75 kayıtlık dil incelemesi (EN 7/10, RU
  6,5/10) sonrası: (1) istem yeniden yazıldı — sayı biçimi, hedef dil birim
  sembolleri, false-friend listesi (pano→switchboard/щит, plaza→business centre…),
  Türkiye'ye özgü kısaltmalar (OSB, GES, AG/OG, KDV) açılır, anahtar kelime =
  tam arama ifadesi, sözlüğe kazandırma/pazarlık/kalem; (2) **kesin son işlem**
  (`polishTranslations`): kaynak Türkçeyken Türkçe biçimli sayı hedefte aynen
  kalmışsa yeniden biçimlenir (en 1,200 · 0.02; ru 1 200 · 0,02), Rusçada
  sayıdan sonraki Latin birim Kiril olur; (3) **ret + geri bildirimle yeniden
  deneme**: içerik yasaklı terimleri (en tender; ru тендер/конкурс — UI
  kataloğundan ayrı, orada "открытые торги" meşru), küçük harfli Türkçe-harfli
  sözcük (çevrilmemiş), İngilizcede Kiril. "15 bin" → "15,000" kabul edilir.
  (4) `TRANSLATION_PROMPT_VERSION` kaynak özetinin ÖNEKİDİR (`v3:<özet>`,
  `SOURCE_HASH_PREFIX`) — istem/kural anlamlı değişince ARTIR: kapsam denetimi
  `sourceHash NOT LIKE 'v<N>:%'` satırları da seçer ve her kaydı yeni kalitede
  yeniden çevirir; bitene dek eski çeviri gösterilir (sayfa noindex'e düşmez).
  **TUZAK (2026-09-26 bulundu):** sürüm önceden yalnız özetin İÇİNDEYDİ ve
  kapsam denetimi kaydı yalnız varlığın `updatedAt`i ilerleyince seçiyordu →
  v2'ye geçişte staging'deki 459 kaydın HİÇBİRİ yeniden çevrilmedi (taramada
  49 kayıtta TR sayı biçimi, Latin birim, Kiril "А4", çevrilmemiş şartname).
  v3 = parça kodu koruması. Metni boşalan kaydın eski satırları `enqueue`de
  silinir (kuyruğun başını tıkamasın).
  (5) Kapsama yeni alanlar: ürün `specification`; talep `terms`, `paymentNote`,
  kalem açıklaması/şartnamesi (`details`), kalem soruları — YALNIZ doluyken
  kaynağa girer (boş anahtar eski kayıtların özetini değiştirmesin). (6) Okuma
  hatası düzeltildi: nitelik etiketi katalogdan okuyucunun dilinde geldiği için
  çift Türkçe etiketle eşleşmiyor, serbest metin nitelik DEĞERLERİ EN/RU'da
  Türkçe kalıyordu → eşleme değer üzerinden. (7) Nitelik BİRİMİ okuyucunun
  dilinde (`attributeUnitLabel`: ay→mo./мес., kişi→people/чел.…). Gemini 3'te
  temperature DEĞİŞTİRİLMEZ (Google önerisi 1.0). Değerlendirme yöntemi:
  kusurlu kayıtlar yerel betikle (`--env-file`, DB'ye yazmadan) yeniden
  çevrilip eski/yeni karşılaştırılır. Sözleşme: `content-translation.spec`
  (kalite katmanı v2, nitelik değeri), `attribute-unit-label.spec`.
  **İkinci tur (2026-09-26):** taze 30 gerçek kayıtta EN 8,8/10 · RU 8,0/10
  (v1: 7 / 6,5). Yakalanan GERİLEME: Rusça birim dönüştürücüsü parça
  kodlarını bozuyordu ("HP 26A"/"CF226A" → Kiril А). Kural: sayı bir kodun
  parçasıysa (önünde harf/rakam) dokunulmaz, TEK harfli birim (A V W m g l t)
  yalnız BOŞLUKTAN sonra çevrilir. **Kod koruma kapısı** (`codeTokens`/
  `codeErrors`): kaynaktaki büyük harf+rakam kodları (M6, CF226A, 6205-2RS,
  S420MC, DN50) her çeviride AYNEN olmalı; Latin+Kiril karışık sözcük ret.
  İstem: kodlar Latin, Istanbul/Izmir yazımı, litre "L", ana/yan sanayi,
  kontrakt mebel, fatura→счёт.
- **HER KAYNAK DİL (2026-09-27, kayıt tüm ülkelere açıldı; denetimde 16
  senaryodan 12'si yanlış karar veriyordu):** model kaynak dili ISO 639-1 kodu
  döner (`normalizeSourceLocale`; not "kaynak: Almanca" basar). `enqueue`
  çeviri gelmeden kaynak dili TAHMİN eder: sahibi TR/XN → "tr", değilse "und"
  → `readyLocales` hiçbir dili hazır saymaz (Almanca metin Türkçe adreste
  `lang="tr"` ile İNDEKSLENMEZ). Kapılar: sayı karşılaştırması yalnız rakamla
  (Rusça "1 200,50" = "1.200,50"), büyüklük sözcükleri her dilde (bin/thousand/
  тыс./Mio./万…), Arapça-Hint rakam, tarihte yalnız yıl, uzunlukta CJK ×3.
  Türkçe HEDEF de denetlenir ("ihale" yasak, kaynağın aynısı = çevrilmemiş).
  Çince/Arapça vb. yazı hedefte kalamaz; en/tr'de Kiril yalnız kaynakta AYNEN
  geçen birkaç sözcük (Rus tüzel adı, çelik sınıfı). Sayı biçimi KAYNAK dilin
  kuralıyla okunup hedefin kuralıyla yazılır (`localizeNumbers(src,dst,hedef,
  kaynak)`; boşluk grubu yalnız ilk grup 1-2 haneyse). Kod sınırı yalnız
  Latin/Kiril (Çinceye bitişik "M6" korunur). Çeviri sürerken kaynak değişirse
  eski çeviri DONE yazılmaz, bitince yeniden (`dirty`). Kalıcı FAILED
  SIFIRLANMAZ: 6 saatte bir, toplam 9 denemeye dek (eskiden sonsuza dek günde
  ~24 Pro çağrısı). `TRANSLATION_PROMPT_VERSION` bilinçli ARTIRILMADI
  (kullanıcı: mevcut kayıtlar Türkçe demo). Sözleşme: `content-translation.spec`
  "kalite kapıları — her kaynak dil", `content-translation-coverage.spec`
  "yabancı firmanın içeriği".
- **ARAYÜZ KATALOĞU TAM İNCELEME (2026-09-26):** 6.961 anahtar × EN/RU, 8
  paralel incelemeci → 70 EN + 226 RU düzeltme (anlam: asistan "öneriyorum"
  kartları RU'da "yaptım" diyordu, paket bitiş bildirimi yanlış kuralı
  anlatıyordu; yer tutucu hâl ekleri; "Unvan"=Legal name). Terim kararları:
  RU **"ИИ"** (AI değil), bağlantı = **контакт**, resmî **"Вы"** tutarlı,
  ters açık eksiltme = "аукцион на понижение", "закрытые торги" YOK.
  **Sayı + sabit çoğul isim YASAK:** sayı ve isim TEK ICU çoğul mesajında
  (`{n, plural, one {# …} few {…} many {…} other {…}}`; TR `{n, number} …`);
  biçimlenmiş sayı DİZESİ çoğul mesaja verilmez (≥1000'de "NaN products"
  basıyordu — SEO başlıkları/OG). `ResultCount kind=…`, `CategoryTile`
  sayacı, aksiyon merkezi satırları bu kalıpla.
  ICU çoğula `n` her zaman SAYI verilir (derin denetim 2026-09-29 MU-24); aralık/metin
  değer (`employeeCount` "10-49", "250+") çoğula verilmez, düz `{range}` (MU-27); `{n}`
  içeren mesaj değersiz çağrılmaz — prod ham ICU basar, eksen birimi gibi yerde
  parametresiz ayrı anahtar (MU-18). Nitelik seçenek METNİ `optionLabels?.[o] ?? o`,
  DEĞER kanonik TR (MU-25). İstemcideki çıplak `fetch` (public/*) sayfa dilini
  `accept-language` ile açıkça yollar; dile bağlı istemci önbelleği dil başına (MU-27).
- **ÇOK DİLLİ ARAMA (2026-09-24):** `company_items`/`listings`/`companies`
  `searchTextI18n` (migration `20260924200000`, trigram GIN) = katlanmış KAYNAK
  + DONE EN/RU çeviriler (ürün ad+anahtar kelime — açıklama DEĞİL, talep
  başlık+açıklama+anahtar+kalem, firma sektör+hizmet+tanıtım). YALNIZ içerik
  çevirisi servisi yazar: `enqueue` (yeni kaynakla hemen) + DONE anı; açılıştan
  sonraki ilk süpürme mevcut çevirilerden yeniden kurar (model çağrısı yok;
  elle: `POST admin/content-translations/search-text/rebuild`). Sorgular
  `searchText` YANINDA buna da bakar: ürün dizini (`productSearchClauses` tek
  kaynak), talep araması (`searchWhere` — ham ILIKE dalları yedek), firma dizini
  (iki kopya), firma profili ürün araması (token artık katlanır — eskiden ham
  token "DAĞITIM"ı bulmuyordu). `stemPrefix` İngilizce çoğul toleransı taşır
  (pipes→pipe, boxes→box, batteries→batter; -ss/-us/-is dokunulmaz); Rusça
  çekim YOK. Kiril katlamada й→и (iki taraf aynı). Herkese açık projeksiyonlar
  sütunu taşımaz (sözleşme testlerinde yasaklı anahtar). Çevirisi olmayan kayıt
  (AI kapalı/FAILED) yalnız Türkçe yoldan bulunur.
- **FAZ 3 — API METİNLERİ (2026-09-24):** istisnalar, DTO mesajları, 429
  metni (`throttleMessage()`), bildirim/e-posta (ALICININ dili; e-posta paketi
  `@rothern/i18n` okur), eşleşme gerekçeleri, pano etiketleri (analitik
  önbellek anahtarı DİL içerir), Excel şablon yardım metinleri. **Excel SÜTUN
  BAŞLIKLARI, sayfa adları ve teslim süresi açılır değerleri TÜRKÇE KALIR** —
  yüklenen dosya başlık metniyle ayrıştırılıyor; çeviriler başlığı tırnak içinde
  Türkçe yazar. Ay kısaltmaları `shortMonthLabel` (Intl). Bilinçli kalanlar
  (cırcır 117 dosya / 915): sözleşme metinleri, AI istemleri, günlük/Sentry
  mesajları, admin modülleri, DB'ye yazılan gerekçeler, dev galerisi. **YENİ**
  API günlük/iç Error metni İngilizce ASCII yazılır (cırcır Türkçe harfli her
  literali sayar; kullanıcıya giden metin `i18nMessage`) — `ZipInspectError`
  mesajı iç tanıdır, sözleşme `reason` kodu (derin denetim 2026-09-29 regresyonu).
  `i18n:check` öksüz denetimi `status/*.json` kayıtlarını KAPSAMAZ: kaynağı olmayan
  durum kaydı sessizce geçer, elle temizlenir.
  **i18n kapısı yer tutucu paritesini ICU ayrıştırıcısıyla ölçer** (regex
  select dalındaki tek sözcüğü argüman sanıyordu); yasaklı terim araması
  argüman adlarını (`{tenderTitle}`) yok sayar.
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
- **Sistemin DB'ye yazdığı ad sonekleri** (akış çoğaltmada "— Kopya") istek dilinde
  üretilir, ayıklarken tüm `LOCALES` sonekleri tanınır (derin denetim 2026-09-30 LU-06).
  YES_NO kalem cevabı DB'de dilden bağımsız sabit (`YES_NO_ANSWER_VALUES`), her yüzeyde
  okuyucunun diline çevrilir (LU-21). Sözleşme sayfaları (`[locale]/sozlesmeler/*`) ISO
  `updatedAt` + katalog meta (`web.marketing.legal.<doc>.metaTitle/metaDesc`) taşır,
  bekçi `legal-pages.test` (LU-23).

---

## Konvansiyonlar
- Validation: react-hook-form + zod (web), class-validator (API DTO). Hata
  mesajları Türkçe. `<Field error hint>` sarmalama.
- Button: primary | secondary | ghost · sm | md | lg. Toast: sonner top-right, richColors.
- `<RequireAuth>` / `<RequireAdminAuth>` boundary; component yolu `@/components/*`.
- API çağrıları `useQuery`/`useMutation` + axios instance. Sipariş durumu/ödemesi değiştiren
  her mutasyon `invalidateOrderCaches(qc)` (orders + dashboard; derin denetim 2026-09-30 LU-24).
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
  Doğrulanmamış kayıtta e-posta düzeltme `POST /company-auth/signup/change-email` (eski
  adres + şifre, yalnız `emailVerifiedAt=null`); yeni kayıt açılmaz (LU-22).
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
- **Sorgu ve DTO (derin denetim 2026-09-30):** skip/take ile sayfalanan her `orderBy` benzersiz
  son anahtarla (`id`) biter (LU-01). Controller `@Body()`/`@Query()` her zaman DTO sınıfı —
  satır içi tip literali ValidationPipe'ı devre dışı bırakır; admin tarih sorgusu
  `Matches YYYY-MM-DD` + `IsISO8601({strict:true})` (LU-03/14/17). Nullable alanda `notIn`
  NULL satırları da eler → `OR: [{x: null}, {x: {notIn}}]` (LU-18). PATCH'te alanı temizlemek
  için `null` gönderilir, `undefined` JSON'dan düşer (LU-27).
- **Invariant ve yarış (LU-02/06/15):** "başka satırları sayıp kendi satırını yazan" kural (son
  SUPER_ADMIN, son yetkili) READ COMMITTED'da write-skew'e açık → saymadan önce ilgili
  satırları `SELECT … FOR UPDATE` ile kilitle. Deneme hakkı (e-posta kodu `claimCodeAttempt`)
  hash karşılaştırmasından ÖNCE koşullu `updateMany` ile ayrılır. Pasifleştirme her realm'de
  `tokenVersion`'ı artırır.
- **Audit log append-only (LU-05/20):** akış durumu için mevcut satır UPDATE edilmez; bitiş ayrı
  eylemle, `entityId` ile ilk satıra bağlanır (profil AI `company.profile_enrich_attempt` +
  `company.profile_enrich_settled`). Firma aktivite logu modül süzgeci `audit.service`
  `TENANT_ACTIVITY_MODULE_PREFIXES` (yeni `company.<modül>_xxx.*` ailesi listeye); Detay
  sütununda metadata kodları (`kind`, `reason`) ham basılmaz, katalog etiketi kullanılır.
- **Web para ve sayı (LU-22/25/28):** tutar elle `toLocaleString`/`${n} ${sym}` ile basılmaz —
  `formatMoney` ya da `affixCurrency(formatNumber(n, locale), code, locale)`, 2 ondalık
  `MONEY_FRACTION`; satır tutarı `lineAmount(qty, price)` (kuruşa ROUND_HALF_UP). i18n
  mesajındaki sayısal parametre `formatNumber`/`useFormatNumber` ile geçer (`toFixed`/`String`
  değil; TR/RU ondalık virgül). Kullanıcı kontrollü dış URL her render noktasında `safeExternalUrl`.
- **Web liste durumları (LU-26/27/29/25):** boş durum yalnız başarılı ve boş yanıtta; yükleme ve
  hata (`ErrorState` + refetch) ayrı dal. KPI drill-down `?status=` hedef listede
  `useSearchParams` ile başlangıç süzgecine okunur (virgüllü çoklu; KPI birden çok statüyü
  kapsıyorsa ayrıştırıcı da o kümeyi seçer — Kazanılan = WON + AWARDED_PARTIAL). Talep
  detayında Kalemler varsayılan sekme (tab eklenmez), Dosyalar `tab=1`. Absolute popover
  kapalı başlar, Escape ve dış tıklamayla kapanır. `CategorySelectorModal` reddi onaydan
  önce `validate` prop'uyla (sonra reddetmek taslağı kaybettirir).

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
| Arama katlama + tokenleme + kök (TR ek + EN çoğul) · kategori arama metni | `@rothern/shared` `helpers/search-fold.ts` (`stemPrefix`, `categorySearchText`) |
| Çok dilli arama metni (`searchTextI18n`) | `modules/content-translation` (`buildSearchTextI18n`, `refreshSearchText`) |
| Para/kur bazı · kalem toplamı · ödeme durumu | `common/company/{report-currency,bid-items,order-payments}.ts` |
| Teslim SÜRESİ → tarih | `common/company/delivery-time.ts` |
| Faz O dar-bağlam | `common/company/full-read-context.ts` |
| Web derin bağlantıları (CTA) | `common/company/app-routes.ts` |
| Public görsel yükleme · metin kalitesi | `common/company/{public-image-upload,public-text-quality}.ts` |
| Yüklenen tablo dosyası okuma · CSV seçenekleri · ZIP/xlsx açılım kapısı | `common/files/spreadsheet-reader.ts` (`readCsvInto` = kodlama + `csvReadOptions`; `detectCsvDelimiter`) · `common/files/zip-inspect.ts` (`assertZipWithinLimits`, `XLSX_LOAD_OPTIONS`) |
| Şahıs firması vergi no (TCKN) görünürlüğü | `common/company/visible-tax-number.ts` (`visibleTaxNumber`) |
| Kalem fiyatının TRY karşılığı (çok-birimli teklif) | API `common/company/report-currency.ts` `itemUnitPriceTry` ⇔ web `lib/tenders/bid-item-price.ts` |
| E-posta gönderim kısıcısı | `modules/email/email-send-throttle.ts` |
| Veri betiği ENV_FILE / hedef DB | `packages/db/prisma/scripts/lib/script-env.ts` (`prepareScriptDatabase`) |
| Koltuk kapısı (firma + admin) | `common/company/seat-gate.ts` (`readSeatUsage`, `assertSeatAvailable`, `lockCompanyRow`) — derin denetim MU-04 |
| Admin 2FA zorunlu rolleri | `common/config/admin-2fa.ts` (`ADMIN_2FA_REQUIRED_ROLES`) — MU-01 |
| Onaycı uygunluğu | `modules/company-approvals/company-approvals.service.ts` `canActOnApprovals` — MU-15 |
| Kazandırılmış kalemin kazananı · tasarruf/hacim | `common/company/report-currency.ts` `awardedBidForItem` · `awardedSavingsVolumeTry` — MU-18 |
| AI model çıktısında sayı · AI kapanış tarihi | `modules/ai/ai-text.ts` `parseSeparatedNumber` · `ai/tender-extract/ai-draft-sanitizer.ts` `parseClosingInstant` — MU-07/08 |
| Kayda kapalı ülke ipucu (keşif/davet) | `common/company/external-invite-policy.ts` `registrationBlockedCountry` — MU-09 |
| API erişim günlüğü başlıkları | `common/logging/request-log-serializer.ts` `LOGGED_REQUEST_HEADERS` — MU-12 |
| Talep davet tavanı · firma hizmet çipi uzunluğu | `@rothern/shared` `constants/limits.ts` `MAX_LISTING_INVITATIONS` · `COMPANY_SERVICE_MAX_LENGTH` — MU-26/24 |
| Web hazır set / davet varsayılanı | `components/company/permission-presets.ts` (`gatePreset`, `defaultInvitePermissions`) — MU-13 |
| Şikayet gövdesi (reason/detail bölmesi) · rapor gün aralığı (web) | `lib/company/complaint-payload.ts` · `lib/time-zone.ts` `appDayRangeIso` — MU-11/25 |
| Admin hata toast'ı | admin `lib/api.ts` `toastApiError` — MU-21 |
| API takvim sınırı / gün anahtarı (Europe/Istanbul; sunucu UTC) | `common/time/app-calendar.ts` (`appMonth`, `appQuarterStart`, `appYearStart`, `appDayStart`, `appNextDayStart`, `appDay`, `appDayKey`) — derin denetim 2026-09-30 LU-07/17 |
| Çok tarihli kur çevrimi | `ExchangeRateService.getRatesOnDates` (döngüde `getRateOnDate` yazılmaz) — LU-07 |
| Tarayıcıya açılan yanıt başlıkları · WS origin kapısı | `common/cors-origin.ts` `CORS_EXPOSED_HEADERS` · `realtime.gateway.ts` `isWsOriginAllowed` — LU-14/19 |
| Presigned GET `Content-Disposition` · IndexNow talep kapısı | `storage.service.ts` `contentDisposition()` · `seo-index.service.ts` `isListingIndexable` (⇔ `marketplaceIndexableWhere`) — LU-19 |
| Firma slug rezervleri | `common/company/company-slug.ts` `RESERVED_COMPANY_SLUGS` (public/companies'e statik rota eklenirse buraya da) — LU-01 |
| E-posta "gönderim denendi" süzgeci · suppression aklama | `email.service.ts` `EMAIL_LOG_HANDLED_WHERE` · `EmailSuppressionService.clear` — LU-18/04 |
| Satıcıya sayılan bilgi talebi engel süzgeci | `public-inquiry.service.ts` `inquiryNotFromBlockedWhere` — LU-18 |
| Talep kalemi görsel sahipliği | `company-listings.service.ts` `assertListingItemImagesOwned` — LU-15 |
| İçerik çevirisi model maliyeti | `content-translation.service.ts` `pricingFor(model)` — LU-17 |
| Admin denetim eylem sözlüğü · buton kapısı matrisi · tarih girdisi | admin `lib/audit-actions.ts` · `lib/admin-permissions.ts` ⇔ `admin-action-roles-drift.spec` · `lib/date.ts` (`toDateInput`, `toDateTimeLocal`, `nextDateTimeLocal`) — LU-11/12/13 |
| Web kalem satır tutarı · 2 ondalık · sipariş önbellek tazeleme | `lib/line-amount.ts` (`lineAmount`, `MONEY_FRACTION`) · `hooks/use-company-orders.ts` `invalidateOrderCaches` — LU-22/24 |
| Sunucudan `/public/*` çağrısı · ikincil blok | `lib/public/marketplace-api.ts` `publicHeaders(locale)` · `fetchSimilarListings` / `fetchRelatedProducts` — LU-23 |
| ISR'da "şimdi"ye bağlı metin · ürün arama gizli alanları | `hooks/use-hydrated.ts` · `lib/public/product-filter-params.ts` `productSearchCarry` — LU-30 |
| Evet/Hayır kalem cevabı | `@rothern/shared` `data/yes-no-answer.ts` `YES_NO_ANSWER_VALUES` (web `lib/tenders/yes-no-answer.ts`, API `tApi(cevapEvet/cevapHayir)`) — LU-21 |
| Telefon NANP alan kodu → ülke | `@rothern/shared` `data/phone-codes.ts` `NATIONAL_PREFIX_COUNTRY` — LU-10 |
| İçe aktarma sütun/limit (talep kalemi · teklif) | `@rothern/shared` `item-import.ts` / `bid-import.ts` |
| IBAN (TR + yabancı mod-97) · hesap no'daki yanlış yazılmış IBAN | `@rothern/shared` `ibanChecksumOk` / `isValidIbanTr` · `isMistypedIban` — LU-10 |
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
| Kayıtsız alıcının dili (davetler) | `@rothern/i18n` `recipient-locale.ts` (`recipientLocale`, `localeForCountry`) |
| Para birimi listesi · sembol · sembolün yeri | `@rothern/shared` `constants/currencies.ts` (`CURRENCY_CODES`, `CURRENCY_SYMBOLS`, `affixCurrency`) · API kur tablosu `common/currency/fx-rates.ts` |
| Bildirimde tarih/tutar/talep başlığı (alıcının dilinde) | `common/notifications/notification-params.ts` |
| AI çıktı dili kuralı | `common/i18n/ai-language.ts` |
| Sistemin yazdığı metin (kodlu) · KYC red gerekçesi | `@rothern/shared` `helpers/system-text.ts` · `helpers/verification-reason.ts` |
| Web para/sayı/tarih biçimi | `src/i18n/format.ts` (`intlLocale`, `formatPercent`, `upperForText`) · `components/ui/money.tsx` (`useFormatMoney`) · `lib/format-date.ts` (`useFormatDate`) |
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
**Nitelik zorunluluğu (derin denetim 2026-09-30 LU-09):** segment (L1) düzeyinde yalnız TÜM
ailelere uyan alan zorunlu olabilir; aileye özgü zorunluluk L2 bindirmesiyle verilir ve her
yeni (kategori, anahtar) için `category-attribute-names.i18n.tsv`'ye EN/RU satırı eklenir.
`CATEGORY_ATTRIBUTES`'ta seçenek ya da zorunluluk değişince `seed-marketplace-demo.ts`
PRODUCTS attrs'ı da güncellenir (`assertAttrs` fail-loud, tüm demo seed'i durdurur).

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
kullanır — `/en/urunler/kategori/<kod>-<tr-slug>`. **Kategori `searchText`
EN/RU adları da içerir** (2026-09-24) — tek kaynak `@rothern/shared`
`categorySearchText`; ad değiştiren her betik onu çağırır (`seed-categories`,
`apply-category-{keywords,translations,names-i18n}`). AI toplu çevirisi
(`category-translation.service`) searchText YAZMAZ → ardından `export` +
`apply-category-names-i18n` koşulur. Sözleşme:
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
**GOLD sınıflı controller'a Silver akışının da kullandığı uç eklenirse tier
handler düzeyinde ezilir, açtığı GOLD özelliği SERVİSTE kapılanır** (derin
denetim 2026-09-29 Y-05): `POST company/ai/uploads/url` SILVER ("Belgeden Fiyatla"
dosyaları); belge → talep GOLD kapısı `TenderExtractService.extract` içinde;
asistan belge eki kapıları (satın alma portalı + GOLD) oturum açılmadan ÖNCE.

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

**Tavan sayımı publish kapısıyla AYNI (derin denetim 2026-09-29 MU-13):**
`enforceProductLimit` yayında + PENDING sayar, yayındakiler önce tutulur, tavan dışı
PENDING DRAFT'a düşer (submittedAt null). Admin approve/approveMany efektif kademeyle
publish ile aynı advisory kilit (`hashtext(companyId)`) altında sayar; tavan doluysa
ürün PENDING kalır (tekli 400, toplu atlanır).

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
  firmasında vergi no=TCKN de maskeli; **KVKK — derin denetim 2026-09-29 Y-06:**
  tam değeri yalnız firmanın kendi company:manage üyesi görür, başka firmaya ya
  da yetkisiz üyeye dönen her okuma `common/company/visible-tax-number.ts`
  `visibleTaxNumber`dan geçer, `COMPANY_CARD_SELECT` taxNumber taşımaz — sözleşme
  `connections.spec` "KVKK: şahıs firmasının vergi no'su"). **Firma adı da KYC kilidinde**
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
- **Onaycı uygunluğu TEK kural (derin denetim 2026-09-29 MU-15/MU-23):**
  `company-approvals.service.ts` `canActOnApprovals` = `hasCompanyPermission(approval:act)`
  ile ownerUserId (Kurucu örtük); rol ETİKETİNE bakılmaz (users:manage taşıyan kişi
  approval:act olmadan da YONETICI etiketi alır). Fallback cron'u, `findEligibleApprover`,
  `assertApproversValid`, `listApproverCandidates`, `requestApproval` ilk adım ikamesi ve
  sihirbazın seçicisi (`GET company/approvals/approver-candidates`, approvals:manage,
  yalnız id/ad/rol; `company/users` OKUNMAZ) aynı kural. Detayın rekabet özeti yalnız
  eliminatedAt boş ve KAZANAN teklifin `round`undaki teklifleri sayar (sonuçlanmış
  istekte ilanın currentRound'u güvenilmez); kalem kazanan toplamı teklif + birim başına.
- **Web kapıları API'nin birebir aynası (derin denetim 2026-09-30 LU-20/21/28/31):** teklif
  tarafı eylemler `SATISCI` etiketiyle değil izinle (`userHasPermission(user, "sell:bid:submit")`;
  etiket yalnız ürün izni olan üyede de var). Kazandır/Kalem bazlı kazandır `buy:award`, Ele
  `buy:listing:manage`. Mutasyon yapan her kontrol ucun iznini ayrıca denetler — sayfayı açan
  izin (`insights:view`) eylemin izni (`company:manage`) olmayabilir. Kurucu'nun yetki
  tablosunu yalnız Kurucu düzenler. Silver+ eylemler (bağlantı daveti) her yüzeyde
  `tierAtLeast`, ücretsizde `PRICING_HREF`'e kilitli CTA; onay akışında YENİ akış ve kopya Gold,
  mevcut akışı yönetmek kademesiz. Kurucu olmayan üye onboarding'de "Kurucu tamamlamalı"
  ekranını görür (`user.isOwner === false`).
- Yetki tablosu ekranı: `components/company/permission-table.tsx` (hazır set
  çipleri + 4 grup tik tablosu); yazma `PUT company/users/:id/permissions`.

### Koltuk = (kişi, grup)
Satınalmada bir işlem izni 1, satışta 1; aynı kişide ikisi 2. Görüntüleme/rapor/
onay/yönetim tüketmez. `seatGroupsOf` + `countSeats` (shared); kapı
`assertSeatAvailable` (davet/kabul/atama/reaktivasyon aynı kapı, bekleyen
davetler grup bazında rezerve). Düşüşte `POST company/users/seat-selection`.

**Kapı tek dosyada (derin denetim 2026-09-29 MU-04):** `common/company/seat-gate.ts`
(`readSeatUsage`/`assertSeatAvailable`/`lockCompanyRow`); `CompanyUsersService` yalnız
delege eder. Koltuk tüketen her yazım — admin "Aktifleştir"/"Kullanıcı Ekle" dahil (admin
bekleyen davetleri de sayar) — firma satırını FOR UPDATE kilitli tx içinde bu kapıdan
geçirir. **Kuruculuk devri (MU-13):** eski Kurucunun yeni rolü de kapıdan geçer (hedefin
kapısı `resolveOwnership`ten SONRA); devralanın işlem izinleri korunur
(`transferTargetGrant`, roller = SAHİP + işlem rolü). Web hazır set ve davet varsayılanı
tek kaynak `components/company/permission-presets.ts` (`gatePreset`: Gold dışı buy izni
ve koltuk doluyken yeni grup düşer; `defaultInvitePermissions`: Gold → Satın Almacı,
değilse Satışçı, koltuk dolu → Görüntüleyici).

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
**`marketplaceListingWhere` embargoyu üst düzey `OR`da taşır** → çağıran kendi
`OR`/`AND` süzgecini kapının yanına spread ile YAZMAZ (anahtarı ezer, embargo
sessizce düşer — derin denetim 2026-09-29 Y-10, `?country=`); `AND: [kapı,
...süzgeçler]`. Sözleşme `public-marketplace.spec` "embargo süzgeçlerle EZİLMEZ".
Aynı kural `publicProductWhere()`/`PUBLIC_PROFILE_WHERE` için: `company` anahtarının yanına
spread ile ikinci `company` yazılmaz, `AND: [...]` (ilişkili ürün ucu firma kapısını eziyordu —
derin denetim 2026-09-30 LU-01). Firma dizininde Rothern ID eşleşmesi yalnız panelde
(`DirectoryScope.matchRothernId`); public dizin ve facet bu dalı kurmaz.

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
- **Liste sayfaları (2026-09-27 denetimi):** `itemListNode(…, locale)` liste ve
  öğe adreslerini o dilin adresiyle yazar (EN/RU'da Türkçe adres veriyordu);
  şehir/ülke/kategori sayfasında sayfalama İNİŞ adresinde kalır (`?sayfa=N`;
  kategori sayfalaması 308'de `sayfa`yı düşürüyordu) — kanonik kuralı aynı gün
  TERSİNE döndü: `?sayfa=N` taşıyan sayfa KENDİ kanoniği (Google önerisi),
  bkz. "ULUSLARARASI TUR 2";
  şehir/ülke sayfasının `noindex`i ve sayacı ürün listesinin `total`ından (facet
  5.000 tarama tavanlıdır); BreadcrumbList Anasayfa › Ürünler › Ülke (› Şehir).
  **OG görseli:** `buildMetadata` kendi görselini koyduğu için segment
  `opengraph-image`leri hiç kullanılmıyordu → `ogCardPath()` (dil öneki + İÇ
  yol; çevrilmiş yol + `/opengraph-image` 404 verir). IndexNow şehir/ülke
  adreslerini de bildirir.
- **Davet e-postaları (2026-09-27 denetimi):** ekip daveti ve referans daveti
  gönderimi BEKLER ve gerçek durumu döner (SENT/FAILED/SUPPRESSED/…; ekran
  "gönderildi" demeden önce); dış TALEP daveti aynı gün KUYRUĞA geçti (QUEUED,
  bkz. "E-POSTA TESLİM EDİLEBİLİRLİĞİ") · hızlı talepte yayından ÖNCE
  AI ile bulunan adresler forma eklenir, talebe özel davet YAYINDA gider (eskiden
  talepsiz genel "katıl" e-postası gidiyordu) · referans daveti: çıkış bağlantısı,
  günde 50/firma, aynı adrese 7 günde bir, son gönderimden 30 gün geçerli, `ref`
  jetonu farklı e-postayla kayıtta da eşlenir · oturumsuz panel CTA'sı
  `?next=` ile döner · AI web araması talebin hedef ülkelerine göre (yalnız
  "Türkiye'de" değil). DTO'ya alan eklendi (`listingId`, `targetCountries`) →
  API web'den ÖNCE dağıtılmalı.
- **Canlı denetim:** `pnpm --filter @rothern/web seo:audit` (`SITE=…`) —
  robots/sitemap/llms + her parçadan örnek sayfa: başlık, açıklama, kanonik,
  OG 200, JSON-LD zorunlu alanlar, h1, noindex; sorun → exit 1.
- Search Console/Bing doğrulama: `NEXT_PUBLIC_{GOOGLE,BING}_SITE_VERIFICATION`.
- Tuzaklar: `fetch(new URL(…, import.meta.url))` Node'da çalışmaz (edge'e
  özgü) → font `readFile` + `outputFileTracingIncludes`; route-handler-only
  segmentler (`/api`, `/sitemaps`) public-routes render değişmezinden muaf;
  web sitemap fetch'leri `SEO_TAGS.sitemap` etiketi taşımalı.
- **Derin denetim 2026-09-30 (LU-25/30):** sitemap'teki statik dizin girdileri (`/urunler`,
  `/alim-talepleri`, `/firmalar`) sayfanın noindex kararındaki `dizinBos` ile süzülür.
  `ListingCard variant="row"` çağıranları her fact'e dilden bağımsız `icon` verir (etiketten
  tahmin yalnız yedek); ürün arama formunun gizli alanları elle yazılmaz, `productSearchCarry`.

---

## E-POSTA TESLİM EDİLEBİLİRLİĞİ + DAVET KUYRUĞU (2026-09-27, Faz 0)

Kullanıcı kararı: "reklam mailine düşmemeli; kayıtsızlara daha fazla gönderelim
ama aynı kişiye sık değil". Plan: Faz 0 altyapı → Faz 1 AI tedarikçi keşfi
(kalemler paneli, yayın sonrası otomatik arama + tek tık davet, uluslararası) →
Faz 2 günlük e-posta programı → Faz 3 organik büyüme → Faz 4 ölçüm.

- **AKIŞLAR** (tek kaynak `modules/email/email-streams.ts`): bağlam tipinden
  türer — kullanıcının kapatabildiği tür NOTIFICATION, kayıtsız adrese davet
  (`referral_invite`, `tender_external_invite`) INVITE, `lifecycle_*` LIFECYCLE,
  kalan her şey TRANSACTIONAL. Akış başına gönderen İSTEĞE BAĞLI env
  `EMAIL_FROM_ADDRESS_{NOTIFICATION,INVITE,LIFECYCLE}` (boşsa
  `EMAIL_FROM_ADDRESS`; açılış kapısı alt alan adına izin verir). Öneri:
  `talep@updates.rothern.com`, `davet@invite.rothern.com` — DNS (SPF/DKIM)
  Resend'de alan adı eklenince; soğuk davet şikâyeti kodları spam'e sürüklemesin.
- **TEK TIK ÇIKIŞ (RFC 8058):** işlem dışı her e-posta `List-Unsubscribe` +
  `List-Unsubscribe-Post` başlığı ve alt bilgide çıkış/tercih bağlantısı taşır
  (düz metin dahil); kod/şifre/sipariş TAŞIMAZ. Jeton AES-256-GCM (adres +
  kapsam + dil; anahtar `JWT_SECRET`ten türetilmiş, DB satırı yok, süresiz).
  Uçlar: API `GET/POST public/email/unsubscribe` (GET yalnız okur), web
  `/api/email/unsubscribe` (başlıktaki adres; POST'u iletir, GET onay sayfasına
  yönlendirir), sayfa `/e-posta-tercihleri` (EN `/email-preferences`, RU
  `/nastroyki-pisem`; çıkış DÜĞMEYLE — güvenlik tarayıcıları bağlantıyı açar).
  Yazım: kullanıcıda `notificationPrefs[kapsam]=false`, kullanıcı olmayan
  adreste (`billingEmail`) `email_opt_outs`, davet kapsamında
  `referral_opt_outs`; Ayarlar'da yeniden açmak adres kaydını siler.
  **Kayıtlı kullanıcıda da tür başına `email_opt_outs` satırı yazılır (derin denetim
  2026-09-29 MU-05):** adres aynı zamanda tercihsiz giden bir `billingEmail` olabilir;
  "Tümü" `all` değil anahtar başına satır (bir türü yeniden açmak diğerlerini açmaz).
  Davet opt-out'u da aynı kuralda (MU-17): `GET public/referral-optout` salt okur, yazma
  yalnız düğmeden `POST { token }`; `/davet-kapat` açılışta yazmaz. **`EmailLog.locale`**
  (migration `20260929150000_email_log_locale`, NULL = eski/TR): admin "Yeniden gönder"
  locale + `{contextType, contextId}`i geri geçirir, `sent:false` başarı sayılmaz. Yeni
  gönderim yolu locale ve context'i MUTLAKA geçirir (yoksa TRANSACTIONAL sayılır, çıkış
  başlığı düşer).
- **Suppression ve tekillik (derin denetim 2026-09-30 LU-04/14/18):** suppression eşleşmesi
  (türetme + gönderim kapısı) `toEmail` üzerinde BİREBİR ve indeksli; aklama yalnız
  `EmailSuppressionService.clear` (kayıtlardaki tüm harf yazımlarına marker). Gönderim yoluna
  `mode: insensitive` EKLENMEZ (ILIKE indeks kullanmaz). Günde/haftada bir tekillik sorguları
  `status: { not: "FAILED" }` değil `...EMAIL_LOG_HANDLED_WHERE` ile — politika gereği atlanan
  gönderim de FAILED yazılır (`EMAIL_SKIPPED_SUPPRESSED_PREFIX`/`_OPTED_OUT_PREFIX`), yoksa
  zamanlayıcı her turda yeni satır yazar. `EmailService` `context.id`'ye e-posta adresi yazılmaz
  (Sentry `extra.contextId`'e düşer); günlükte adres her zaman `maskEmail`.
- **DAVET KUYRUĞU** (`external_listing_invites`, talep × adres): eskiden davet
  `CompanyReferralInvite`in kendisiydi ve (davet eden × adres) BENZERSİZ olduğu
  için alıcı aynı tedarikçiyi yalnız İLK talebine davet edebiliyordu. Artık
  referral satırı yalnız bağlantı jetonu. `inviteExternalForListing` yalnız
  kuyruğa alır (QUEUED + `sendAfter`; `source` MANUAL | AI_FORM | AI_AUTO);
  dakikalık `ExternalInviteDispatcher` gönderir. Kurallar tek kaynak
  `common/company/external-invite-policy.ts`: firma günde 60 talep daveti ·
  platform günlük tavanı ölçüme bağlı (ilk hafta `COLD_INVITE_BASE_DAILY`=150,
  sorunsuz her hafta ×2, `COLD_INVITE_MAX_DAILY`=5000; 7 günde şikâyet >%0,1 ya
  da kalıcı geri dönme >%2 → dünün yarısı) · AI kaynaklı davet alıcının
  ülkesinde hafta içi 09-16 (`common/time/country-time-zone.ts`; ülke yoksa
  e-posta uzantısı, o da yoksa İstanbul) · adres başına 7 günde bir e-posta
  (tüm alıcılar toplamı), bekleyenler TEK özet e-postada (`tender_invite_digest`,
  ≤5 talep, her kart kendi jetonu) · davet bağlantısını açan adres
  (`lastClickedAt`, kayıt sayfası `POST public/referral-visit`) ve elle yazılan
  adres (MANUAL) freni beklemez · ilgi göstermeyen adrese 90 günde 3 e-postadan
  sonra durur · talep yayında değilse bekler, kapanınca düşer · kapanışa 6-48
  saat kala TEK hatırlatma · B2B'de önceden onay isteyen ülkelere (Almanya,
  Kanada — `COLD_INVITE_CONSENT_COUNTRIES`, hukuk görüşü gelene dek) AI'ın
  bulduğu adrese davet GİTMEZ (`CONSENT_REQUIRED`), elle yazılan gider. Kayıt olunca adrese gelmiş TÜM açık talep davetleri
  (başka alıcılarınki dahil) `ListingInvitation` olur (`attachExternalListingInvites`).
  Web QUEUED'u başarı sayar (`isInviteAccepted`).
  Dış talep daveti BUYING_TIER (GOLD) ister; admin GOLD→SILVER'da kuyruktaki satırlar
  `cancelQueuedListingInvites` ile iptal edilir. Talep daveti e-postası `ExternalListingInvite`
  id'siyle loglanır → referral 7 gün freni talep davetini satırın `sentAt`/`reminderSentAt`'inden
  okur (derin denetim 2026-09-30 LU-07).
- **AI TEDARİKÇİ KEŞFİ (Faz 1, 2026-09-27; kullanıcı: "kalemler kısmında AI ile
  tedarikçi bul'u çok daha iyi yap; talep açıldıktan sonra da bulunanlara tek
  tıkla davet; uluslararası ise yurt dışı dahil; adaylar seçili gelsin; davetli
  olana bir daha gitmesin").** Servis `modules/ai/supplier-discovery/`:
  - **Arama geçişleri** (`discoveryPasses`): talep belirli ülkelere açıksa tek
    geçiş (yalnız o ülkeler); tüm ülkelere açıksa İKİ PARALEL geçiş — yurt içi
    (LOCAL) + yurt dışı (ABROAD: model en güçlü 5 üretici/ihracatçı ülkeyi seçer,
    `COLD_INVITE_CONSENT_COUNTRIES` hariç). Kalemler NUMARALI verilir, aday
    `matchedItems` taşır. Kategori ZORUNLU DEĞİL (kalemlerle aranır).
  - **Aday işaretleme** (`annotate`, tek kaynak): e-postasız, MX'i olmayan
    (`common/net/mx-check.ts`, geçici DNS hatasında fail-open), davet almak
    istemeyen DÜŞER; aynı web sitesinden tek adres; durum SUGGESTED ·
    ALREADY_INVITED (bu talebe; eşleşen ÜYE bu talebe davetliyse de) · MEMBER
    (adres ya da SİTE alan adı kayıtlı firmayla eşleşti) · CONSENT_REQUIRED;
    `recentlyInvited` (7 günde başka alıcıdan davet aldı → özetle gider).
    SUGGESTED (e-postalı) ve MEMBER seçilebilir ve SEÇİLİ gelir.
  - **Platform keşfi** (`discoverRegistered`) yayın bildirimiyle AYNI eşleştirici
    (satış ana segment + `sellerSubCategoryIds`; eskiden alt kodu ana alanda
    arıyordu) + vitrinde kalemi SATAN firma (`productSearchClauses`, kalem başına)
    + talebin görünürlük ülkesi + YALNIZ Silver+ ∧ doğrulanmış (`ai-recommendable.ts`,
    2026-09-28). Kullanıcısız çekirdek `discoverRegisteredFor`
    (yayın sonrası tur da çağırır; `country` + `alreadyInvited` döner).
  - **ÜYEYE DOĞRUDAN TALEP DAVETİ (2026-09-28, kullanıcı: "sistemimize
    kayıtlıysa ayrıca gösterelim, kategori veya kalem eşleşmesi var diye;
    davet ederken en üstte seçili olur").** AI'ın önerdiği Rothern üyesi (platform
    keşfi ya da web'de adresi/sitesi üyeyle eşleşen aday) listenin EN ÜSTÜNDE
    "Rothern'de kayıtlı" grubunda, gerekçe çipleriyle ("Kalem eşleşmesi: …",
    "Kategori eşleşmesi: …", "Web'de de bulundu") ve SEÇİLİ gelir; e-posta
    davetine DEĞİL doğrudan talebe davet edilir — **BAĞLANTI ŞARTI YOK** (eski
    "yalnız bağlantılıya doğrudan davet" kuralının tek istisnası; `addInvitations`
    elle davet yolu bağlantı şartını korur). Tek kaynak `CompanyListingsService.
    inviteDiscoveredMembers`: sahip + `buy:listing:manage`, DRAFT/OPEN; engelli
    (iki yön)/pasif/askıdaki ve talebin ülkesine uymayan (`countryCanSee`)
    NOT_ELIGIBLE; zaten davetli ALREADY_INVITED; **günlük tavan e-posta
    davetleriyle ORTAK** (`COMPANY_DAILY_INVITE_CAP` 60 − bugünkü dış davet −
    bugünkü AI üye daveti) → DAILY_LIMIT. `ListingInvitation.origin = "AI"` +
    `aiReason` (vitrinde kalemi satan ürünün adı, yoksa `{category:true}`).
    Bildirim (OPEN ∧ embargosuz; embargoluda açılış duyurusu davetlilere gider):
    e-posta `listing_invitation_ai` (tercih `invitation`; konu firma adı
    `inviteShowName`e bağlı; gövde gerekçeli; kalem önizlemesi) — alıcının YEREL
    gününde 3'ü geçmez, fazlası akşam özetine (`EmailDigestItem.kind =
    INVITATION`, bağlam `listing_invitation_digest`, kategori özetinden AYRI
    e-posta); bu talep için zaten e-posta almış adrese (kategori duyurusu/davet)
    ikincisi GİTMEZ ve bekleyen CATEGORY_MATCH özet satırı düşer; uygulama içi
    bildirim her zaman.
  - **AI ÖNERİSİNE YALNIZ SILVER+ ∧ DOĞRULANMIŞ ÜYE (2026-09-28, kullanıcı:
    "ücretsizleri Silver'a çekecek şeyler olmalı; gidip ücretsizi bedavaya davet
    edip talebe sokmak saçma, doğrulanmamış firma; firma kendisi davet ederse
    ayrı").** Tek kaynak `common/company/ai-recommendable.ts`
    (`aiRecommendableWhere`/`isAiRecommendable`: efektif SILVER+ ∧ VERIFIED ∧
    aktif ∧ askıda değil). Platform keşfi yalnız bunları önerir (eskiden
    vitrini açık ücretsiz firma da adaydı); web'de adresi/sitesi eşleşen üye
    bağlantılı değilse ve kurala uymuyorsa listeden DÜŞER (e-posta daveti de
    gitmez); `inviteDiscoveredMembers` sunucuda aynı kuralla NOT_ELIGIBLE döner.
    Bağlantılı firma kurala girmez (alıcı tanıyor); alıcının elle daveti
    (bağlantı seçicisi, `addInvitations`) etkilenmez. Karşılığı Silver paket
    kartında madde (`web.pricing.plans.silver.f4` "AI tedarikçi önerilerinde
    çıkma ve doğrudan talebe davet").
  - **GÖSTERİLMEYEN ÜCRETSİZ FİRMAYA SILVER/DOĞRULAMA ÇAĞRISI (2026-09-28,
    kullanıcı: "ücretsiz firma alıcı talep açarken görünmesin; AI ile
    bulunduğunda oradan Silver'a veya doğrulamaya yönlendirelim").** Yayın
    sonrası tur (`DiscoveryRunsService.process`) aynı eşleştiriciyi
    `pool: "hidden"` ile de koşar (Silver+ ∧ doğrulanmış OLMAYAN, aktif,
    bağlantısız) ve GÜÇLÜ eşleşmeleri (alt kategori ya da vitrinde kalem)
    `CompanyListingsService.notifyHiddenAiMatches`e verir: YALNIZ herkese açık
    ∧ açık ∧ embargosuz talepte (özelde Silver alsa da göremezdi); davetli,
    bağlantılı, engelli ve bu talep için e-posta almış/özette bekleyen adres
    atlanır. E-posta `listing_ai_match_locked` (tercih `categoryMatch`,
    kategori eşleşmesiyle AYNI yerel günde-3 sınırı, fazlası KİLİTLİ özet
    satırı): "Bir alıcı sattığınız ürünleri arıyor" + kalem önizlemesi, alıcı
    kimliği ve talep bağlantısı YOK; doğrulanmamışa "Ücretsiz Doğrulan"
    (`/company/ayarlar/dogrulama`), doğrulanmış/incelemedekine "Silver'a Geç".
  - **DOĞRULAMA ÖNCE (aynı gün):** kategori duyurusunun kilitli sürümü, kilitli
    akşam özeti ve panelin `SilverLockCard`ı doğrulanmamış (UNVERIFIED/
    REJECTED) ücretsiz firmada birincil eylemi doğrulamaya çevirir ("Silver'a
    geçmenin tek şartı ücretsiz doğrulama"; paketler ikincil). Keşif turu
    (`DiscoveryRunsService.process`) platform üyelerini de önerir — model çağrısı
    YOK, AI kapalıyken/bütçe dolmuşken de (web yolu düşüp üye bulunduysa tur DONE
    + `error`); aday `status = MEMBER`, `memberCompanyId`, `matchedCategories`,
    `source` PLATFORM/WEB/BOTH (`mergeCandidates`); önceki turda önerilen üye
    yeniden önerilmez. Tek tık davet (`invite`) adayları ayırır: üye →
    `inviteDiscoveredMembers`, diğerleri → e-posta kuyruğu; yanıt `{results,
    memberResults}`. Formda seçilen üyeler `memberInvites` (taslakta
    `QuickDraft.memberInvites`, kayıtlı taslakta `pendingMemberInvitesKey`)
    yayında `POST …/listings/:id/invite-members` ile gider; yayın paneli sonucu
    ad ad gösterir. Keşif penceresinin "Platformda" sekmesi talepten açılınca
    "Talebe davet et" / "Hepsini talebe davet et" (talepsiz açılışta bağlantı
    daveti). Migration `20260928090000_ai_member_invites` (eklemeli). Sözleşmeler:
    `ai-member-invite.spec`, `email-programs.spec` "davet özeti", web
    `quick-request.test` "ROTHERN ÜYELERİ", `listing-suggestions.test`,
    `supplier-discovery-modal.test` "Platformda".
  - **Formda** (`components/tenders/ai-suppliers/form-supplier-panel.tsx`):
    kalemlerin ALTINDA, pencere açmadan; kalemler girilip 5 sn değişmeyince
    oturumda bir kez KENDİLİĞİNDEN arar (kullanıcı bütçesi, `callAi`); sonuç
    formun dış davet listesine seçili yazılır, davet YAYINDA (`AI_FORM`) gider;
    kapsanmayan kalem için "daha fazla bul". 3. bölümde iki anahtar: yayında
    otomatik arama (`Listing.aiDiscovery`, özel talepte kapalı) ve davette firma
    adı (`Listing.inviteShowName`; kapalıysa "Bir alıcı firma", gönderen "Rothern").
  - **Yayın sonrası** (`DiscoveryRunsService`, dakikalık `discovery.runs`):
    `announceListingOpen` tur satırı yazar (AI modülüne bağımlılık yok); tur
    PLATFORM bütçesiyle (`AiService.callAiSystem`, firma bütçesine yazılmaz; günlük
    tavan `AI_DISCOVERY_DAILY_USD`=15) koşar, adaylar `supplier_discovery_candidates`e.
    Yayın paneli ve talep sayfası bandı (`listing-suggestions.tsx`) hepsi seçili
    liste + tek tık davet (`AI_AUTO`, kuyruk); "Gizle" kapatır. Alıcı 10 dk içinde
    işlem yapmadıysa talebi AÇANA bildirim + e-posta (`ai_supplier_suggestions`,
    tercih `aiSuggestions`; bağlantı `?ai-davet=1` listeyi açık getirir, gönderim
    uygulama içinde). Süre yarılandı + teklif < 3 → İKİNCİ TUR (önceki adaylar
    hariç; talep başına en fazla 2 otomatik tur). Eylem merkezi satırı `aiSuggestions`.
    PUBLISH turu `announceListingOpen` claim'ine bağlı KALMAZ (derin denetim 2026-09-29
    MU-09): düzenlemede sonradan açılan keşif (`enqueueDiscoveryAfterEdit`) ve
    `DiscoveryRunsService.tick` `catchUpPublishRuns` (duyurulmuş ≥2 dk, embargosuz,
    aiDiscovery açık, PUBLISH/SECOND_ROUND turu olmayan OPEN talep) turu yazar. Web boş
    tur yoklaması `EMPTY_RUN_POLL_MAX` ile sınırlı, embargoda (`startsAt`) yoklamaz.
  - Uçlar: `POST company/ai/supplier-discovery` (+`/external`; DTO kategori
    isteğe bağlı, `itemNames`/`listingId`/`targetCountries`), `GET/POST company/
    ai/supplier-discovery/listings/:id{,/invite,/invite-members,/dismiss}` (GOLD +
    buy:listing:manage).
  - Migration `20260927230000_supplier_discovery_runs` (eklemeli). Sözleşmeler:
    `supplier-discovery-external.spec`, `supplier-discovery.spec`, `discovery-
    runs.spec`, web `quick-request.test` "KALEMLER PANELİ", `listing-suggestions.test`.
- **GÜNLÜK E-POSTA PROGRAMI (Faz 2, 2026-09-27; kullanıcı: "haftada 1 az, her
  gün gönderelim; kategorisi uyuşan kayıtlıya sık").** Kurallar tek kaynak
  `common/email/email-program-policy.ts`, uygulama `modules/email-programs/`
  (15 dk'lık `emailPrograms.tick`; her alt iş yerel saat penceresini ve
  tekilliğini EmailLog'dan okur):
  - **Kategori eşleşmesi:** alıcı başına YEREL gün içinde 3 e-posta anında,
    fazlası `email_digest_items`a → yerel 18:00'de TEK özet
    (`listing_category_digest`, tercih `categoryMatch`; ücretsiz alıcıda Silver
    teşviki, talep bağlantısı yok). Tercih bayrağı `categoryMatchInstant`
    (`NOTIFICATION_FLAG_KEYS`, varsayılan kapalı) sınırı kaldırır. Alıcının
    elle yaptığı doğrudan davet ve uygulama içi bildirim bu kurala GİRMEZ; AI'ın
    önerdiği üyeye doğrudan davet (2026-09-28) AYNI sınıra girer (kendi sayacı,
    fazlası `INVITATION` özeti).
  - **Karşılama serisi** (LIFECYCLE akışı, `lifecycle_<adım>`, tercih
    `lifecycle` — `prefKeyForType` `lifecycle_*` önekini eşler): profil (gün 1)
    → ilk ürün (3) → doğrulama (7) → pazar (14, kategorisinde talep varsa)
    → ikinci doğrulama hatırlatması (21, hâlâ doğrulanmamışa; "AI önerilerine
    yalnız doğrulanmış Silver/Gold girer, teklifte 'Doğrulanmamış firma'")
    → Silver (24, YALNIZ doğrulanmış ücretsize — paket alımı doğrulama ister;
    ücretliye gitmez; 2026-09-28);
    DAVRANIŞA BAĞLI (tamamlanan adım atlanır), firma başına günde bir, sahibe,
    yerel 10:00; 180 gündür giriş yoksa gitmez. Hizmet kullanımı iletisi
    (pazarlama izni aranmaz; çıkış her e-postada).
  - **Haftalık görünürlük özeti** (`lifecycle_weekly`): pazartesi yerel 10:00,
    son 7 günde görüntülenme varsa; son giriş 30+ gün → iki haftada bir,
    90+ → dört haftada bir, 180+ → hiç. Üç sürüm (2026-09-28): ücretli →
    Ziyaret Edenler; ücretsiz + doğrulanmamış (UNVERIFIED/REJECTED) → önce
    ücretsiz doğrulama; ücretsiz + doğrulanmış/incelemede → "N görüntülemenin
    M'i Rothern üyesi firmalardan, hangileri olduğunu Silver'da görün" (M =
    kimlikli panel görüntülemesi) + Paketler.
  - **Teklif anında doğrulama teşviki** (`components/company/verify-nudge.tsx`,
    2026-09-28): doğrulanmamış/reddedilmiş firma teklif formunda ve talep
    detayının teklif bölümünde "Teklifiniz alıcıya 'Doğrulanmamış firma' olarak
    görünür" + "Ücretsiz doğrulan"; doğrulanmış/incelemedekine çizilmez.
  - **Teklifsiz talep** (`listing_zero_bid`, tercih `reminder`): kapanışa 12-72
    saat, hiç teklif yok → talebi AÇANA e-posta + uygulama içi, her biri BİR kez
    (bağlantı `?ai-davet=1` otomatik arama açıksa).
  - Kayıtlı kullanıcının tek tık çıkışı `lifecycle` dahil tercih JSON'una yazılır.
  - **Akşam özeti adres × tür başına alıcının yerel gününde TEK (derin denetim
    2026-09-29 MU-14):** `digestDue` son özetin EmailLog zamanını (`lastDigestAt`) alır;
    18:00 sonrası kalem ertesi 18:00'i bekler, sabah gönderimi yalnız o günün özeti
    kaçtıysa. Günde tek kuralı yalnız yerel 18:00 ve sonrasında giden özeti sayar; sabah
    telafisi ya da 24 saat tavanıyla giden özet o akşamın özetini engellemez (LU-33). Özet/kuyruk gönderimi tercihi GÖNDERİM anında da okur (kullanıcı yok/pasif/
    silinmiş ya da tercih kapalı → kalemler düşer). Dış davet dağıtıcısı satırı göndermeden
    sahiplenir (tek ifade `UPDATE … WHERE id = ANY($ids) AND state='QUEUED' AND sendAfter<=now
    RETURNING id` + 10 dk kira; adres grubu yalnız dönen satırlardan — LU-33); hatırlatma yalnız
    `referralInvite.status=PENDING`; kayıtta iptal edilmiş referral ve REFERRAL_CANCELLED/
    INVITER_DOWNGRADED satırı bağlanmaz (MU-16).
  - Migration `20260927235000_email_digest_items` (eklemeli). Sözleşmeler:
    `email-program-policy.spec`, `email-programs.spec`, `category-match.spec`
    "GÜNDE 3 ANINDA".
- **ORGANİK BÜYÜME (Faz 3, 2026-09-27):**
  - **Davetle gelene hazır form:** `POST public/referral-visit` (kayıt ve
    önizleme sayfası çağırır) ilgi damgası + adresin KENDİ firma bilgisini döner
    (AI keşfinin bulduğu ad/site/ülke/şehir; geçersiz jetonda boş). Web
    `lib/company-auth/invite-prefill.ts` oturum deposu: kayıt e-postayı,
    onboarding firma adı/site/ülke/şehri önceden doldurur (kapalı ülke alınmaz).
  - **Kayıtsız talep önizlemesi:** `GET public/invite-preview?ref=&l=` (jetonlu;
    davet e-postasının beyaz listesi + TÜM kalemler, en fazla 100; kapalı talepte
    `closed`, kayıtlı adreste `accepted`). Sayfa `/talep-davet` (EN
    `/request-invitation`, RU `/priglashenie-k-zaprosu`; noindex, force-dynamic).
    Tekli davette ikincil bağlantı (`previewUrl`), özet e-postada kart düğmesi.
  - **Paylaş:** talep detayının sahip dalı `publicPath` (YALNIZ vitrindeyse,
    `marketplaceListingWhere`) → `ShareListing` (LinkedIn/WhatsApp/e-posta/kopyala)
    yayın panelinde ve talep sayfasında.
  - Sözleşmeler: `external-tender-invite.spec` "Faz 3", web `talep-davet/__tests__`,
    `onboarding-client.test` "DAVETLE GELEN FİRMA".
- **ÖLÇÜM (Faz 4):** yönetici `/admin/buyume` (SUPER_ADMIN + SALES) ←
  `GET admin/growth/invites?days=` (`modules/admin-growth`): huni (talep daveti →
  e-postası giden → teslim → tıklayan → kayıt olan → teklif veren), iptal
  nedenleri, kaynak/ülke/dil, soğuk davet sağlığı (bugünkü tavan + fren, 7 gün
  şikâyet/geri dönme oranı — `ExternalInviteDispatcher.capStatus`), AI keşif
  turları + platform maliyeti, günlük program e-postaları, abonelikten çıkanlar.
  Yalnız sayılar (kişisel veri yok). Sözleşme `admin-growth.spec`.
- **GÖNDERİM KISICISI (derin denetim 2026-09-29 Y-08):** her `EmailService.send`
  süreç içi `email-send-throttle.ts`ten geçer — `EMAIL_SEND_CONCURRENCY` (4 hat),
  öncelik high (TRANSACTIONAL + kod/şifre/2FA) > normal > bulk, jeton kovası
  `EMAIL_SEND_RATE_PER_SEC` (2 = Resend varsayılanı; çok örnekte limit/örnek).
  429/5xx/`application_error`/409 `concurrent_idempotent_requests` toplam 3 kez
  denenir, her denemede aynı `Idempotency-Key` (`email-log/<id>`); zaman aşımı ve
  diğer 4xx DENENMEZ. Kuyruk bellekte (yeniden başlatmada hat almamış gönderim
  kaybolur). Toplu iş `priority: "bulk"` geçer, HTTP isteğinde yüzlerce e-posta
  await EDİLMEZ (duyuru `emailQueued` + `admin.announcement.email_completed`
  audit'i). Sözleşme `email-send-throttle.spec`.
- **BOUNCE TİPİ (Y-09):** Resend `email.bounced` SES terimleri taşır (Permanent/
  Transient/Undetermined) → `normalizeBounceType` hard/soft/undetermined'e
  indirir; `bounceType` kolonunda YALNIZ bu üçü, ham tip `EmailEvent.payload`da.
  Bastırma, soğuk davet freni, growth ve kritik alarm `'hard'` sorgular. Test
  yükleri gerçek Resend şeklinde yazılır.
- Migration'lar `20260927210000_email_opt_outs`, `20260927220000_external_
  listing_invites` (eklemeli; eski talep bağlamlı referral davetleri SENT talep
  daveti olarak taşınır). Sözleşmeler: `email-streams.spec`, `email-unsubscribe.
  spec`, `external-invite-policy.spec`, `external-tender-invite.spec`,
  `external-invite-content.spec`, `referral-signup.spec` "TALEP DAVETLERİ",
  `tender-external-invite-email.spec` (özet/hatırlatma), `email-display-name.spec`.
- **Sizde (operatör):** Resend'de alt alan adları + DNS; Google Postmaster,
  Microsoft SNDS, Yandex Postoffice, Mail.ru Postmaster; DMARC `rua` adresi
  izlenip `p=quarantine`e geçiş; Resend kullanım politikası (web'den bulunan
  adrese soğuk gönderim) kontrolü; Almanya/Kanada için hukuk görüşü.

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
  **Şema `buildPaymentPlan`ın aynası (derin denetim 2026-09-29 MU-10):** yayında 400
  alacak her ödeme şartı profilde de reddedilir (ADVANCE→advancePercent, LC USANCE→
  paymentDays, CUSTOM kaydedilemez — profilde/hızlı kartta not alanı yok).
- **Hızlı kart kuralları (MU-26/MU-07):** davet listesi tavanı tek kaynak
  `@rothern/shared` `MAX_LISTING_INVITATIONS` (5000; API DTO + web şema). Davet hedefi
  süzgeci tek kaynak `company-listings/listing-invitees.ts` `connectedInvitees`
  (create/updateListing/addInvitations; bağlantılar `Set` olarak verilir, `includes`
  YASAK — RM-26; sözleşme `test/unit/listing-invitees-filter.spec.ts`). "Bağlantılarım"
  listesi TEK gövdede gider — kayıttan sonra ayrı davet çağrısıyla parça göndermek YASAK
  (gövdede olmayan davet düzenlemede silinir, eklenen her kayıtta "yeni" sayılıp yeniden
  e-posta/push alır). AI panel seçim anahtarı her yerde `selectionKey` (üye
  `m:<companyId>`). UnitSelect "Listede yok" bileşen durumudur; bilinen birim yalnız onBlur
  ve tam eşleşmede kodlanır. Varsayılan teslimat adresi şart efektinden AYRI efektte seçilir,
  FATURA seçilmez; asistan da aynı sırayı izler (profil adresi → varsayılan TESLİMAT →
  TESLİMAT → İLETİŞİM, kartta görünür). "Yeni talep aç" `initialRequestFormValues("blank",
  profil)`. Katalog seçici seçimi aramalar arasında `Record<id,{item,qty}>`te tutar.
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
- **HERKESE AÇIK TALEP = BAĞLANTILAR OTOMATİK DAVETLİ (2026-09-27, kullanıcı
  kararı: "herkese açık paylaşılsa bile mutlaka bağlantılarına davet gitsin;
  kategori uyumu olanlara da gitsin; ücretsizse Silver'a teşvik edelim").**
  Yayın duyurusunda (`announceListingOpen` "invitation", embargoluda cron
  açılışında) `autoInviteConnections` alıcının GEÇERLİ bağlantılarının tamamını
  kategoriden bağımsız davetli yapar (`invitedById` = talebi açan; engelli/
  askıdaki/pasif ve görünürlük ülkesi DIŞINDAKİ bağlantı hariç — elle davet
  ülkeyi aşar, otomatik davet aşmaz; yalnız PUBLIC + ilk açılış). Kategori
  duyurusu davetlileri DIŞLAR (tek e-posta). Kategorisi uyan bağlantısız firma:
  ücretli → e-posta doğrudan talebe (`/company/ilan/<id>`); ücretsiz → Silver
  teşviki, CTA panelin Paketler sayfası (`/company/premium`), talep bağlantısı
  YOK; kategori uyanlar DAVETLİ YAPILMAZ (ücretsiz firma Silver'sız teklif
  verirdi). Davet ve duyuru e-postaları alıcının dilinde talep önizlemesi taşır
  (`common/company/listing-email-preview.ts`: ilk 6 kalem + miktar, kapanış,
  teslim yeri; alıcı kimliği yok; gönderimden önce çeviri ≤60 sn beklenir).
  Sözleşme: `public-listing-auto-invite.spec`, `category-match.spec`.
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
- **HIZLI KART AÇILIŞI TOHUMA GÖRE (derin denetim 2026-09-29 Y-19/Y-20):** tek
  kaynak `lib/tenders/request-defaults.ts` `initialRequestFormValues(kind)` —
  `edit`: talebin değerleri AYNEN (profil uygulanmaz); `seed` (kopya/şablon/
  `seedTerms`): tohumun şartları korunur, yalnız eksik alan + boş kapanış/adres
  profilden, ödeme alanları GRUP; `blank` (boş kart/AI/ürün): profil. DRAFT dışı
  (teklifsiz OPEN) düzenlemede "Değişiklikleri kaydet" = PATCH + bekleyen davetler
  hemen, `publish` ÇAĞRILMAZ; DRAFT kaydı `asDraft: true`; düzenlemede
  `QUICK_DRAFT_KEY` yazılmaz. Sözleşme `request-defaults.test`, `quick-request.test`.
- **`?q=` tohumu yarım taslağı silmez (derin denetim 2026-09-30 LU-30):** oturumda
  `QUICK_DRAFT_KEY` varsa terim `appendTermToQuickDraft` ile taslağa kalem olarak eklenir ve
  kart taslağı geri getirir; `mapSearchTermToForm` başlığı tohumlamaz (kalemlerden türer).
- **Hızlı talep kilitleri (derin denetim 2026-09-30 LU-32):** yayın/taslak akışı mutation'lar
  arasında da sürer (belge yükleme düz async) → düğme kilidi `submitting` state'i + ortak
  `submitLock`, yalnız `isPending`'e bakılmaz. "Tümünü düzenle" şartlar paneli yalnız talebe
  uygulanan bölümleri çizer (görünürlük, kapanış, adres talebin kendi bölümünde). "Seçili
  ülkeler" kipinde son ülke çıkarılamaz (boş liste = tüm ülkeler). Kalem soru tavanı
  `MAX_ITEM_QUESTIONS`=20 (`@ArrayMaxSize(20)`). Kalem görselinden talep kapağı türetmek alıcı
  anonimliği kararını bekliyor (görsel URL'i tenant önekini taşır).
- **Talep yaşam döngüsü (derin denetim 2026-09-29 MU-20):** `updateListing` davetleri
  FARK olarak uygular — formda kalan satır yeniden yazılmaz (origin/aiReason korunur),
  formda olmayan (AI dahil) silinir, bağlantı şartı yalnız yeni davetliye; duyurusu
  yapılmış OPEN talepte yenilere `notifyAddedInvitees`. `create(asDraft:false)` de
  `company.listing.published` yazar. Talep yönetimi yalnız açana açık (SAHİP istisnası
  yok; `docs/invariants.md` INV-AZ-1'deki "VEYA user.isOwner" bayat); açan çıkarılınca/
  pasifleşince `handOverLiveListings` yaşayan talepleri işlemi yapana (buy:listing:manage)
  ya da Kurucu'ya devreder. Askıdaki/pasif firma: `sellerVisibleWhere` süzer, `getOne`
  (teklifsiz)/`placeBid` 404, kazandırma 400; satıcıda davet sayan her yüzey (pano sayacı,
  Aksiyon Merkezi) aynı süzgeci uygular.
- **Talep/teklif yarış ve kapıları (derin denetim 2026-09-30 LU-14/15/16):** kalem görseli yalnız
  firmanın kendi public deposundan ya da kendi katalog görselinden (`assertListingItemImagesOwned`;
  kalem yazan her yol). `placeBid` teklif satırını ilan kilidi altında `FOR UPDATE` ile yeniden
  okur (tx dışı `existingBid`'e dayanan yeni kural karşılaştırılan alanlara eklenir); kazandırma
  guard'ları teklif `version`'ına koşullu → teklif içeriğini değiştiren her yazım `version`'ı
  artırır. Claim'ler (`closeExpired`, `announceListingOpen`, üyelik düşürme) `findMany`
  koşulunu claim'in `where`'inde tekrarlar. DRAFT teklif canlandırma placeBid zaman kapılarına
  tabi (web `canExtend` aynası). Pazarlık kıyası kayıtlı tutarla aynı yuvarlamada (API
  `roundMoney` ⇔ web `distribute.roundMoney`). Sahip ETag'i istek dilini içerir; talep
  `decimalPlaces` tavanı `MONEY_DECIMALS`.
- **Katılımcı bildirimi ve sipariş geçişi (LU-16):** `notifyListingParticipants`/
  `notifyListingClosed` embargoda yalnız teklif sahiplerine; talebe davet ekleyen her yol
  `assertInviteWindowOpen`'dan geçer (İngiliz usulü, 2 dk). Sipariş geçişine bağlı çapraz-firma
  yan yazma `transition(..., { inTx })` ile aynı transaction'da (ret + kazandırma geri alma).
  Damga telafisi gereken cron bildirimi `notifyOrderPartyUnsafe`; damgayla süzülen batch
  taraması cursor+skip değil keyset (`id > son id`).

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

**TEKLİF-VER EKRANI (`ilan/[id]/teklif-ver`, derin denetim 2026-09-29 Y-15):**
durum ekranı mutasyon bayrağına değil gönderim evresine (`submitPhase`) bağlı —
taslaktan sonra yükleme düşerse form bekleyen dosyalarla geri gelir. Dosyalı
gönderimde taslak adımı teklif yokken VE LOST iken çalışır (sunucu belgeyi yalnız
DRAFT teklife ekler/siler); pazarlığın yeni turunda (SUBMITTED) dosya alanı kapalı.
Web `BID_DOC_MIME_TYPES` ⇔ API `company-bid-documents.service.ts` `ALLOWED_MIME` birebir.

**SAHİP EKRANI (derin denetim 2026-09-29 MU-22):** Yayınla / Onayı İptal Et başlık
kartında da çizilir (şerit, başlık görünürken invisible). Taslakta bekleyen davetler talep
yayına nereden alınırsa alınsın `usePendingListingInvites().flush()` ile gider. Kazandır
olan HER yüzey `isBidExpired` + önce `award/preview` (fail-closed) → onaya takılırsa not
diyaloğu, değilse "GERİ ALINAMAZ" onayı. Bildirimler sayfası `useNotificationFeed`
(`before` imleci); istemci süzgeçli imleçli listede `items.length === 0 && hasNextPage`
boş ekran bırakmaz, açıklama gösterir. Talep belgeleri listesi `getOne` ile aynı Faz O
taraf kapısı (sahip üye buy:view, sahip olmayan sell:view — MU-19).

**MUADİL SİMETRİSİ (Y-16):** tedarikçinin muadil beyanı alıcıya tek kaynaktan
çizilir — `components/tenders/alternative-offer-note.tsx` (teklif detayı, ilan
kalem karşılaştırması `compact`, listede `muadilKalemSayisi` rozeti). Teklif-ver
kart görünümü ve pazarlık masası ek alanları AYNI `renderItemExtras` ile çizer.
Forma kalem ekleyen HER yol `alternativeAllowed: true` yazar (yoksa RHF kapalı
`<details>` içindeki işaretsiz kutudan false okur).

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
  nitelik) değişince yeniden PENDING'e düşer ama **vitrinde kalır** — katalog
  kalemi ucu `PATCH company/items/:id` da AYNI kurala uyar ve orada şartname/marka/
  MPN de içerik sayılır (herkese açık sayfada görünür; `catalogContentChanged`,
  kod/birim/hedef fiyat değil — derin denetim 2026-09-29 Y-07); red
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
- **Vitrin sayaçları ve arama (derin denetim 2026-09-30 LU-08/31):** Ürünlerim sayaçları liste
  süzgeciyle AYNI where'den (`SHOWCASE_STATUS_WHERE`); `enforceProductLimit`'in kırptığı ürün
  APPROVED + isPublic=false = "taslak". `CompanyItem.searchText` her yazma yolunda (create,
  update, import, updateShowcase) `foldSearchText(ad+marka+mpn+etiketler)`. FIXED/TIERED fiyat 0
  olamaz (`MIN_MONEY`), fiyat vermeyen ON_REQUEST seçer. Ürün etiketi istemcide de ≤50 karakter.
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

**Sayfalı ve kurallar (derin denetim 2026-09-29 MU-25/MU-10):** `GET company/inquiries/
{received,sent}?page=` → `{items,total,openCount,page,pageSize}` (20'şer); web
`usePagedInquiries`, sayaçlar sunucu toplamından (`sent` ?page= olmadan eski istemciye en
yeni 50 düz dizi). Kayıtlı alıcının bilgi talebi iki yönlü `CompanyBlock`a uyar (404).
Satıcı e-postası sell:view izinli üyelere (Kurucu örtük), en eski önce, en fazla 5. Anonim
`fetch` ile atılan herkese açık istek `Accept-Language: useLocale()` koyar (misafir dili).
Satıcı tarafında talep sayan her sorgu (gelen kutusu, Aksiyon Merkezi) engel süzgecini
`inquiryNotFromBlockedWhere`'den alır: engelde iki yönde gizli, yanıt 404, misafir satırları
muaf (derin denetim 2026-09-30 LU-18).

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
**Engel = karşılıklı görünmezlik (derin denetim 2026-09-30 LU-08/17):** panel profil ve ürün
sayfası 404; panel ürün araması, facet sayaçları ve keşif şeridi `hiddenCompanyIds` ile engelli
firmaları süzer (ff86fd64), `recordPanelView` engelde yazmaz; engel ilişkisindeki firmanın ziyaretleri
(engelden öncekiler dahil) `visitors()` ve `insights()`'ta kimliksiz sayılır — toplam
değişmez, kimlikli sayı ve şehir kırılımı süzülür (`blockedIds()`). Gün anahtarı `appDayKey`;
İş Analizi ortanca yanıt süresi dizin cron'uyla aynı `REPLY_WINDOW_DAYS` penceresi.

---

## Migration ve Dağıtım

> ⚠️ **API KONTEYNERİ AÇILIŞTA `migrate deploy` KOŞAR** (`apps/api/docker-entrypoint.sh`).
> Canlı Render servisi `production` dalını izler (`render.yaml` `branch:
> production`, `autoDeploy: true`); main → staging (api-staging, blueprint
> dışı). Yani `production`a birleşen şema değişikliği canlı API açılırken
> KENDİLİĞİNDEN uygulanır → birleştirmeden ÖNCE canlı yedeği al
> (`docs/backup-restore-drill.md`). Elle uygulamak gerekirse:
> `ALLOW_REMOTE_MIGRATION=1 pnpm --filter @rothern/db migrate:deploy`
> (`assert-migration-target.ts` uzak host'u onaysız reddeder).

- **Son migration derin denetim DÜŞÜK turundan (2026-09-30), staging VE canlıda BEKLİYOR
  (O-40):** `20260930120000_notification_cron_indexes_fx_precision` — notifications'a 2 index +
  `listing_bid_items.fxToBase` DECIMAL(24,12) (ölçek genişlemesi tabloyu yeniden yazar,
  snapshot). Damga her yerde 12 ondalıkla üretilir (saklanan = hesaplanan). Ardından
  `seed-category-attributes` yeniden (O-41). Bekleyen toplam 14.
- Öncesi üçü derin denetim ORTA turundan (2026-09-29, O-32): `20260929230000_rfq_active_bid_round_backfill` (salt DML, idempotent —
  MU-20), `20260929160000_company_user_2fa_attempts` (NOT NULL DEFAULT 0 + iki nullable,
  metadata-only; yeni API'nin firma 2FA girişi bunsuz ÇALIŞMAZ — MU-16),
  `20260929150000_email_log_locale` (nullable TEXT — MU-05).
- Öncesi `20260928170000_referral_invite_cancelled` (enum `ADD VALUE`; referral
  davet iptali satırı silmez, CANCELLED — yayın denetimi Bölüm 5). Öncesi
  `20260928090000_ai_member_invites` (+
  `20260927235000_email_digest_items`, `20260927230000_supplier_discovery_runs`,
  `20260927220000_external_listing_invites`, `20260927210000_email_opt_outs`;
  eklemeli, e-posta Faz 0-2 + üyeye doğrudan davet; staging VE canlıda BEKLİYOR).
  Öncesi
  `20260927200100_international_locale_price_base` (+
  `20260927200000_currency_additions` — enum `ADD VALUE` AYRI dosyada;
  `20260927150000_geo_cities`, `20260927120000_global_registration`; hepsi
  eklemeli, staging VE canlıda BEKLİYOR — Render askısı 1 Ekim'e dek; ardından
  `seed-geo-cities` + `backfill-city-ids` + `backfill-price-base`). API'ye
  alan/parametre eklendi (davet `invites`, ürün `currency`) → API web'den ÖNCE. i18n'in beş
  migration'ı canlı DB'ye yedek alınarak uygulandı (aşağıdaki "BEKLİYOR"
  notları bayat). Öncesi
  `20260924200000_search_text_i18n` (`searchTextI18n` × 3 +
  trigram GIN; staging'e 2026-09-24'te uygulandı, CANLIDA BEKLİYOR). Öncesi
  `20260923235000_category_attribute_names_i18n`
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
- **Migration nöbetçisi** `assert-migration-target.ts` DATABASE_URL ile DIRECT_URL'in İKİSİNİ de
  denetler (Prisma migrate directUrl'e yazar); biri uzaksa `ALLOW_REMOTE_MIGRATION=1`,
  çözümlenemeyen host fail-closed. `wipe-residue` KORUNAN listesi başvuru tablolarını (GeoCity
  dahil) içerir; yeni başvuru/katalog tablosu buraya da eklenir (derin denetim 2026-09-30 LU-09).
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
- **İçe aktarma (derin denetim 2026-09-29 MU-19/MU-23):** her `wb.csv.read`
  `common/files/spreadsheet-reader.ts` `csvReadOptions(buffer)` ile (ayraç tespiti
  `detectCsvDelimiter` + ham metin map + `dateFormats: []`; ExcelJS varsayılanı "1.500"ü
  1.5'e, GG-AA-YYYY'yi ABD sırasına çevirir). Teklif fiyatında kabul edilmeyen para birimi
  (satır ya da belge) her iki yolda errors[] — asla uyarı + teklif birimi değil; şablonda
  birim hücresi boş gelir (yalnız izinli liste doğrulaması) = teklif birimi; sunucu izinli kodu ana birim dahil AÇIKÇA döner, null
  = "birim yok" → istemci teklif birimi (effectiveCurrency) sayar.
- **KYC revizyonu (MU-19):** firma/admin yazması her zaman status=PENDING CAS'ıyla
  (`updateMany` + count); R2 silme yalnız CAS başarılıysa ve ezilen key'de; admin onayı tx
  içinde CAS sonrası yeniden okunan key'i yazar.
- **Katalog/profil (MU-24):** Kalem Kataloğu arşivle ucu any-of [templates:manage,
  sell:product:manage]; vitrine girmiş ürün (isPublic ∨ reviewStatus≠DRAFT) yalnız
  sell:product:manage ile. Hizmet çipi uzunluğu `COMPANY_SERVICE_MAX_LENGTH` (60) — DTO,
  `aiDraftServices`, ChipEditor aynı sabit.
- **Sürekli mounted diyalog (MU-13):** veriye bağlı varsayılan tek seferlik ref ile
  kilitlenmez; `open` + sorgu verisine bağlı efektle, kullanıcı elle düzenlemediyse yeniden
  hesaplanır — ve içerik değişmedikçe state yeniden YAZILMAZ (9aee3158: davet diyaloğu
  sonsuz render döngüsü).
- **TanStack Query v5 `mutate(x, { onSuccess })` callback'i yalnız SON çağrıda çalışır:**
  paylaşılan mutation'da çağrıya özgü sonuç işi `mutateAsync(x).then(...).catch(() => {})`
  ile (derin denetim 2026-09-30 LU-26).
- **Durumunu kendi state'inde tutan kancalar** (ör. `useGeoCityName`) girdi değiştikten bir
  render SONRA güncellenir: "değişim kullanıcıdan mı" ref'ini ilk efekt atlamasında sıfırlama,
  karşı durum gelene dek tut (LU-30). Asenkron işten sonra listeye yazan bileşen fonksiyonel
  güncelleme (`prev => …`) kullanır, açılıştaki props kopyasını değil (`ImageUploader`, LU-31).
- **SSR'lı `<img onError>` yedeği** mount sonrası `img.complete && naturalWidth === 0`
  denetimini de yapar — hata hidrasyondan önce olmuş olabilir (`CompanyLogo`, LU-26).
- **Yol adına göre RENDER DALLANMASI yapma.** `usePathname()` statik/ISR
  üretimde "/" DÖNMÜYOR → hydration #418. "Şu an neredeyim" bilgisini istemci
  efektinden al. (Teşhis: JS'siz DOM ile hydration sonrası DOM'u ÖZNİTELİK
  düzeyinde karşılaştır; `next dev` tam ağacı basar, prod build yalnız "#418".)
- **`useSearchParams` + statik sayfa = BUILD hatası** (`next dev` HİÇ
  göstermez). Herkese açık statik sayfaya panel bileşeni takarken **yerelde
  üretim derlemesi al.** `<Suspense>` yedeği BOŞ KUTU OLAMAZ — sınırın içindeki
  her şey istemciye ertelenir, `<h1>` statik HTML'den düşer (SEO kaybı).
- **`generateStaticParams` + `searchParams` BİRLİKTE KULLANILMAZ (2026-09-26, yerel
  üretim derlemesinde ölçüldü):** `searchParams` okuyan sayfa zaten dinamiktir;
  önceden üretim bir şey kazandırmaz ama derleme anında API geçici hata verirse
  sayfa `notFound()` ile `searchParams`'a ulaşmadan biter, Next onu STATİK 404
  olarak kaydeder ve sonraki her yenileme `DYNAMIC_SERVER_USAGE` ile 500 verir →
  sayfa bir sonraki dağıtıma dek 404 (EN kategori 31000000 böyle kaldı).
  Kategori ve şehir sayfalarından kaldırıldı. Yerel doğrulama: `NEXT_PUBLIC_
  MARKETPLACE_LIVE=true NEXT_PUBLIC_SITE_URL=http://localhost:3000 next build`
  (SITE_URL'siz pazar yeri açık derleme bilerek düşer) + API `MARKETPLACE_LIVE=
  true node dist/main.js`; yerel `DATABASE_URL` `connection_limit=1` →
  açılış süpürmesi sırasında facet 500'leri YEREL eserdir.
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
  İstanbul duvar saati yerel `new Date(y,m,d,h,mi)` ile KURULMAZ (DST'li tarayıcıda ileri alma
  boşluğunda saat kayar): gün `toAppCalendarDate` (yerel öğle), saat `wallClock` (LU-25).
  Takvim günü (YYYY-MM-DD) `formatDate`'e `T12:00:00+03:00` ile verilir (LU-31). API karşılığı
  `common/time/app-calendar.ts`: `new Date(y, m, 1)`/`getMonth()`/`toISOString().slice(0,10)`
  ile sınır ya da gün anahtarı kurulmaz (LU-07/17). ISR'lı herkese açık sayfada "şimdi"ye bağlı
  metin (kalan gün, "Yeni") `useHydrated` sonrası, yer tutucuyla çizilir (LU-30).
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
- **Next instrumentation kancası `src/instrumentation.ts`TE (web + admin `src/app`
  düzeninde):** uygulama köküne konursa Next görmez, sunucu Sentry'si SESSİZCE hiç
  başlamaz (derin denetim 2026-09-29 Y-12; derlemede `.next/server/instrumentation.js`
  oluşmalı). Konumu `src/instrumentation.test.ts` kilitler; client-error yedek
  günlüğü DSN'e değil `Sentry.getClient()`e bakar.
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
- **Web Docker imajı @rothern/i18n'e bağlı** (`next.config.ts` import eder): Dockerfile'lar tüm
  workspace manifestlerini kopyalar, derleme sırası `vercel.json` ile aynı: shared → i18n → web
  (derin denetim 2026-09-30 LU-24).
- **Görseller `cdn.rothern.com`'dan servis edilir**, `pub-*.r2.dev` DEĞİL
  (o bucket'ın Public Development URL ayarı kapalı — coğrafi engel değil).
  Taşıma scripti `scripts/migrate-public-images.ts` (2026-09-05'te koşuldu,
  DB'de artık `r2.dev` adresi yok).
- Demo doluluk: `pnpm --filter @rothern/db seed-marketplace-demo` (idempotent
  ama SİLMEZ; kaldırma `cleanup-marketplace-demo`). Yerel dev = staging DB.

## Test & Kalite

- API **283 dosya / 3.117 test** (2 LIVE spec atlanır) · web **245 / 1.419** · admin
  **41 / 198** · i18n **8 / 39** — toplam 577 dosya / 4.773 test (derin denetim
  2026-09-30 DÜŞÜK turu tam regresyonu, HEAD 4f921485; API 10'luk `--runInBand` partiler).
  Web vitest tam koşuda 6 GB WSL'de yük kaynaklı zaman aşımı verebilir (15 sn / findBy
  1 sn) — dosyayı tek başına yeniden koş, gerileme sayılmaz. `dashboard-analytics.spec` "dolu senaryo" ARA SIRA
  kırmızı (servisin `end = new Date()` ↔ `createdAt @default(now())` yarışı) —
  yeniden koşuda yeşil, gerileme sayılmaz.
- **Bağımlılık kapısı (2026-09-12):** CI'da `pnpm audit --prod --audit-level high`.
  Tarama yokken üretim bağımlılıklarında 2 kritik + 20 yüksek birikmişti
  (Next 15.5.18 RCE uyarısı dahil) → Next 15.5.25 + hedefli `pnpm.overrides`
  ile kritik ve yüksek SIFIRA indi. Kalan ORTA uyarılar ana sürüm göçü ister ve
  bilinçli ertelendi: `@nestjs/core` 10→11, `uuid` 8→11, `@opentelemetry/core`
  1→2. **`file-type` artık bağımlılık DEĞİL** (derin denetim 2026-09-29 Y-04,
  ASF sonsuz döngü CVE): AI girdi türü `detectAiInputMime` ile imza baytlarından
  tanınır; geri getirilmez (`ai-extract-router.spec` kaynakta importu yakalar).
- **Web vitest `sonner` sahtesi bileşenin kullandığı TÜM toast yöntemlerini
  (success/error/info/warning) içermeli** — eksik yöntem TypeError atıp catch
  dalına düşürür, test yanlış dalı sınayıp yine yeşil kalır (derin denetim Y-15).
- **Yarış testi ayrı istemci ister (derin denetim 2026-09-30 LU-02):** `test-db.ts` istemcisi
  `connection_limit=1` ile transaction'ları zaten seri koşturur → eşzamanlılık testi ayrı, çok
  bağlantılı bir PrismaClient ve bariyer kullanır (örnek `admin-staff.spec.ts`); kilitsiz
  sürümde kırmızı olduğu görülür.
- **Web ve admin vitest `@rothern/shared`'i dist'ten okur** (API jest src'yi okur): shared
  değişince vitest'ten önce `pnpm --filter @rothern/shared build` (LU-10).
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

19 `@Cron` işi var (2026-09-28 sayımı) ve hepsi tek ortak sarmalayıcıdan
geçmeli (`trackCronRun`). 2026-09-12'de **advisory lock** eklendi: ikinci bir API
örneği açıldığı gün her iş iki kez koşacaktı (çift hatırlatma, çift özet,
çift temizlik). Kilit `CronLockService`'te, `trackCronRun` onu
`CronRegistryService.lock` üzerinden okur → **scheduler'ların hiçbiri
değişmedi**.

İki tuzak koda yazılı: (1) advisory lock OTURUMA bağlıdır, `DATABASE_URL`
PgBouncer'dan geçtiği için kilit ayrı ve tek bağlantılı `DIRECT_URL`
istemcisinden alınır; (2) **fail-open** — kilit altyapısı bozulursa iş
ATLANMAZ, koşar (aksi hâlde tek yapılandırma hatası tüm cron'ları sessizce
durdururdu); (3) advisory lock aynı oturumda YENİDEN ALINABİLİR → aynı örnekte
üst üste binmeyi tek başına engellemez; `runExclusive` DB kilidinden önce süreç
içi koşu kümesine bakar, hâlâ süren işin yeni tetiği atlanır (fail-open yolunda
da; derin denetim 2026-09-29 Y-08). Sözleşme: `test/unit/cron-lock.spec.ts`.

**Tarama ve yazma kuralları (derin denetim 2026-09-29 MU-14/MU-10):** sırasız `take` +
JS süzgeci YASAK — uygunluk sorguya, `orderBy id` + imleçle tüm adaylar (`scanAll`).
Company üzerinde türetilmiş kolon yazan cron (`medianReplyHours` vb.) HAM SQL ile ve yalnız
değişeni yazar (@updatedAt ilerlemesin). Content-translation `enqueue(type,id,{kick:false})`
— kick kararı çağrı başına, paylaşılan `this.kick` geçici ezilmez. Prisma where'de birden
çok `OR` üreten süzgeç spread edilmez, `AND: [...]` (bildirim `before` imleci portal
süzgecini eziyordu).

### Sürüm akışı — dal koruması BYPASS EDİLEBİLİYOR

`production` dalında "PR şart + Test kontrolü" kuralı var ama depo sahibi admin
olduğu için `git push origin production` kuralı BYPASS ederek geçiyor (uzak
"Bypassed rule violations" uyarısı basıyor). **2026-09-12'den beri `gh` kurulu
ve yetkili** (`repo`, `workflow` kapsamları) → doğru yol:
`gh pr create --base production --head main` + `gh pr merge --merge`. Doğrudan
push yalnız acil durumda. **Birleştirmeden sonra hemen
`git checkout main`** — 2026-09-12'de `production`da kalınıp oraya commit
atıldı, `checkout -B` ile dal sıfırlanınca commit düştü (reflog'dan kurtarıldı).

**Zorunlu kontrol tek iş (derin denetim 2026-09-30 LU-01):** `Test (api + typecheck)`
kontrolünü YALNIZ `test.yml`'deki test işi raporlar; aynı adlı ikinci iş (eski
`test-docs-only.yml` gibi) EKLENMEZ — aynı adlı iki kontrolden biri zorunlu kapıyı gerçek
testler bitmeden karşılar. Yalnız belge içeren PR'da atlama `changes` işi + `if: !cancelled()
&& needs.changes.outputs.code != 'false'` ile (şüphede testler koşar). `health-prod` push
koşumu `EXPECTED_SHA` verir, `prod-health.mjs` `/health` sürümü o SHA'ya eşitlenene dek yoklar
— sabit bekleme sürümün indiğini kanıtlamaz (O-37, O-38).

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
+ şifreli TOTP sırrı · Supabase Auth hata sınıfları (aşağıda).

**ADMIN 2FA ZORUNLULUĞU (derin denetim 2026-09-29 MU-01).** Tek kaynak
`common/config/admin-2fa.ts`; env `ADMIN_2FA_REQUIRED_ROLES` (tanımsız → prod'da
SUPER_ADMIN, diğer ortamlarda boş; `none` → kapalı + boot/Sentry uyarısı; bilinmeyen rol →
boot durur; render.yaml'da YOK, acil anahtar dashboard'dan — O-27). `AdminJwtStrategy` her
istekte `twoFactorEnabled` (etkin ∧ sır) döner; `AdminRolesGuard` zorunlu roldeki 2FA'sız
admini yalnız `@AllowWithoutAdmin2fa` uçlarına bırakır (YALNIZ me, 2fa/setup, 2fa/enable —
başka uca EKLENMEZ, `admin-2fa-enforcement.spec` kaynak ağacını tarar), gerisi 403
`ADMIN_2FA_SETUP_REQUIRED`. Login kilitlemez; login ve /me `twoFactorSetupRequired` döner,
panelde `RequireAdminAuth` yalnız `/admin/settings`i açar. Staging `NODE_ENV=production` →
staging'de de zorunlu. Personel servisinde kendine yıkıcı işlem (rol düşürme, pasifleştirme,
şifre sıfırlama) actorId ile reddedilir (MU-21).

**FİRMA 2FA FRENİ + E-POSTA KODU (MU-16).** `CompanyUser.twoFactorFailedAttempts/
twoFactorWindowStartedAt`: 15 dk'da 5 deneme (TOTP, kurtarma, e-posta; doğrulamadan ÖNCE
koşullu ayrılır, başarıda sıfırlanır), kilitte 429 `TWO_FACTOR_LOCKED` + sahibine tek
e-posta; `twoFactorLastTotpStep` aynı kodun tekrarını reddeder (kurulum da kapsanır: `enableTwoFactor`
kurulum kodunun adımını yazar; kurulumdan hemen sonra girişi sınayan testler adımı bir geri
çeker — `ageTotpStep`, derin denetim 2026-09-30 LU-33; migration `20260929160000_company_user_2fa_attempts`). Doğrulanan
`EmailVerificationCode` SİLİNİR (koşullu, count === 1); `usedAt` yalnız "yeni kod üretilince
kapatıldı"; saatlik tavan (`EMAIL_CODE_MAX_PER_HOUR`) yalnız doğrulanmamış kodu sayar; tavan
dolu + geçerli kod → `twoFactorRequired`, yoksa 429 `EMAIL_CODE_CAPPED` (503 yalnız gönderim
hatası). KVKK dökümünün CompanyUser `omit` listesi her yeni auth/güvenlik iç kolonuyla
birlikte güncellenir. Onboarding'de başka firmaya kayıtlı vergi no 409 `TAX_NUMBER_TAKEN`
(taxNumber hâlâ global @unique). Token dönen her akış `rememberMe`yi gövdede taşır
(verify-email dahil — MU-23), taşımayanda interceptor kalıcı çerez basar.

**API ERİŞİM GÜNLÜĞÜ İZİNLİ LİSTEYLE (MU-12).** `common/logging/request-log-serializer.ts`
`LOGGED_REQUEST_HEADERS` (host, user-agent, referer maskeli, origin, content-type/length,
accept, accept-language, x-request-id): sır taşıyan yeni başlık redact'e eklenmeden de
düşmez; başlık açmak = listeye ekleme + gerekçe (`x-rothern-ssr` = SEO_REVALIDATE_SECRET her
SSR satırına düşüyordu). Web/admin Sentry `scrubEvent` request.url, breadcrumb url/from/to/
http.query, `request.query_string`, `contexts.nextjs.request_path` ve transaction'ı süzer;
URL taşıyan yeni Sentry alanı buraya eklenir.

**SUPABASE GİRİŞLERİ İSTEMCİ IP'SİYLE (derin denetim 2026-09-29 Y-11).** Girişler
Supabase'e API sunucusundan gider; IP başına giriş kotası tek IP'de paylaşılırsa
herkes kilitlenir → Supabase kotası **YÜKSELTİLİR, sıkılaştırılmaz**.
`SUPABASE_SECRET_KEY` YALNIZ `sb_secret_` önekliyse kullanılır: `verifyPassword`
o anahtarla, istemci IP'si (`resolveClientIp`) `Sb-Forwarded-For` ile. Başka değer
yok sayılır (anon istemci, IP iletimi yok, warning `supabase=auth_secret_key_invalid`).
Sınıflar tek kaynak `supabase-auth.service.ts`: 401 + "api key" / secret anahtarla
kodsuz 401 → 503 `auth_misconfigured` (asla "şifre hatalı"); IP iletildiyse 429 →
429 + warning `auth_client_rate_limited`; iletilmediyse (paylaşılan kota) 503 +
error `auth_rate_limited`; `weak_password` → 400 `WEAK_PASSWORD` (sıfırlamada
güncelleme düşerse jeton geri açılır). Yeni çağıran `clientIp` geçirir ve
`isSupabaseAuthAccessError` ile 503/429'u aynen geçirir (yoksa 429 `bad_credentials`).
Operatör: `docs/qa-launch-audit-2026-09-28.md` O-17…O-19.

**YÜKLENEN ZIP/XLSX (derin denetim 2026-09-29 Y-02/Y-03).** ZIP başlık beyanlarına güvenilmez:
`common/files/zip-inspect.ts` `assertZipWithinLimits` her girişi tavanlı gerçekten
açar (CEN EOCD'nin hemen önünde biter, kayıt sayısı birebir; EOCD'nin altı alanından
biri 0xFFFF/0xFFFFFFFF → ZIP64 red). Yeni xlsx/docx okuma yolu `wb.xlsx.load`dan
ÖNCE bunu (ya da `assertXlsxSafe`) çağırır ve `XLSX_LOAD_OPTIONS` ile yükler
(`dataValidations` ayrıştırılmaz; spec kaynağı tarar). Birleşme maliyeti ExcelJS
`Range` semantiğiyle (`mergeRefCells`: getter `x||1`), tanımlı ad `CellMatrix.addCellEx`
ile (`definedNameRangeCells`: ham sınır, dış döngü turu); toplam >100k hücre, >5k
birleşme ya da güvenli tamsayı üstü sınır → `size`. **exceljs yükseltilince**
`zip-inspect.spec` "gözden geçirme R-1" diferansiyel testleri kopya kuralların
ayrışmasını yakalar.
Yüklenen sayfada `for r<=ws.rowCount` + `getRow/getCell` YASAK (eksik satır/hücreyi
YARATIR) → `ws.eachRow({includeEmpty:false})` + `row.findCell`/`ws.findRow`.

**AI GİRDİ YÖNLENDİRİCİ — HEIC (derin denetim 2026-09-29 Y-04, `ai-extract-router.ts`).** Piksel
kapısı çözmeden ÖNCE: `heifMaxDeclaredPixels` ispe'lerin ve grid/iovl tuvallerinin
(iinf→iloc→idat/mdat) en büyüğünü alır, fail-closed; `MAX_HEIC_PIXELS` = 25 MP
(24 MP iPhone geçer, 48 MP "HEIF Max" 400). Süreç genelinde TEK çözme yuvası
(`acquireHeicDecodeSlot`, FIFO; 30 sn sıra aşılırsa 429 `HEIC_DECODE_BUSY` — 503
değil: web 5xx'i genel toast'a çevirir, Sentry filtresi 5xx'i raporlar). 25 MP
512 MB konteynerde OOM'a karşı KESİN güvence değil (Render bellek izlemesi operatör O-8; kalıcı çözüm
`resourceLimits`li worker). Yeni türetilmiş öğe türü (ör. `tmap`) →
`HEIF_DERIVED_CANVAS_TYPES`. Bozuk görsel/çözünürlük hataları 400.

**REALTIME, İNDİRME, İSTEMCİ HATA UCU (derin denetim 2026-09-30 LU-13/14/19).** WS origin kısıtı
`cors` ile DEĞİL engine.io `allowRequest` ile uygulanır (cors paketi izinsiz origin'i
reddetmez); `isWsOriginAllowed` REST allowlist'iyle aynı kalır (prod `CORS_ORIGINS`, O-44).
`handleConnection`'ın doğrulama sözü `client.data.ready`'de; yeni `@SubscribeMessage` işleyicisi
`client.data`'ya güvenmeden önce onu await eder. İstemcinin okuması gereken yeni yanıt başlığı
`CORS_EXPOSED_HEADERS`'a eklenir; presigned GET `Content-Disposition` her zaman
`contentDisposition()`. Web ve admin `/api/client-error` aynı kural: `x-real-ip`, toplam tavan,
sunucu tarafı `scrubUrl`.

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

## YAYIN DENETİMİ 2026-09-28/29 — kalıcı kurallar

Tek kayıt `docs/qa-launch-audit-2026-09-28.md` (16 bölüm, bulgular + operatör
matrisi + runbook); derin denetim ve düzeltme durumu
`docs/qa-launch-audit-2026-09-29-derin.md`. Bir daha bozulmasın diye:
- **Mesajlaşma derin linki (derin denetim 2026-09-29 Y-18):** `/company/mesajlar?
  with=<firma>` her zaman `&portal=satinalma|satis` taşır (linki AÇANIN yönü;
  e-posta CTA'sı `appRoutes.messagesWith(base, id, locale, portal)`). `with`
  seçiliyse panel her zaman çizilir; ad listede yoksa `GET /company/messages/
  with/:id` `otherParty.name`. Portalsız linkte yön = bu firmayla var olan
  konuşma (okunmamış > en yeni), yoksa ilk portal; `selected`a YALNIZ portal=null
  seçimde, iki taraf izinliyken ve konuşmalar yüklendikten sonra BİR KEZ yazılır —
  LIVE yoklama seçimi kaydırmaz, açık `?portal=`/kullanıcı seçimi ezilmez (bayat
  izin anlık görüntüsü; `company-inbox-view.tsx`).
- **Kesinti ≠ boş veri (web):** `lib/public/marketplace-api.ts` ana veri
  çağrıları (`getJson(..., critical=true)`, `getDetail`) ağ hatası/5xx/429'da
  çalışma anında `PublicApiUnavailableError` atar (ISR son iyi sürümü korur);
  404/4xx = gerçek yok; `next build`de atılmaz. İkincil bloklar yedekle kalır.
  Sunucudan `/public/*` çağıran sayfa düz `fetch` değil `publicHeaders(locale)` kullanır (dil,
  SSR sırrı, ziyaretçi IP'si; dinamik sayfada önce `attributeSsrToVisitor()`); ikincil bloklar
  kritik olmayan yardımcıyla (`fetchSimilarListings`/`fetchRelatedProducts`), `crossCounts`
  gibi ikincil blok ana fetch'in hatasını kendisi yutar (derin denetim 2026-09-30 LU-23/24).
  Hata sınırları `robots noindex` taşır.
- **SSR kovaları (derin denetim 2026-09-29 MU-12; eski "muafiyet" KALKTI):** web
  sunucusu `SEO_REVALIDATE_SECRET`i `x-rothern-ssr`de yollar; API yalnız GET ∧
  `/api/public/*` için kabul eder (`isTrustedSsrRequest`) ve sınırı ATLAMAZ. Pazar yeri
  veri önbelleği `lib/public/marketplace-api.ts` `loadPublicJson` içinde (url, dil)
  anahtarlı `unstable_cache` (revalidate + etiketler aynı; RM-12); içerideki fetch
  no-store, 5xx/429/ağ hatası içeride atılır (önbelleğe girmez, bayat = son iyi kopya
  kalır), **404 ise `{ __rothernPublicNotFound: true }` DEĞER olarak önbelleğe yazılır**
  (atılırsa Next ISR yenilemesinde hatayı yutup bayat gövdeyi döner → gizlenen kayıt
  çizilmeye devam eder). Yeni pazar yeri okuması `getJson`/`getDetail`'den geçer;
  `fetch(..., { next: { revalidate } })` doğrudan YAZILMAZ (IP başlığı önbelleği ziyaretçi
  başına böler). Ziyaretçi IP'si yalnız gerçek ıskalamada API'ye gider, anahtara girmez:
  web Vercel'in `x-real-ip`sini `x-rothern-client-ip` ile iletir
  (`lib/public/ssr-visitor.ts` `attributeSsrToVisitor()` — argümansız, YALNIZ zaten dinamik
  çizimde (sayfa searchParams okuyor) çağrılır: ürün/talep dizini, firma sayfası ve
  generateMetadata'sı, şehir sayfası `resolveCity`) → ziyaretçi kovası (`ssr-bucket:default:ip:<ip>`, `THROTTLE_PUBLIC_LIMIT`
  600/dk). İlişkilendirilmemiş SSR/ISR tek ortak kova (`THROTTLE_SSR_LIMIT` 5000/dk, örnek
  başına bellek içi, blok 60 sn — blockDuration KISALTILMAZ: blok bitince sayaç sıfırlanır,
  fiili tavan limit/blok olur). IP ve auth kovalarını tüketmezler. `x-rothern-client-ip`
  sırsız yok sayılır. Sır Render + Vercel'de AYNI ve ≥16 karakter. ISR rotalarında (talep,
  ürün detayı, OG) rastgele yol kalıntısı Vercel Firewall'da (O-31). Web vitest
  `vitest.setup.ts` `unstable_cache`'i önbelleksiz geçirir. Sözleşme
  `ssr-throttle-bypass.spec`, `ssr-visitor.test`.
- **Başka firmanın sektörü** `localizeIndustry` (ürün satıcı kartı, bağlantılar,
  sipariş karşı tarafı) — çapraz-firma okumada serbest metin çevrilmeden basılmaz.
- **Şifre politikası tek:** kayıt, davet kabulü, değiştirme, sıfırlama = 10
  karakter + küçük/büyük harf + rakam + özel (`password-policy-parity.spec`;
  web `usePasswordRules` / `PASSWORD_MIN_LENGTH`).
- **E-posta:** işlem dışı her e-postada alıcının dilinde KVKK aydınlatma
  bağlantısı (`privacyNoticeUrl`); günlükte adres maskeli (`maskEmail`).
- **Kayıtsız adrese davet SİLİNMEZ**, iptal edilir (kullanıcı iptali ve paket
  düşüşü — `cancelOutgoingReferralInvites`): silmek talep davetlerini cascade ile
  ve adres freni geçmişini götürür.
- **AI:** çeviri çıktısı kaynakta olmayan bağlantı/e-posta/telefon içeremez
  (`injectedContactErrors`); önceden onay ülkesi ipuçlarından HERHANGİ biriyle
  (`isConsentCountry`: etiket · e-posta · site uzantısı); site ile üye eşleşmesi
  alan adında e-postalı etkin kullanıcı ister.
- **Soğuk davet ısınması hacme bağlı:** tavan ≤ 2 × son 7 günün en yoğun günü.
- **Durdurma anahtarları `0`:** `COLD_INVITE_MAX_DAILY`, `CONTENT_TRANSLATION_
  DAILY_USD`, `AI_DISCOVERY_DAILY_USD` (0 = durdur; tanımsız = varsayılan).
- **Mobil:** `flex` satırında `shrink-0` uzun metin 375 px'te sayfayı genişletir
  (hızlı talep 502 px'e çıkmıştı); `role="table"` yalnız gerçek tabloda.
- **Pazarlama rızası (`marketingConsent`) gönderimde OKUNMAZ — bilinçli**
  (kullanıcı kararı 2026-09-29, denetim H-2): karşılama/teşvik e-postaları
  hizmet iletisi; İYS avukat görüşü (H-3) aksi derse teşvik adımları ona bağlanır.
- **Tedarikçiye giden bildirim/e-posta "alım talebi"** (kullanıcı kararı
  2026-09-29, B6-4); alıcıya giden (kendi talebi) "satın alma talebi" kalır.
- **KVKK sil/anonimleştir (derin denetim 2026-09-29 MU-03/MU-02):** Company'ye Cascade ile
  bağlı ve karşı tarafın kaydını taşıyan her yeni ilişki sert silme kapısının
  `retentionCounts` listesine eklenir (şu an: sipariş, teklif, ilan, gönderilen mesaj,
  thread alıcı/satıcı, talep daveti, claimedCompanyId'li bilgi talebi, değerlendirme,
  şikayet, üyelik olayı). Kişisel veri taşıyan her yeni firma tablosu/kolonu anonimleştirme
  tx'inde temizlenir (cascade çalışmaz; şu an banka hesabı, kullanıcı daveti, COMPANY
  çevirisi, adres kişi/vergi alanları, slug, searchTextI18n). `exportData`
  `complaintsReceived` yalnız id/reason/status/createdAt/resolvedAt. Firma görünürlüğünü
  değiştiren her yol (askı/kaldırma, şikayetten askı, anonimleştirme, sert silme — slug
  önceden okunup `companyChanged(id, removed)`) `seo.companyChanged` çağırır.
- **Admin işlemleri (MU-02/MU-04/MU-21):** şikayet `adminNote` İÇ nottur, askı gerekçesine
  düşmez; isteğe bağlı gerekçe boşken şablonun `{gerekce}`sine sabit TR metin konmaz →
  alıcının dilinde parametresiz ayrı anahtar. `billingEmail` `@IsEmail`, küçük harf. Admin
  talep müdahaleleri (kapat/uzat/yeniden aç) katılımcılara `notifyListingParticipants` ile
  bildirir (gerekçe gitmez; ping/bildirim best-effort, yanıtı düşürmez); admin referans
  daveti iptali de SİLMEZ. Admin eliyle açılan üye onayı kendisi verir: onay alanları boş
  hesap `/me`de `needsTermsAcceptance` → `TermsAcceptanceGate` (`POST company-auth/
  accept-terms`; admin kimse adına onay yazmaz, API sert kapısı yok); seed/demo betikleri
  yeni companyUser'a üç onay damgasını yazar. Admin panelinde hata toast'ı her zaman
  `toastApiError(e, fallback)` (`e instanceof Error ? e.message` ve düz `toast.error` YASAK;
  `no-raw-error-toast.test` zorlar); serbest metin gerekçe `PromptDialog`
  `minLength`/`maxLength` = DTO; rol-kapılı yeni admin GET yüzeyi `admin-permissions`
  matrisine ve `admin-action-roles-drift.spec`e birlikte girer; logout hook'ları isteği
  (3 sn tavan) bekleyip yönlendirir.
- **Admin paneli ve admin uçları (derin denetim 2026-09-30 LU-01/03/11/12/13/17):** rol kısıtlı
  uç çağıran sorgu `canAdminDo` ile kapılanır (react-query `enabled`); tüm rollere açık okuma
  yüzeylerinde (ilan/sipariş/ürün inceleme, Sistem) her yazma düğmesi de. Tek aksiyon birden
  çok uca karşılık geliyorsa drift spec her ucu `aksiyon:uç` satırıyla denetler. Admin ilan
  müdahalesi sahip tarafının kapanış kurallarını aynen uygular (`MAX_LISTING_HORIZON_MS`,
  `closesAt > bidsOpenAt`, koşullu `updateMany(status)`, `seo.listingChanged`); admin
  `updateProfile` vergi no'yu `normalizeTaxId` + `isValidTaxIdForCountry`'den geçirir;
  inceleme listeleri sessiz kesmez, `{ items, truncated }`; gerekçesiz askıda parametresiz
  `askiyaAlindiGerekcesiz` anahtarı (`blockedReason` iç kayıt). Denetim kaydında firma aktörü
  `company`, eylem süzgeci önek grupları (API `startsWith`); API'ye yeni audit eylemi
  (ücretli toplu işler dahil, `X_ACTION = "admin.…"` sabiti) eklenince
  `apps/admin/src/lib/audit-actions.ts`'e etiket (+ gerekirse önek) — `audit-actions.test` API
  kaynağını tarar. datetime-local değeri `lib/date.ts` `toDateTimeLocal` (backend kesin `>`
  istiyorsa `nextDateTimeLocal`), gün `toDateInput`; `toISOString().slice(…)` YASAK. Stats
  `countryBreakdown` ilk 10, ülke seçimleri `countryOptions`. `status-labels` ve
  `EMAIL_TEMPLATE_LABELS` drift testleriyle şemaya ve `packages/email`'e bağlı.
- **Herkese açık arama girdisi (MU-11):** q 80-120 karaktere kırpılır; `tokenizeQuery` ile
  AND listesi kuran sorgu token'ları katlanmış biçimle tekilleştirip sayıca sınırlar
  (kategori `CATEGORY_SEARCH_MAX_LENGTH`=120, `CATEGORY_SEARCH_MAX_TOKENS`=8).
  `ReasonDialog` `maxLength` = gerekçeyi alan DTO'nun @MaxLength'i; şikayet
  `lib/company/complaint-payload.ts` (reason ≤120 + detail ≤2000), engelleme ≤500.
- **Oturum deposu ve metin kalitesi (MU-27):** firma verisi taşıyan her yeni sessionStorage
  anahtarının öneki `tenant-storage.ts` `TENANT_SESSION_PREFIXES`e eklenir (çıkışta
  silinir). `looksLikeProse` yazı sistemine duyarlı (Latin/Kiril/Yunan sesli harf, diğer
  yazılar muaf, boşluksuz CJK/Tay'da sözcük kuralları atlanır).

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
- i18n: Faz 2 (panel) + Faz 3 (API/bildirim/e-posta) + çok dilli arama
  2026-09-24'te BİTTİ; sırada canlıya alma (5 migration + PR #57). Faz 4 kategori adları
  2026-09-23'te BİTTİ; nitelik etiketleri/süzgeç değerleri küçük artık.
  Faz 0 + Faz 1 (herkese açık yüzey, kimlik akışı, dil seçici) + Faz 1e
  (içerik otomatik çevirisi) + Faz 4 (kategori adları) 2026-09-23'te BİTTİ.
  Canlı sırası: üç migration (`20260923120000` locale, `20260923180000`
  content_translations, `20260923230000` category_names_i18n) → PR #57 →
  `apply-category-names-i18n` (TSV'den, model yok) → Render `AI_MODEL_PREMIUM`
  Vertex'in tanıdığı Pro adı (yapıldı) → admin backfill (canlı boş, gerekmez).

**Teknik borç**
- **Tablo okuma tek kaynağı yarım:** CSV okuma seçenekleri artık ortak
  (`csvReadOptions`, derin denetim 2026-09-29 MU-08/MU-19), ama
  `listing-item-import.service.ts` xlsx yükleme/ayrıştırma yolunun KENDİ kopyasını
  taşıyor — güvenlik düzeltmesi İKİ dosyaya da uygulanmalı (ya da o yol tek kaynağa
  taşınmalı).
- **Derin denetim DÜŞÜK turu:** artık kalmadı (panel ürün listesinde engel süzgeci ff86fd64,
  `?q=` taslağı 8b646170). Kararlar 63…72 ve ayrıntı `docs/qa-launch-audit-2026-09-29-derin.md`
  "DÜŞÜK düzeltme durumu".
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
ömürlük ve BAŞARIYA bağlı (derin denetim 2026-09-29 MU-06): başarılı dönüşün
`company.profile_enriched` audit kaydı sayılır (başarısız/boş deneme hak yakmaz; kayıt
await'li + critical) + ömürlük ücretli çağrı tavanı (costUsd>0 `profile_enrich` satırı
≤ 6); ikisi firma satırının FOR UPDATE kilidi altında, günlük deneme sayacıyla aynı tx'te
(aylık bütçe değil — bir kerelik kurulum adımı). STANDART paylarını
`caps.requestShareByTier` 0,2 ve `caps.dailyShareByTier` 0,5 ezer (genel %5'e grounded
çağrı ~0,056 USD sığmıyordu); bağlı iki aşamalı akışta ilk çağrı `followUpInputChars`
verir (takip çağrısına havuz/kullanıcı/gün tavanında yer yoksa ücretli ilk çağrı başlamaz).
Profil ucu `callAi`'nin HttpException'larını 503'e çevirmez. STANDART'a
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

**AI çıktısı okuma (derin denetim 2026-09-29 MU-08/MU-07):** sayı metni tek kaynak
`modules/ai/ai-text.ts` `parseSeparatedNumber` (iki ayraçta sondaki ondalık, tekrarlanan
3'lü grup binlik, tek ayraç + 3 hane kararını çağıranın dil bayrağı verir; yalnız baştaki
`-` işarettir, ortadaki aralık → null) — yeni AI sayı ayrıştırıcısı elle yazılmaz.
Yapılandırılmış çıktı şemasında okuma üstbilgisi (docLanguage/docCurrency) büyük dizilerden
ÖNCE (`propertyOrdering`), MAX_TOKENS kurtarması dili kaybetmesin. AI yükleme presign'ı MIME'ı
`resolveAiUploadMime` ile kanonikleştirir (Windows .csv = application/vnd.ms-excel, codec'siz
HEIC = ""); DTO'lar servisin kırptığı sınırları doğrulama kuralı yapmaz (SeoEnrichDto).
Asistan kalemli teklifte amount göndermez, PlaceBidDto kuralları propose aşamasında denetlenir.

**AI bütçe ve asistan (derin denetim 2026-09-30 LU-04/17/26):** bütçe reddinin mesajı son adayın
(fallback) sebebinden üretilir. Asistan rezervasyon tahmini = systemPrompt (taslak dahil) ×
(MAX_TOOL_ITERATIONS+1) çağrı + birikimli araç sonuçları + (MAX_TOOL_ITERATIONS+1) ×
MAX_OUTPUT_TOKENS; döngüye çağrı eklenirse tahmin de güncellenir. İlk mesajda açılan oturum tur
yazılmadan hata alırsa silinir (turnCount=0). İçerik çevirisi maliyeti her zaman
`pricingFor(model)` (fiyatsız model premium; `cfg.pricing[model] ?? 0` yazılmaz), platform USD
tavanı yuva alındıktan sonra da denetlenir. Web asistan paneli: geç gelen yanıt ya da onay
sonucu sohbet değiştiyse (convRef) yazılmaz; confirm hatası "İptal edildi" değil `failed`
("sonucu doğrulanamadı"); oturum detayı önbelleklenmez (staleTime/gcTime 0).

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
branch `main`. Her özellikten sonra commit; **push BİRİKTİRİLİR** (2026-09-27, kullanıcı: "limiti doldurduk, her şeyi deploy etme hemen" — `main`'e her push Vercel web+admin önizleme derlemesi = Build CPU dakikası = para). İş bir bütün olarak bitince, kullanıcıya haber vererek TEK push; doğrulama yerelde (`next build`, vitest, jest).
**`gh pr edit` ÇALIŞMIYOR** (2026-09-23: GitHub Projects classic GraphQL hatası) →
`gh api -X PATCH repos/ugur-062/supkeys/pulls/<N> -f title=… -F body=@dosya`.
