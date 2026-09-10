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
```

`pnpm dev` (turbo, hepsi) veya `pnpm --filter @rothern/{api,web,admin} dev`.

## Test Hesapları (Dev)

Parolalar **gitignore'lı `CLAUDE.md.local`'da** — buraya GERİ YAZILMAZ.
Gerekçe: dev ve prod **AYNI** veritabanını kullanıyor, "dev" hesapları CANLI
hesaplardır.

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
7. **Kazandırma kalıcı:** toplu veya kalem bazlı → Tender AWARDED + Order
   (`ORD-YYYY-NNNN`). Geri alma (un-award) YOK.
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

Kapı YALNIZ YENİ KAYDA uygulanır: `COUNTRIES` (98) kısaltılmadı; mevcut
firmaların ülkesi gösterilebilmeli, adres defterinde her ülke seçilebilmeli.

**KYC kapısının yeri — prensip: doğrulama, PLATFORMUN KEFİL OLDUĞU yerde istenir.**

| Aksiyon | VERIFIED şart mı |
|---------|------------------|
| Gezinme · bağlantı · mesaj · TASLAK | ❌ |
| **Davetli/bağlantılı** talebe teklif | ❌ (alıcı firmayı tanıyor) |
| PUBLIC talebe tanımadan teklif | ✅ (+ SILVER) |
| Talep yayınlama · kazandırma | ✅ (+ GOLD) |
| Paket satın alma | ✅ (+2FA +web sitesi) |
| Sipariş kabulü | ❌ bugün (platform parayı taşımıyor; **escrow gelirse buraya taşınmalı**) |

Belgesiz teklif veren firma alıcıya **"Doğrulanmamış firma"** ibaresiyle görünür.
Sözleşme: `kyc-bid-gate.spec.ts`.

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
  **Kayan oturum:** `AuthCookieInterceptor` ömrün yarısı geçince taze token basar.
- Küçük metinde `text-zinc-400` KULLANMA (beyazda 2,6:1) — en az zinc-500.
- Gri zeminde `bg-zinc-50` yasak (brand-50 = sayfa zemini); tint min zinc-100.

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
| İçe aktarma sütun/limit | `@rothern/shared` `item-import.ts` / `bid-import.ts` / `product-import.ts` |
| IBAN (TR + yabancı mod-97) | `@rothern/shared` `ibanChecksumOk` / `isValidIbanTr` |
| Ölçü birimi · faaliyet tipi · kayıt ülkesi | `@rothern/shared` `constants/{units,company-activities}.ts`, `data/country-profiles.ts` |
| Görünürlük katmanı (public) | `lib/public/visibility.ts` (`VISIBILITY`, `canSee`, `loginHref`) |
| Pazar yeri sözcükleri/rotaları · yayın anahtarı | `lib/public/{marketplace,marketplace-live}.ts` |
| Panel pazar adresleri | `lib/company/panel-market.ts` |
| Süzgeç URL şemaları | `lib/public/{product,listing,company}-filter-params.ts`, `lib/company/request-filter-params.ts` |
| Süzgeç kabuğu + yapı taşları | `components/marketplace/{filter-shell,filter-primitives}.tsx` |
| Panel liste süzgeçleri (durum ÇOKLU seçim) | `components/list/{filter-select,filter-multi-select}.tsx` — durum süzgeçleri `FilterMultiSelect` (dizi; `?status=A,B`), tek seçimli olanlar `FilterSelect` (2026-09-10 kullanıcı kararı) |
| KPI seçicileri (pano ↔ listeler) | `lib/company/kpi-selectors.ts` |
| Profil tamamlanma | `@rothern/shared` `profileCompleteness` (10 madde; "Fotoğraflar" 2026-09-10'da kalktı) |
| Doğrulama durumu etiketi + KYC kilidi (web) | `lib/company/verification-status.ts` (`verificationMeta`, `isKycLocked`) — hub rozeti, Doğrulama ve Firma Bilgileri aynı sözlük; backend `LOCKED_KYC` = name·legalName·mersisNo·tradeRegistryNo·ibanHolder (+IBAN), PENDING/VERIFIED'da |
| Para birimi sembolü · tarih · para gösterimi (web) | `lib/tenders/labels.ts` · `lib/format-date.ts` · `components/ui/money.tsx` |
| İzin aynası (web) | `lib/company/permissions.ts` |
| Herkese açık adres şeması (ürün/firma/talep/kategori/şehir) | `@rothern/shared` `helpers/public-paths.ts` (web `lib/public/{marketplace,city}.ts` yeniden dışa aktarır) |
| Sayfa metası + JSON-LD + tanım cümlesi | `lib/seo/meta.ts` `buildMetadata` · `lib/seo/entities.ts` `{product,company,listing}Seo` |
| OG/Twitter kartı içeriği ve çizimi | `lib/seo/og/{content.ts,card.tsx}` |
| Sitemap parçaları · XML | `lib/seo/sitemap-parts.ts` · `lib/seo/sitemap-xml.ts` (API `public-sitemap.service.ts`) |
| Önbellek etiketleri (web ⇔ API) | `lib/seo/tags.ts` ⇔ `modules/seo-index/seo-index.service.ts` `SEO_TAGS` |
| Arama görünürlüğü puanı (ürün/firma/talep) | `@rothern/shared` `helpers/seo-readiness.ts` |

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
L1 (tam) · firma ALT kategori L2-4 tavan 50 (tam) · AI önerisi 2 aşamalı → L3.
Ana ve alt AYRI eksen; eşleştirme (`deriveCategoryMatchCandidates`) koddan tüm
üst seviyeleri türetir. İkinci eksen: `Company.activities` (tavan 3) —
kategori NE'yi, faaliyet tipi NASIL'ı söyler.

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

**Kategori fotoğrafları:** 58/58 segment, `apps/web/public/categories/<kod>.webp`
(CC0/PDM, künye `docs/category-photo-credits.md`). Gerçek fotoğraf YALNIZ iki
yerde: **ürün** (firma yükler) ve **kategori**. **Satın alma talebi fotoğraf
TAŞIMAZ** — tonlu segment ikonunda kalır. Tek kaynak `category-photos.ts`.
**Firma profili GALERİSİ KALDIRILDI (2026-09-10, kullanıcı kararı):** Profilim
ve herkese açık profil fotoğraf bölümü çizmez, yükleme yolu yok; `Company.
photos` kolonu duruyor (migration yok), web göndermez. Logo/kapak/sertifika
görselleri kalır.

**Profilim düzeni (2026-09-10):** SOLDA profil (başkalarının gördüğü hâl,
`CompanyProfileView layout="stacked"` — tek sütun, yerinde düzenleme), SAĞDA
yapışkan ray (`Profil durumu` %tamam + eksikler + "alıcıların sizi bulması
için" → `SearchVisibilityCard` → Ürünlerim → gizlilik). Ürün formuyla aynı
kalıp; xl altında ray profilin altına iner. Herkese açık sayfa `columns`
düzeninde, değişmedi.

---

## Paketler, İzinler, Koltuk

### Üç paket
Tek kaynak `@rothern/shared` `helpers/tier.ts` (`TIER_ORDER` STANDART<SILVER<GOLD,
`PAID_TIER="SILVER"`, `BUYING_TIER="GOLD"`, `SEAT_LIMITS` 2/4/6). Bronz KALDIRILDI.

| Paket | Ne | Koltuk |
|-------|----|--------|
| STANDART (ücretsiz) | profil + 10 ürünlük vitrin + dizinde yer (paketlilerden SONRA); davetli/bağlantılı talebe teklif, mesaj, sipariş; **PUBLIC talepleri GÖRMEZ**, bağlantı daveti gönderemez, gelen bilgi talebi ANONİM | 2 |
| SILVER (satış paneli) | dizinde öncelik + "Doğrulanmış", sınırsız ürün + belge/video, PUBLIC talep görme/teklif, bağlantı daveti, bilgi talebi kimliği+yanıt, Ziyaret Edenler, İş Analizi, satış AI'ı | 4 |
| GOLD (iki panel) | Silver + satınalma paneli (talep açma, kazandırma, onay akışı, raporlar, şablonlar, talep AI'ı) + "Gold Üye" | 6 |

Kapı: `CompanyPaidTierGuard` + `@RequireTier("GOLD")` (varsayılan SILVER).
Fiyatlar (Silver 160 / Gold 230) kullanıcı kararı BEKLİYOR.

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
  `/company/sirketim/profil`; Onay Akışları kartı `/company/onaylar?tab=flows`
  (eski `/company/ayarlar/onay-akislari` → `next.config` 308;
  `ApprovalFlowsSection` artık `onaylar/_components/`). Bölüm içinde sayfa
  başlığı TEKRAR EDİLMEZ (Banka, 2FA, Firma Bilgileri). Liste bölümleri
  `isError` + "Yeniden dene" taşır; Aktivite/AI 403 ile genel hatayı ayırır.
  Form hataları satır içi `<ErrorMessage>` (Hesap, Şifre, Davet). Tek
  kaynaklar: telefon `lib/company/phone.ts` `isValidPhone`, IBAN
  `isValidIbanTr`/`normalizeIban` (Doğrulama sayfası da). Doğrulama "Gönder"
  eksik listesi (`MissingFields`). Sözleşme: `ayarlar/__tests__/page.test`,
  `invite-user-dialog.test`.
- **Firma Bilgileri (2026-09-10):** Kimlik kartı salt-okunur (firma kodu,
  kayıt ülkesi, hukuki yapı, vergi kimliği — etiket ülke profilinden, Vergi
  Dairesi/KEP yalnız TR — yetkili kimlik no MASKELİ `maskNationalId`; şahıs
  firmasında vergi no=TCKN de maskeli). **Firma adı da KYC kilidinde**
  (kullanıcı kararı: "Doğrulanmış" rozeti ada kefildir). Form yalnız DEĞİŞEN
  alanı gönderir; Kaydet kirli değilse pasif, Vazgeç, beforeunload. Sözleşme
  `company-profile-section.test`; API `company-profile.spec` "FİRMA ADI".
  Tuzak: test factory VERIFIED doğurur → "alakasız alan" olarak `name` KULLANMA.
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
Onboarding son adımında iki kutu (satın alma / satış koltuğu).

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
| `/company/satinalma/urunler/<firma>/<ürün>` | ürün detayı |
| `/company/satinalma/tedarikcilerim` | YALNIZ ilişki yönetimi |
| `/company/satis` | açık talepler TAM listesi (kenar süzgeçli, `SellerTendersView embedded`) |
| `/company/sirketim/*` | Genel Bakış · Profil · Ziyaret Edenler · Raporlar |

Adres tek kaynağı `lib/company/panel-market.ts`.

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
  sayfalama nötr seçili durum.
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

### Herkese açık anasayfa = panel anasayfalarının anonim hâli
Ziyaretçi `AudienceSwitch` ile tarafını seçer; sayfa o portalın panel
anasayfasını o portalın rengiyle gösterir (alıcı mavi, tedarikçi yeşil).
**PANEL DOSYALARINA DOKUNULMADI** — `PanelHeroSearch` ve `CategoryShowcaseRows`
prop'la sürülüyor. Monokrom kuralı **yalnız `/` için** delindi; diğer public
sayfalar siyah kalır.

**Anonimde karşılığı olmayan uydurulmaz, çizilmez:** AI ile ara (Silver+ ∧
koltuk), "size uygun ürünler" (firmanın alım kategorileri gerekiyor →
"Öne çıkan ürünler"), `SellerTendersView` (→ **satır listesi**
`ListingTeaserRow`: panelin `BrowseTenderRow`uyla aynı `ListingCard row`,
görselsiz, alt alta — 2026-09-10 kullanıcı kararı; teaser ızgarası
anasayfadan kalktı, `ListingTeaserCard` dizin/detayda duruyor), KPI'lar.

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
  (`listingSeoReadiness`), yayın/taslak. Profil yoksa 3 soruluk kurulum kartı. **Aynı form modeli ve doğrulama** (`tenderFormSchema`)
  ve **aynı gövde** (`lib/tenders/map-to-input.ts` — sihirbazdan buraya
  taşındı, TEK KAYNAK); yeni backend akışı YOK. Yayın sonrası panel:
  tedarikçi önerisi (AI) + talep bağlantısı. Taslak `sessionStorage`
  (`quick-draft.ts`); "Detaylı ayarlar" sihirbaza `QUICK_TO_WIZARD_KEY` ile taşır.
- **Detaylı sihirbaz `taleplerim/yeni/detayli`** (kopya `?from=`, AI belge
  `?ai=1`, şablon `?template=` buraya yönlenir): **4 adım** (Kapsam anahtarı
  Kalemler adımının üstünde; `WIZARD_STEP_FIELDS` adım→alan eşlemesi),
  isteğe bağlı bölümler `OptionalSection` (`<details>`, hata varsa açık):
  kurallar, hüküm+dokümanlar, açılış tarihi; kapanışta 3·7·14 çipleri.
  `Step4Review.onEditStep` indeksleri 0|1|2.

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
  zorunlu. Web durum sözlüğü `lib/company/product-status.ts`
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
- **Toplu ekleme: İKİ kaynak, TEK yazma yolu.** Excel/CSV şablonu (AI'sız, her
  paket) ve katalog PDF/foto (`ai/product-extract`, Silver+) AYNI
  `ProductImportResult` üretir ve AYNI `import/commit` ucundan geçer.
  Model yalnız SATIRLARI üretir; **kategori KODU yazamaz** (`categoryHint` →
  backend katalogda arar; bulunamazsa boş + uyarı). Kod VARLIĞI doğrulanır
  (biçim yetmez), yoksa yazma yolunda null'lanır.
- **⛔ WEB SİTESİNDEN ÜRÜN ÇEKME — bilinçli olarak YAPILMAYACAK** (kullanıcı
  kararı): sahiplik doğrulanamaz (rakip URL'i → biz yayıncı oluruz), uydurulan
  fiyat/MOQ ticari beyandır, canlı site prompt-injection yüzeyidir. YERİNE
  kullanıcının YÜKLEDİĞİ katalog. (`common/website-import.ts` bundan
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

- Son migration `20260909160000_product_review_status` (ürün moderasyonu;
  additive: enum + 5 kolon + backfill APPROVED for isPublic).
- Şema değişikliği: `migrate` (dev) → `migrate:deploy` (prod). Manuel SQL için
  `prisma/migrations/<timestamp>_<ad>/migration.sql`. **Her yeni migration'dan
  ÖNCE `docs/migration-safety.md` kontrol listesini oku.**
- **API'ye parametre ekleyen değişiklikte API ÖNCE push** (`forbidNonWhitelisted`
  → eski API yeni parametreye 400 döner).
- NOT: web-dev ve prod API **AYNI Supabase DB'yi** kullanıyor.
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
- **Rig stub gotcha (denetimde 8 kez tekrarladı):** yaygın enjekte edilen bir
  servise YENİ bağımlılık eklendiğinde elle kurulan test rig'leri kırılır —
  (a) eksik stub → `x is not a function`, (b) **constructor SIRASI kayması** →
  yanlış nesne enjekte olur, hata yalnız o bağımlılığa ULAŞAN testte çıkar.
  Böyle bir değişiklikten sonra **TAM api suite'i** koşulmalı.
- **`useHeroGone`:** panel kabuğu sayfadan ÖNCE mount olur → sentinel'i
  4 sn `MutationObserver` ile bekler; `usePathname` YALNIZ efekt bağımlılığı.
- **`Badge` tabanı `shrink-0` taşır** — daralması gereken rozete `shrink` ver.
- **`@rothern/email` değişince** `pnpm --filter @rothern/email build` şart.
- **Görseller `cdn.rothern.com`'dan servis edilir**, `pub-*.r2.dev` DEĞİL
  (o bucket'ın Public Development URL ayarı kapalı — coğrafi engel değil).
  Taşıma scripti `scripts/migrate-public-images.ts` (2026-09-05'te koşuldu,
  DB'de artık `r2.dev` adresi yok).
- Demo doluluk: `pnpm --filter @rothern/db seed-marketplace-demo` (idempotent
  ama SİLMEZ; kaldırma `cleanup-marketplace-demo`). dev=prod DB → canlıda da görünür.

## Test & Kalite

- API **152 suite / 1371 test** · web **57 / 354** · admin **15 / 79** — yeşil (2026-09-01).
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

## Güvenlik Durumu

✅ Auth/IDOR/RBAC E2E · httpOnly cookie + CSRF · CSP nonce tabanlı
(`strict-dynamic`, **`force-dynamic` ZORUNLU** — statik prerender nonce alamaz)
· Pino redact + Sentry (kritik-audit ve webhook imza hataları `reportToSentry()`)
· `resolveClientIp` (`TRUST_CF_CONNECTING_IP=true` prod) · admin `tokenVersion`
+ şifreli TOTP sırrı · Supabase Auth 429/5xx → 503.

⏳ Bekleyen: alert webhook, audit_logs populate, log drain, frontend Sentry.
⚠️ `SENTRY_DSN` boşsa error tracking ve alarmlar tümüyle pasif (tek fail-open
servis); Supabase/R2/Resend env'leri eksikse app boot ETMEZ (fail-closed).
⚠️ RLS 23 tabloda kurulu ama **prod'da KAPALI** — aktivasyon EN SON.

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

**Ürün**
- STANDART → paketli upgrade akışı + ödeme (**PayTR**; iyzico reddetti, Stripe
  TR şirketi kabul etmiyor) + escrow
- Kazandırma geri alma (un-award) — riskli, sonraya
- WebSocket real-time bildirim
- Admin: impersonate (güvenlik değerlendirilecek), iade/refund, CSV export,
  dahili not, global arama
- i18n (UI hâlâ Türkçe; next-intl greenfield, ayrı büyük iş)

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
Repo `git@github.com:ugur-062/rothern.git` · branch `main`.
Her özellikten sonra commit + push (commit'i bekletme).
