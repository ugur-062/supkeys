# Rothern — Bağlam Dosyası

## Proje
**Rothern**, AI destekli e-procurement (e-satınalma) SaaS platformu. PratisPro/SAP Ariba tarzı B2B; alıcılar için RFQ/teklif toplama/açık eksiltme/kazandırma/sipariş, tedarikçiler için davet kabul/teklif verme. V1 hedefi: 3 ay içinde RFQ flow'u tamamlanmış, üretime hazır iskelet.

## Marka
Mavi & beyaz · Inter (UI) + Plus Jakarta Sans (display) · "S" mavi kutu + lacivert/mavi dual-tone · AI agent katmanı ileride aktif olacak.

## Tech Stack
- Monorepo: pnpm 10 + Turborepo
- Backend: NestJS 10 + Prisma 6 + Supabase (Postgres + Auth) + kendi JWT'miz
- Frontend: Next.js 15 (App Router) + React 19 + Tailwind v4 (`@theme` CSS) + Zustand persist + TanStack Query + react-hook-form + zod + sonner + lucide
- E-posta: React Email + Resend (synchronous, BullMQ kaldırıldı 2026-05-20)
- Cron: NestJS Schedule (in-process, Redis yok)
- Storage: Cloudflare R2 (S3-compatible AWS SDK v3)
- **Docker yok**: Tüm yan servisler managed (Supabase/Resend/R2). Lokal dev `pnpm dev` yeterli.
- Node 22, pnpm 10.33

## Repo Yapısı
```
apps/api      NestJS         port 4000  api.rothern.com
apps/web      Next.js        port 3000  www.rothern.com  (tenant + supplier rotaları)
apps/admin    Next.js        port 3001  admin.rothern.com
packages/db       @rothern/db        Prisma schema + migrations + seed + scripts
packages/shared   @rothern/shared    Zod + types + helpers (slug, short-code, tender-number)
packages/email    @rothern/email     React Email templates + Resend provider
```

## Test Hesapları (Dev)

> ⚠️ **Güvenlik notu:** Aşağıdaki parolalar **sadece lokal dev** içindir. Repo public olursa bu blok kaldırılmalı veya `CLAUDE.md.local` (gitignore'lı) varyantına taşınmalı.

| Tip | URL | E-posta | Şifre |
|-----|-----|---------|-------|
| Firma (birleşik alıcı+satıcı) | localhost:3000/company/login | firma@demo.com / firma2@demo.com / firma3@demo.com | `CLAUDE.md.local`'da |
| Admin | localhost:3001/admin/login | admin@rothern.com | `CLAUDE.md.local`'da |

> ⚠️ **Parolalar buradan KALDIRILDI (2026-09-01).** Gerekçe: dev ve prod AYNI
> veritabanını kullanıyor, dolayısıyla bu "dev" hesapları CANLI hesaplar.
> `admin@rothern.com` canlıda aktif SUPER_ADMIN'di, 2FA'sı kapalıydı ve
> parolası bu dosyada yazılıydı — denetimde bulunan en kolay sömürülebilir
> maddeydi. Parolalar artık gitignore'lı `CLAUDE.md.local` dosyasında
> tutulmalı; buraya GERİ YAZILMAMALI.

(Eski "tenant/supplier" ayrı hesapları kaldırıldı — tek Company hesabı iki portal: `/company/satinalma` + `/company/satis`.)

E-postalar Resend `onboarding@resend.dev` test domain'inden gerçekten gönderilir — kullanıcı kayıtlı gerçek bir adres olmalı (test için kendi adresini kullan).

## Servis Başlatma
```bash
pnpm dev   # turbo, hepsi paralel
# veya tek tek:
pnpm --filter @rothern/api dev
pnpm --filter @rothern/web dev
pnpm --filter @rothern/admin dev
```
Yan servis yok — Supabase Postgres, Supabase Auth, Cloudflare R2, Resend hepsi managed.

## Önemli Mimari Kararlar

1. **2 auth realm'i:** Company (`apps/web /company/*` — TEK firma hesabı hem alıcı hem satıcı, iki portal `satinalma`/`satis`; rol/izin/tier kapıları) + Admin (`apps/admin`). JWT payload `type: "company" | "admin"`; cookie realm'leri `rk_company`/`rk_admin` (+ `rk_csrf`/`rk_admin_csrf`). Her realm'in kendi store'u + axios instance + 401 interceptor'ı.
2. **Multi-tenant veri izolasyonu:** Tüm sorgular tenantId scope'unda, servis seviyesinde filtrelenir.
3. **Firma self-signup VAR (3 aşama):** signup → e-posta doğrulama (6 haneli kod, hesap-bazlı 5/saat üretim tavanı) → onboarding (yalnız Kurucu) → panel içi kapılar (KYC/doğrulama belgeleri admin onayı; satın alma talebi açma Silver+, satış teklifi Bronz+ — bkz. Faz T/Y). Davetle katılım (firma-kullanıcı daveti + referral/dış davet) ayrıca var.
4. **Bağlantı modeli:** firmalar arası bağlantı (invite/accept, blok), ilan görünürlüğü PUBLIC/CONNECTIONS/PRIVATE — tek kaynak `listing-visibility.ts`.
5. **Kapalı zarf:** Teklifçiler birbirinin tekliflerini ASLA göremez; ilan sahibi her zaman görür. `GET /company/listings/:id` non-owner dalı `invitations`/`bids`/`bidStats` içermez; yalnız `myInvitation` + `myBid` (+ pazarlıkta ayarlı `auctionView`). Sözleşme testleri: closed-envelope/visibility-matrix spec'leri.
6. **SUBMITTED bid editlenmez VE geri çekilemez** (Geri Çek kaldırıldı). Tek değişiklik yolu: alıcıyla iletişim → alıcı eleme yapar LOST → tedarikçi yeniden teklif verebilir (version++). WITHDRAWN yalnız legacy kayıtlarda.
7. **Kazandırma kalıcı:** Toplu (tek tedarikçi, tüm kalemler) veya Kalem Bazlı (her kalem ayrı tedarikçi). Finalize edilince Tender → AWARDED + Order'lar (`ORD-YYYY-NNNN`). Şu an geri alma YOK (bekleyen).
8. **Ana akış RFQ:** İngiliz Usulü açık eksiltme tipi kurulu ama ikincil/ayrı akış.
9. **Body parser 5MB** (Y-3 ile 25→5MB düşürüldü); belgeler R2 presigned URL ile yüklenir (base64 gövde yalnız küçük içe-aktarma dosyaları).
10. **Audit log append-only**, AI agent event-bus altyapısı ileride (Kafka/RabbitMQ).
11. **Siparişte belge yükleme YOK (2026-08-22):** Platform muhasebe/belge arşivi değil — teminat/irsaliye/dekont/fatura/LC belgeleri firmaların kendi kanallarında yaşar (`company_order_documents` tablosu + `CompanyDocType` enum DROP edildi). Kalan: ödeme bildir/onayla/reddet (alındı-alınmadı), IBAN snapshot (accept'te banka hesabı zorunlu), LC adım damgaları BEYAN olarak (belge kapısı yok), `requireGuaranteeLetter` bayrağı yalnız BİLGİ (onay kapısı yok). İlan/teklif belgeleri ayrı modüller, aynen duruyor.

## Ürün Dili — "ihale" DEĞİL "satın alma talebi" (2026-09-01)

Kullanıcının gördüğü hiçbir yerde **"ihale" geçmez**. Yeniden adlandırma
yapıldı (623+ dize, 4 rota, 308 yönlendirmelerle).

**İki portal, İKİ ayrı sözcük** — bu ayrım kritik, tek kelimeye indirgenemez:

| Bağlam | Ne demek | Sözcük |
|--------|----------|--------|
| Satınalma | Firmanın KENDİ satın alma talepleri | **talep** ("Taleplerim") |
| Satış — teklif verilecekler | BAŞKA firmaların talepleri | **talep** ("Açık Talepler") |
| Satış — kendi sattıkları | Firma satıyor | **ürün** ("Ürünlerim" — vitrin; "satış ilanı" KALDIRILDI, bkz. aşağı) |

Satış tarafına "satın alma talebi" demek TERSTİR (orada firma satıyor).
Tek kaynak: `apps/web/src/lib/company/portals.ts` `MODULE_LABELS` —
gerekçe orada yorumda.

**Türkçe not:** `talep` son sesi yumuşar (talep → **talebi**, talebe,
talebin). Yeni metin yazarken "talepi/talepe" yazma. Çoğul: talepler →
**taleplerini**, taleplerinde.

**Henüz DEĞİŞMEYEN (bilinçli, kullanıcı görmez):**
- Kod adları: `IhaleListView`, `ihaleler-view.tsx`, `components/ihale/`,
  `isIhale`, `satinalma-ihale-tab`
- Kod yorumları
- `docs/audit-*.md` denetim raporları — **TARİHSEL KAYIT**: o tarihteki kodu
  ve o günkü dizeleri anlatırlar; bugünkü sözcükle yeniden yazmak raporu
  gerçeğe aykırı hâle getirir (okuyucu git geçmişinde başka bir şey bulur).

Rota değişimi (eskiler `next.config.ts` `redirects()` ile 308 yönlenir —
gönderilmiş e-postalardaki CTA'lar kırılmasın diye; o e-postalar geri
alınamaz):

| Eski | Yeni |
|------|------|
| `/company/satinalma/ihalelerim` | `/company/satinalma/taleplerim` |
| `/company/satis/acik-ihaleler` | `/company/satis/acik-talepler` |
| `/company/satinalma/sablonlar/ihale` | `.../sablonlar/talep` |
| `/company/satis/sablonlar/ihale` | (kaldırıldı — satış ilanı şablonu yok) |

`/company/ilan/[id]` DEĞİŞMEDİ — "ilan" nötr terim (talep kaydının detay
sayfası; rota adı tarihsel).

## Satış ilanı KALDIRILDI (2026-09-04, kullanıcı kararı)

`ListingType.SATIS` (forward açık artırma, taban/hemen-al fiyat, "Satış
İlanlarım", `/satilik`, `/ilan/<slug>`, Satın Al sayfası, satış raporları,
satış ilanı şablonu, Hemen Al) sistemden **TAMAMEN** çıkarıldı; mevcut 11
kayıt migration ile silindi (`20260904200000_remove_satis_listings`).
Gerekçe: "böyle bir özellik olmayacak" — firma ne sattığını **ürün
vitriniyle** (Ürünlerim) gösterir, alıcı **satın alma talebi** açar; tek yön.

Kalıcı hâl:
- Şema: `enum ListingType { ALIM }` (tek değerli, `type` kolonu ve `type:
  "ALIM"` süzgeçleri aynen çalışsın diye kaldı); `Listing.priceScope/
  minPrice/buyNowPrice`, `ListingItem.minUnitPrice/buyNowUnitPrice`,
  `ListingBid.isBuyNow`, `enum ListingPriceScope` DROP. `ListingBid.
  deliveryAddressId` LEGACY (yeni teklif yazmaz). `ApprovalFlow.listingType`
  yalnız ALIM/null.
- API: `POST listings/:id/buy-now`, `GET dashboard/satis` yok; `tenders`/
  `seller-tenders`/`discover-facets`/raporlar `type` almaz; `PlaceBidDto.
  deliveryAddressId` ve `BuyNowDto` yok; AI araçları `type` almaz;
  `itemImportColumnsFor()` tek sütun kümesi.
- Web: `/satilik` → `/urunler`, `/ilan/*` → `/urunler` (308); satış portalı
  menüsünde Açık Talepler · Tekliflerim · Ürünlerim · Satışlarım · Bilgi
  Talepleri · Müşterilerim · Profilim; satınalma menüsünde "Satın Al" ve
  "Tekliflerim" yok. `entityLabels()` tek sözlük (ALIM). Satınalma keşif
  şeridi yalnız ürün gösterir.
- `SATISCI` rolü, `sell:*` izinleri ve `/company/satis` portalı DURUYOR —
  satış portalı başkalarının taleplerine teklif verme + ürün vitrini.

## Kayıt Ülkeleri — SEKİZ ülke (2026-09-01)

Yeni kayıt yalnız şu ülkelerden alınır. Tek kaynak: `@rothern/shared`
`data/country-profiles.ts`. Gerekçe: `docs/plan-country-registration.md`.

| Kod | Ülke | Not |
|-----|------|-----|
| TR | Türkiye | 6 belge (mevcut akış) |
| **XN** | KKTC | **ISO 3166-1'de KODU YOK** — kullanıcıya ayrılmış X-aralığı. Dış sistemlere GÖNDERİLMEMELİ |
| RU | Rusya | ortak yabancı temeli (ülkeye özel ek kural YOK) |
| AZ · KZ · UZ | Azerbaycan, Kazakistan, Özbekistan | ortak yabancı temeli |
| CN | Çin | 营业执照 TEK belgede sicil+vergi+temsilci → vergi belgesi İSTENMEZ |
| AE | BAE | Trade License zorunlu; TRN yalnız KDV mükellefinde → vergi belgesi zorunlu DEĞİL |

**AB ve Afrika bilinçli KAPALI.** AB'yi ertelemenin maliyeti yok: VIES 27
ülkede aynı doğrulamayı yapar ve **VIES zaten yazılmış durumda** — açmak
profil eklemekten ibaret. Afrika'da tersi: ortak doğrulama altyapısı yok,
54 ayrı sicil; toptan değil talep geldikçe eklenir.

**Doğrulama ülkeden BAĞIMSIZ ve İSTİSNASIZ manueldir.** Bir ara Rusya'ya
"zorunlu ek inceleme" bayrağı konmuştu; KALDIRILDI çünkü `VERIFIED` zaten
yalnız admin tarafından `setVerification` ile yazılıyor ve **otomatik onay
yolu hiç yok** — bayrak "bir şey yapıyormuş" izlenimi veren ölü bir kavramdı.

**KAYIT için admin onayı GEREKMEZ.** Hesap onboarding biter bitmez çalışır.

**KYC kapısının yeri (2026-09-01 revizyonu) — prensip: doğrulama, PLATFORMUN
KEFİL OLDUĞU yerde istenir.**

| Aksiyon | VERIFIED şart mı |
|---------|------------------|
| Gezinme · bağlantı · mesaj · TASLAK | ❌ |
| **Davetli/bağlantılı** talebe teklif | ❌ — alıcı firmayı zaten tanıyor, riski bilerek alıyor |
| PUBLIC talebe **tanımadan** teklif | ✅ — oraya sokan platform (ayrıca BRONZ+ ister) |
| Talep yayınlama · kazandırma | ✅ (ayrıca SILVER+ ister) |
| **Paket satın alma** | ✅ — asıl kapı burası (+2FA +web sitesi) |
| Sipariş kabulü | ❌ bugün — platform parayı TAŞIMIYOR (bildir/onayla). **Escrow gelirse kapı buraya taşınmalı** |

Eski hâli HER teklifte belge istiyordu ve en kötü anda çarpıyordu: tedarikçi
40 kalemi fiyatlıyor, "Gönder"de 403 alıyor, elle inceleme günler sürüyor,
talep kapanıyor. Kaybeden yalnız tedarikçi değil — alıcı da davet ettiği
firmadan teklif alamıyor.

Davetli/bağlantılı firma belgesiz teklif verebildiği için alıcı, teklif
sütununda **"Doğrulanmamış firma"** ibaresini görür — kazandırmadan önce
bilerek karar versin diye. Sözleşme: `kyc-bid-gate.spec.ts`.

**Kapı YALNIZ YENİ KAYDA uygulanır.** `COUNTRIES` (98) kısaltılmadı: mevcut
firmaların ülkesi gösterilebilmeli ve adres defterinde her ülke seçilebilmeli
(teslimat adresi kayıt kapısına tabi değil). Kapatılan bir ülkedeki çalışan
hesap ASLA kilitlenmemeli.

## Konvansiyonlar
- Form validation: react-hook-form + zod (frontend), class-validator (backend DTO)
- Hata mesajları Türkçe (kullanıcı yüzü)
- `<Field error={...} hint={...}>` ile sarmalama
- Button variants: primary | secondary | ghost · sizes: sm | md | lg
- Toast: sonner top-right, richColors
- `<RequireAuth>` / `<RequireAdminAuth>` / `<RequireSupplierAuth>` boundary
- Component yolu: `@/components/{ui,brand,providers,dashboard,tenders,orders}/*`
- **Değerlendirmeler firma bazında gruplu (2026-08-22):** `ReviewSummary` (shared) — genel puan = ortak ortalamalarının ortalaması (her firma bir oy); her ortak tek satır; ad yalnız `CompanyReview.showName` opt-in + platform içi (`revealNames`), herkese açık `/firma/[slug]`'da ASLA ("Doğrulanmış alıcı/tedarikçi"). Tek yardımcı `company-reviews/review-summary.ts` (public-profile + connections + reviews/company aynı). Değerlendirme kartında "Firma adım referans olarak görünsün" kutusu (varsayılan kapalı).
- **Profilim = yerinde düzenleme (2026-08-22):** `ProfileEditor` + `CompanyProfileView` `edit` slotları (public görünümle tek düzen); görseller `lib/image-resize` ile tarayıcıda küçültülür; logo/kapak/galeri anahtarları her yüklemede benzersiz (R2 object-lock 409 + önbellek). Görsellerin `pub-*.r2.dev` yerine `cdn.rothern.com`'dan servis edilmesi için `scripts/migrate-public-images.ts`. **DÜZELTME 2026-09-03:** r2.dev'in yanıtsız kalması coğrafi engel DEĞİL — o bucket'ın Public Development URL ayarı KAPALI (Cloudflare panelinde doğrulandı). Kalıcı çözüm yine custom domain.
- API çağrıları: `useMutation` / `useQuery` (TanStack Query) + axios instance
- **Auth = httpOnly cookie oturum** (token JS'ten OKUNMAZ; XSS'e kapalı). Zustand persist YALNIZ UI snapshot'ı tutar (`user`/`company`), token DEĞİL — persist key'leri `rothern-company-auth` (web) + `rothern-admin-auth` (admin); remember→localStorage, aksi→sessionStorage. Kimlik `/me` ile doğrulanır. Mutating isteklerde CSRF double-submit (`rk_csrf`/`rk_admin_csrf` → `X-CSRF-Token`). **Kayan oturum:** AuthCookieInterceptor her istekte token ömrünün yarısı geçtiyse taze token basar (CSRF değeri korunur) — aktif kullanıcı düşmez, `JWT_EXPIRES_IN` (prod: 7d olmalı) kadar inaktif kalan düşer; "Oturumumu açık bırak" `persistent` claim'iyle taşınır.

## Tek Kaynaklar (single source) — dokunmadan önce buraya bak

Denetim boyunca en sık tekrar eden hata: **helper yazılıyor, çağrı yerlerinin
bir kısmı bağlanmıyor** ve iki hesap sessizce ayrışıyor. Yeni bir hesap/kural
yazmadan önce burada karşılığı var mı diye bak.

| Konu | Tek kaynak |
|------|-----------|
| Para/kur bazı (rapor+pano) | `common/company/report-currency.ts` |
| Kalem toplamı / yuvarlama | `common/company/bid-items.ts` (`roundMoney`, `sumLineTotals*`) |
| Ödeme durumu | `common/company/order-payments.ts` |
| Efektif paket (INV-TIER-1) | `common/company/effective-tier.ts` (`effectiveTier`, `tierAtLeastWhere`, `anyPackageWhere`) |
| İlan görünürlüğü | `common/company/listing-visibility.ts` |
| Pazar yeri sözcükleri/rotaları (web) | `lib/public/marketplace.ts` |
| Pazar yeri yayın anahtarı (web) | `lib/public/marketplace-live.ts` |
| Ürün skoru + yayın kapısı | `@rothern/shared` `helpers/product-completion.ts` (API'de ince re-export `common/company/product-completion.ts`; web formu AYNI kuralları canlı çalıştırır) |
| Kategori nitelik çözümleyici | `common/company/category-attributes.ts` |
| Model kategori ipucu → kod (AI) | `modules/ai/category-hint-resolver.ts` (ürün çıkarımı + AI arama) |
| Kategori ata zinciri | `@rothern/shared` `helpers/category-code.ts` |
| Public görsel yükleme | `common/company/public-image-upload.ts` |
| Public profil + ürün kapısı | `common/company/public-profile-gate.ts` (`hasPublicProfile`, `publicProductWhere`) |
| Bağlantı geçerliliği | `common/company/valid-connection.ts` |
| Faz O dar-bağlam | `common/company/full-read-context.ts` |
| Kimlik yolunda Company select | `common/company/auth-company-select.ts` |
| Teslim SÜRESİ → tarih | `common/company/delivery-time.ts` |
| Web derin bağlantıları (CTA) | `common/company/app-routes.ts` |
| Gövde string trim'i (DTO) | `common/decorators/trim.decorator.ts` |
| IBAN (TR + yabancı mod-97) | `@rothern/shared` `ibanChecksumOk` / `isValidIbanTr` |
| İçe aktarma sütun/limit | `@rothern/shared` `item-import.ts` / `bid-import.ts` |
| Para birimi sembolü (web) | `lib/tenders/labels.ts` (`CURRENCY_SYMBOL`, `CURRENCIES`, `currencySymbol`) |
| Tarih biçimi (web) | `lib/format-date.ts` |
| Para gösterimi (web) | `components/ui/money.tsx` |
| Query anahtarları (web) | `NOTIFICATION_KEY`, `MESSAGE_KEYS` (hook'lardan export) |
| Ölçü birimleri | `@rothern/shared` `constants/units.ts` |
| Kayıt ülkesi / belge kümesi | `@rothern/shared` `data/country-profiles.ts` |
| Faaliyet tipi etiket/tavan | `@rothern/shared` `constants/company-activities.ts` |
| Arama katlama + tokenleme | `@rothern/shared` `helpers/search-fold.ts` |
| Ürün içe aktarma sütunları | `@rothern/shared` `constants/product-import.ts` |
| Yüklenen tablo dosyası okuma | `common/files/spreadsheet-reader.ts` |

## Kategori Kataloğu (2026-09-02 — Ariba, BİREBİR)

**4 seviye** (Segment/Family/Class/Commodity), `Category.id = 8 haneli kod`.
Hiyerarşi koddan türer, `parentId` = üst kod.

### İKİ KATALOG, İKİ KULLANIM YERİ

Ariba'nın iki dışa aktarımı var ve **iki ayrı yerde** kullanılıyorlar:

| Nerede | Katalog | Kaynak CSV |
|--------|---------|-----------|
| **Talep ve ilan** kategorisi | Discovery alt kümesi (158.005) | `ariba-discovery-tum-kategoriler-hiyerarsik.csv` |
| **Firma** kategori seçimi ("hangi alandasınız") | Tam katalog (158.018) | `ariba-tum-kategoriler-hiyerarsik.csv` |

**Ölçülen fark YALNIZ L4 yaprakta.** L1 (58 segment), L2 (558 aile) ve L3
(7.966 sınıf) iki dosyada kod ve ad olarak birebir aynı. Fark tam olarak:
- **13 yaprak yalnız tam katalogda** (Plastik Kasalar, Nakış Hizmetleri,
  Marka/Logo Tasarım Hizmetleri, 3 ulaşım rezervasyonu…) — firma beyan
  edebilir, kimse o kodla talep açamaz.
- **31 kodda ikinci bir ad** var (aşağı bak).

Bu yüzden **ayrı tablo/ayrı ağaç YOK**: tek katalog, kod başına tek satır +
`Category.inDiscovery` bayrağı.

### KAYNAK BİREBİR, GÖSTERİM TÜRKÇE (2026-09-02)

Ariba'nın Türkçe dışa aktarımında kategorilerin bir bölümü İngilizce kalmıştı.
Kaynak dosya (`ariba-categories.tsv`) hâlâ **birebir**: kısaltma,
tekilleştirme, gizleme YOK; `import-ariba-csv.ts` yalnız kodu 8 haneye
sıfır-doldurur ve üst kodu aynı koddan türetir.

Türkçeleştirme kaynağın ÜSTÜNE binen ayrı bir katmandır
(`category-translations.curated.tsv`, `<kod> ⇥ <TR ad> ⇥ <kaynak ad>`).
Üçüncü sütun **kaynağın o anki hâlini** taşır: Ariba yeni bir dışa aktarım
gönderdiğinde satırlar diff'lenebilir, körlemesine ezilmez.

**Aynı katman kaynak KUSURLARINI da düzeltir (2026-09-02 denetimi).** Ariba'nın
Türkçe dışa aktarımında yanlış element sembolleri (`Kadmiyum Ca`), yazım
hataları (`Eletrikli`, `Elektronim`, `hzimetleri`), bir yanlış ad (`irmak` →
`Çıkrık`) ve **farklı dallarda çakışan 36 ad** vardı (`Aynalar` hem optik ayna
hem torna aynası; `Yataklar` hem rulman hem mobilya). Çakışan adlar
eşleştirmeyi sessizce böldüğü için en tehlikelisiydi. Tam liste + her
düzeltmenin dayanağı: **`docs/category-source-defects.md`**.

> Kaynak TSV'ye YAZILMAZ: `import-ariba-csv.ts` onu her koşumda CSV'lerden
> yeniden üretir, oraya yazılan düzeltme ilk içe aktarmada sessizce kaybolur.
> Düzeltme overlay'de durur, 3. sütun kusurlu hâli sakladığı için denetlenebilir.

**Kapsam — kullanıcının SEÇTİĞİ her katman %100 Türkçe:**

| Katman | Sayı | Durum |
|--------|------|-------|
| L1 segment | 58 | tamamı Türkçe |
| L2 aile | 558 | tamamı Türkçe |
| L3 sınıf | 7.966 | tamamı Türkçe |
| L4 çekirdek yaprak | 15.231 | tamamı Türkçe |
| L4 kalan yaprak | 134.205 | kaynak dilinde — **bilinçli kapsam dışı** |

Kalan 134k yaprak ağacın en alt ucudur; oraya inen kullanıcı zaten Türkçe bir
L3 sınıfın altındadır ve arama `keywords` üzerinden İngilizce özgün adı da
bulur. Gerekirse aynı boru hattıyla (aşağıdaki kural motorları) genişletilir.

**Kural motorları:** tekrar eden kalıplar elle değil üretilerek çevrildi —
gıda (segment 50, ~215 ürün adı × 8 ön ek → 1.728 satır), ilaç (segment 51,
sınıf ön eki + ~290 kimyasal aile → 506 satır), canlı bitki (segment 10,
3 ön ek × ~180 botanik ad → 487 satır), sağlık (segment 85, 479 anatomi
başlığı + yaklaşım kuyruğu → 1.357 satır). Sözlük tek yerde durur; kalıp
değişirse tek satır düzeltilir.

> ⚠️ `cleanup-categories` bu akışın **PARÇASI DEĞİL**. Koşarsa segment gizler
> ve ad değiştirir — birebir garantisini bozar. Eski (22.106'lık) kataloğa göre
> yazılmış HIDE/RENAME listeleri hâlâ içinde.
>
> `gen-category-leaves` **SİLİNDİ** (AI-üretilmiş yaprak üretiyordu).

### Çakışan kodlar — 31 kod, kaynak verinin defekti

`tum` dosyasında 31 kod İKİ farklı ad taşıyor ve bunlar **çeviri değil**: Ariba
TR zaten dolu bir UNSPSC koduna özel kategori yazmış.

| Kod | discovery | tum'daki ikinci ad |
|-----|-----------|--------------------|
| `53131639` | Urinary incontinence pad | Dil temizleyici |
| `56131604` | Paint color center component | Alışveriş Sepetleri |
| `43211723` | Electronic voting equipment | Tepme yakalayıcı |

`Category.id = kod` tekil olduğu için biri düşmek ZORUNDA.
**Kural: ortak kodlarda DISCOVERY'nin adı kazanır.**

Gerekçe: kazanan ad **iki katalogda da AYNI** olmalı. Aksi hâlde alıcı
"Urinary incontinence pad" talebi açar, tedarikçi "Dil temizleyici" beyan eder
— aynı kod, dolayısıyla eşleştirme alakasız iki ürünü sessizce çiftler.

Düşen ad kaybolmuyor: `keywords`'e yazılır, `searchText`'e katlanır → **arama
onu yine bulur**, yalnız etiket olarak görünmez. Tam liste:
`docs/category-duplicate-codes.md` (üretilir, elle düzenlenmez).

### Kapı BACKEND'de — istemciye güvenilmez

| Yer | Kural |
|-----|-------|
| `company-listings.service.ts` `validateListingBusinessRules` | `level ≥ 3` **∧ `inDiscovery: true`** |
| `common/helpers/category-selection.helper.ts` | süzgeç YOK — tam katalog |

`catalog` query parametresi (`/categories/children`, `/categories/search-tree`)
yalnız hangi ağacın GÖSTERİLECEĞİNİ seçer. İstemci onu göndermese ya da elle
discovery dışı kod yollasa da talep/ilan o kodu **taşıyamaz**. Tek kaynak:
`@rothern/shared` `constants/category-catalog.ts`
(`parseCategoryCatalog`, `categoryCatalogWhere`). Sözleşme:
`category-catalog.spec.ts`.

`/categories/all` (L1-L2) ve `/categories/segments` (L1) **katalog almaz** —
o katmanlar iki dışa aktarımda birebir aynı; parametre eklemek aynı baytlar
için iki önbellek girdisi üretirdi. `/categories/by-ids` de süzmez: kayıtlı bir
kod her hâlükârda çözülebilmeli.

### Kaynak dosyalar (`packages/db/src/seeds/`)

| Dosya | Ne | Kim yazar |
|-------|-----|-----------|
| `ariba-categories.tsv` | 158.018 kategori, 7 sütun (6.'sı `inDiscovery`, 7.'si düşen alt adlar) | `import-ariba-csv.ts` |
| `category-translations.curated.tsv` | 18.627 satır TR ad + kaynak ad (kaynak kusur düzeltmeleri dahil) | İNSAN (kalıplarda kural motoru) |
| `category-keywords.tsv` | elle küratörlü eşanlamlı | İNSAN — **üretilen dosyayı EZER** |
| `category-keywords.generated.tsv` | TR jargon | `gen-category-keywords.ts` |

**Öncelik kuralı:** `apply-category-keywords` ve `seed-categories` ikisi de
üretilen dosyayı ÖNCE, elle yazılanı SONRA okur → aynı kodda insan kararı
kazanır. Sözlük kataloğu **genişletemez**, yalnız aramayı besler; Ariba'da
karşılığı olmayan kodlar sessizce düşer.

### Ad TEKİLLİĞİ — çeviri katmanının EN TEHLİKELİ hatası
Aynı ad iki düğümde olursa alıcı birini, satıcı diğerini seçer ve eşleşme
sessizce bölünür. Ariba kataloğunun KENDİ içindeki tekrarlar bilinçli duruyor —
standart veriyi yeniden adlandırmak "birebir" kuralını bozardı.

Çeviri bunu **yenisini üreterek** bozabilir: iki farklı İngilizce ad aynı
Türkçe karşılığa düşerse (ör. `Live carnations` ve `Live dianthuses` ikisi de
"Canlı karanfiller"). `check-category-translations.ts` her turda bunu arar ve
çakışma bulursa **exit 1** verir — uygulama adımı çalışmaz. Bu tur 12 gerçek
çakışma yakalandı ve ayrıştırıldı (mantar/mantar palamudu, karanfil/diyantus,
boru hattı kaplama/sarma, ulusal banknot…).

Kaynakta ZATEN aynı adı taşıyan kodlar (`Eyes` / `Eyes`) çevrildiğinde yine
aynı ada düşer; bunu çeviri üretmedi, denetleyici bu grupları ayıklar.

### "İngilizce mi?" süzgecinin TUZAĞI — `-lar` / `-ler`

Çevrilecek satırları bulmak için kullanılan sezgisel süzgeç, Türkçe çoğul ekini
(`lar`/`ler`) sözcük sonunda arıyordu. **İngilizcede de bu harflerle biten
sözcükler var** ve hepsi "zaten Türkçe" sanıldı:

> col**lar** · chil**ler** · control**ler** · hand**ler** · trai**ler** ·
> dopp**ler** · inha**ler** · vascu**lar** · ocu**lar** · acetabu**lar** ·
> modu**lar** · muscu**lar**

2026-09-02 denetiminde kapsam içinde bu yüzden atlanmış **226 satır** bulundu
(damar kateterleri, soğutma grupları, römorklar, ultrason probları…). Yeni bir
tarama yazarken ek aramak YETMEZ: kapsam içindeki aksansız satırların tamamı
gözle okunmalı (o tur 3.547 satır) ya da ayırt edici olarak Türkçe sözcük
dağarcığı kullanılmalı.

### Arama
TR-katlanmış `searchText = fold(nameTr + " " + keywords)` (`foldSearchText`,
shared) — 'İ'/aksan sorunu yok. Sorgu **TOKENLİ**: kelimelere bölünüp AND'lenir
(`tokenizeQuery`, shared), sıra önemsiz. `searchText` kod tabanında YALNIZ
burada kullanılır — eşleştirmede/bildirimde/yetkide DEĞİL; hatalı bir eşanlamlı
aramayı bozar, veriyi asla.

**Trigram indeksi (2026-09-02):** aranan satır 21.577'den 157.402'ye çıktığı
için `searchText` ve `nameTr` üzerinde `pg_trgm` GIN indeksi var
(`20260902100100_category_search_trgm`). `contains` → `LIKE '%…%'` btree ile
indekslenemez; indeks olmadan her arama tam tarama olurdu. Sınır: trigram ≥3
karakterde çalışır, 2 karakterlik sorgu tam taramaya düşer (kabul).

### Seçim seviyeleri
| Nerede | Seviye | Katalog |
|--------|--------|---------|
| Satın alma talebi / ilan kategorisi | min L3 | **discovery** |
| Firma ANA kategorisi | exactLevel L1 (segment) | tam |
| Firma ALT kategorisi | L2-4, tavan 50 — `buyer/sellerSubCategoryIds` | tam |
| AI önerisi | 2 aşamalı → L3 | — (L3 iki katalogda aynı) |

Ana ve alt kategori AYRI eksen; eşleştirme (`deriveCategoryMatchCandidates`)
ilanın kodundan tüm üst seviyeleri türetir ve ikisine de `hasSome` bakar.

### İkinci eksen: faaliyet tipi
`Company.activities` (`CompanyActivity[]`, tavan 3) — üretici / distribütör-bayi
/ hizmet sağlayıcı / ithalatçı-ihracatçı / fason. Etiket tek kaynağı
`@rothern/shared` `company-activities.ts`. Kategori NE'yi, bu NASIL'ı söyler.

### Kürasyon döngüsü
Sonuçsuz aramalar `category_search_misses` tablosuna (katlanmış sorgu tekil
anahtar → yazım varyantları tek satırda toplanır). Admin: kategoriler
sayfasının başındaki panel. Çözülmüş terim yeniden aranırsa kuyruğa GERİ döner.

### Koşum sırası (canlı)
```bash
# 1) İki CSV → tek TSV (sıra ÖNEMLİ: önce tam, sonra discovery)
pnpm --filter @rothern/db import-ariba-csv -- <tum-csv> <discovery-csv>
# 2) Şema (inDiscovery kolonu + trigram indeksi)
ALLOW_REMOTE_MIGRATION=1 pnpm --filter @rothern/db migrate:deploy
# 3) Katalog: TEK transaction, sil+kur
pnpm --filter @rothern/db seed-categories
# 4) Çeviri: ÖNCE doğrula (çakışma varsa exit 1), sonra uygula
npx tsx prisma/scripts/check-category-translations.ts
npx tsx prisma/scripts/apply-category-translations.ts
# 5) Sözlük (opsiyonel, reseed'siz canlıya)
pnpm --filter @rothern/db apply-category-keywords
# 6) Kategori → nitelik matrisi (idempotent; seed-categories'ten SONRA)
pnpm --filter @rothern/db seed-category-attributes
```
`seed-categories` çeviriyi zaten okur (`nameTr = çeviri ?? kaynak`), yani
tam reseed'de 4. adım gerekmez. `apply-category-translations` reseed
YAPMADAN canlıya yazmak içindir — yalnız değişen satıra dokunur.
`import-ariba-csv` fail-loud: iki dosya L1/L2/L3'te ayrışırsa, discovery tam
kataloğun alt kümesi değilse ya da öksüz düğüm varsa **durur** — sessizce
birleştirmez.

`seed-categories` sil+kur yapar ama FK yok (seçimler `categoryIds String[]` =
kod) → firma/ilan seçimleri korunur. 2026-09-02 geçişinde ölçüldü: 42 ilanın
20 tekil kodu + 20 firmanın 27 kodu, **0 kırık referans**.

NOT: web-dev ve prod API AYNI Supabase DB'yi kullanıyor — tek koşum ikisine de
yansır.

## Panel Keşif Bloğu — "giriş yapınca pazar yeri" (2026-09-02)

Panel anasayfaları analitik-önceydi; "piyasada ne var" hissi yoktu ve keşif
sayfaları menüde saklıydı. Panoya, aksiyon merkezi ile analitik sekmelerin
ARASINA bir keşif bloğu girdi (`components/dashboard/portal-discovery.tsx`).

**Pano SİLİNMEDİ** — aksiyon merkezi, KPI'lar, grafik sekmeleri, dönem seçici
yerinde. Sıra gerekçesi: "bugün ne yapmalıyım" (kişisel, acil) → "piyasada ne
var" (fırsat) → "nasıl gidiyorum" (geçmiş).

### Anasayfa düzeni (2026-09-03 revizyonu)

Kullanıcı geri bildirimi: "sistem karışık, bekleyen işler çok yer kaplıyor,
pazar yeri hissi yok". Pano üç bloğa indi, bu SIRAYLA:

| # | Blok | Ne der |
|---|------|--------|
| 1 | **Pazar yeri** (keşif) | "piyasada ne var" — ilk ekran |
| 2 | **Şerit** (bekleyen işler) | "bugün ne yapmalıyım" — TEK SATIR çip |
| 3 | **4 sayı** (dönemsiz KPI) | "bugün ne durumdayım" |

**Grafikler ve dönem seçici RAPORLAR'a taşındı.** İki gerekçe: (a) aynı veri
hem panoda hem Raporlar hub'ının özet grafiklerinde çiziliyordu — çift bakım;
(b) grafik bir KARAR ekranıdır, oraya bilerek gidilir. Ölçüldü: pano ilk yükü
**306 kB → 205 kB** (recharts rota paketinden çıktı). `KpiCard`ın sparkline'ı
da ayrı dosyaya alınıp tembelleştirildi — seri yoksa recharts hiç inmez.

`ActionCenter` iki görünüm, TEK veri: `ActionStrip` (şerit) aynı ucu, aynı
sıralamayı ve aynı metin haritasını okur; "Tümü" ile tam liste açılır. Hiç iş
yoksa şerit ÇİZİLMEZ — "bekleyen bir işiniz yok" satırı da yer kaplıyordu.

**Profilim** sol menüden değil **sağ üst hesap menüsünden** açılır (Ayarlar'ın
yanında). `secondaryNav` kaydı DURUYOR: o liste sol menüyü değil rota kaydını
(breadcrumb + başlık + tier kapısı) besliyor; silinseydi profil sayfasının
başlığı "Anasayfa"ya düşerdi.

### Satış paneli revizyonu (2026-09-03, Europages referanslı)

Kullanıcı geri bildirimi: aynı içerik birden fazla sayfada. Altı adım, her
biri ayrı commit (91cc1a06 … profilim):

| Tekrar | Çözüm |
|--------|-------|
| Anasayfa "Ne satıyorsunuz?" = Açık Talepler kopyası | `MatchedRequestsWidget` — 3 talep, arama/CTA yok; satır `BrowseTenderRow compact` (ikinci kart YOK); `PortalDiscovery` yalnız satınalma |
| "Yeni Satış İlanı" üç yerde | (Satış ilanı sonradan tümden kaldırıldı — 2026-09-04) |
| Profil düzenleme iki giriş | Satış menüsünde **Profilim**; Ayarlar kartı "Profilim sayfasını aç"; başlıkta "Firma bilgileri" ikincil bağlantı |
| "açık talep" / "satın alma talebi" karışık | Satış tarafı TEK terim **açık talep** — `listingTerms("ACIK_TALEP")` |
| Boş durumlar farklı | Hepsi `EmptyState`: ikon + 1 başlık + ≤1 satır + ≤1 eylem; satışta tek eylem "Sektörleri düzenle" (`SECTOR_EDIT_HREF`), "Bağlantı Kur" Bağlantılar'ın işi |

**Pano sırası (satış):** şerit → 4 KPI → uygun talepler → profil/katalog
sağlığı → Raporlar bağlantısı. Aynı gün önce "pazar yeri önde" denmişti;
Europages promptu ile ters çevrildi (satınalma panosuna dokunulmadı).
Şeride `unansweredInquiries` çipi eklendi (action-center). KPI delta rozeti
"Geçen aya göre" tooltip'i taşır — çıplak "%100" tamamlanma sanılıyordu.

**Tek kaynaklar:** profil tamamlanma `lib/company/profile-completeness.ts`
(Profilim + pano kartı); ürün tamamlanma `@rothern/shared`
`product-completion.ts` (API kapı + web formu CANLI — eskiden yeni üründe
%0 halkanın altında "Tüm alanlar dolu" yazıyordu); eksik listesi
`components/ui/missing-fields.tsx`; ürün sayaçları liste ucundaki `counts`
(firma geneli, süzgeçten bağımsız — pano, Ürünlerim sekmeleri, Profilim kartı
aynı sayı).

**İlan satırı (`IhaleListRow`):** xl altında KART (kod+ad · rozet sağda ·
Davetli/Kapsam/Yayın/Kapanış), tüm kart tıklanır, "›" oku yok; xl+ yoğun
tablo korunur.

**Ürün belgesi:** `company/items/documents/{upload-url,resolve}` — görselle
aynı iki adım, ayrı allowlist (yalnız PDF, 10 MB), `documents` Json'a yazılır.

**ŞEMA BEKLEYEN (migration kararı):** ürün öne çıkan özellikler / paket içi
adet / teslim süresi-bölgesi; firma teslimat bölgesi; "Toptancı" faaliyet
tipi. Kolon yok — eklemeli migration onaylanınca form/API/ürün sayfası.

### v2 denetimi — görsel kuralı, kart ailesi, sözlük, KPI (2026-09-03/04)

Europages referanslı ikinci tur (ekran görüntülü bulgular). Yedi iş, her
biri ayrı commit (cd29f7f9 … fca760ea). Kalıcı kararlar:

**Varlık sözlüğü** `lib/company/terms.ts` `ENTITY_LABELS` /
`entityLabels(isSatis)`: sihirbaz, dosyalar sekmesi, yayın onayı, şablon/
katalog diyalogları metni YALNIZ buradan. Satış sihirbazı satın alma
sihirbazının kopyasıydı ve varlık adı değişmemişti. `no-entity-leak.test`
kaynak taraması yapar: sihirbaz dosyalarında sabit "Satın Alma Talebi"/
"ihale" dizesi KALAMAZ (yorumlar hariç). Liste kolonu "Sorumlu" (rol adı
değil). Rol adları (Satışçı/Satın Almacı) ürün sözlüğü — dokunulmadı.

**Görsel kuralı — üç varlık, üç muamele (kartta, listede, detayda AYNI):**

| Varlık | Görsel | Kaynak | Kartta |
|--------|--------|--------|--------|
| Ürün | zorunlu (yayın kapısı) | ürün formu | her zaman 4:3 kapak |
| Satın alma talebi | YOK | — | görsel alanı hiç ayrılmaz (kategori ikonu + metin) |

Sihirbazda görsel yükleme alanı YOK — kapak ürün kaydından otomatik gelir;
TODO "Kapağı değiştir". Herkese açık pazar yeri kartı kategori görselini
korur (SEO yüzeyi, "gri kutu yok" kararı) — panel kuralı oraya uygulanmaz.

**Kart ailesi:** `marketplace/product-card.tsx` (`tile` Europages
anatomisi / `row`), `marketplace/listing-card.tsx` (`ListingCardData`
normalize; `tile`/`row`/`dense`), `ui/thumb.tsx` küçük resim. IhaleListRow
(kendi kaydım) ve BrowseTenderRow (başkasının) ADAPTÖR — kolon kümesi
onların, düzen kartın. Beyaz boş görsel kutusu hiçbir yerde kalmaz.

**KPI tek kaynak** `lib/company/kpi-selectors.ts`: pano, Tekliflerim,
Satışlarım aynı seçici. Kök neden: sunucu sayımı ilan TİPİNİ süzmüyordu.
"Aktif Sipariş" = Satışlarım "Aktif" kümesi. Delta: önceki VEYA şimdiki 0 →
rozet yok (`deltaPct` API + `pctChange` web).

**Kategori/faaliyet beyanı TEK yerde:** Ayarlar → Firma Bilgileri
`#kategoriler`. Profilim salt-okunur özet + bağlantı; pano/liste boş
durumları "Satış/Alış kategorilerini düzenle" → `SECTOR_EDIT_HREF`.
"Firma Türü" (hukuki) etiketi → "Hukuki Yapı".

**Pano iskeleti (iki modül):** şerit → 4 KPI → "size uygun" seçkisi (3 kart,
arama/sekme/CTA yok) → profil sağlığı → Raporlar bağlantısı; başlangıç
listesi gerçek veriden, hepsi bitince gizli. Sayfa başına tek primary CTA
(sol menü).

**Bağlantılar kartı** (logo · Doğrulanmış · faaliyet · şehir · 3 ürün küçük
resmi · "Profili gör") — API bağlantı listesi eklemeli alanlar
(`productPreview` tek gruplu sorgu, `publicProductWhere` kapısı).

**PAZAR YERİ AÇILDI (2026-09-03, kullanıcı kararı):** Vercel
`NEXT_PUBLIC_MARKETPLACE_LIVE=true` + `NEXT_PUBLIC_SITE_URL` (eksikti —
onsuz canlı build fail-loud) CLI ile yazıldı, redeploy edildi. Render
`MARKETPLACE_LIVE` kullanıcıda (o an 404 dönüyordu).

**ŞEMA BEKLEYEN:** ürün öne çıkan özellikler / paket içi adet / teslim
süresi-bölgesi; firma teslimat bölgesi; "Toptancı" faaliyet tipi.

### Herkese açık pazar yeri v2 — Europages kalıbı (2026-09-04, akşam)

Aynı gün ikinci prompt; sabahki "görünürlük katmanı" kararlarının bir kısmını
TERSİNE çevirdi (kullanıcı kararı). Commit'ler b641702c … (a11y).

**İlke:** ürün ve firma TAMAMEN açık ve gezilebilir; alım talebi GİZLİ ama
cezbedici; Satış İlanları özelliği sonradan tümden kaldırıldı (2026-09-04).
Tablo `lib/public/visibility.ts` (tek kaynak).

| Yüzey | Anonim GÖRÜR | Üyeye |
|-------|--------------|-------|
| Ürün | galeri, ad, kategori, **fiyat/aralık/"teklif isteyin"**, MOQ, "KDV hariç", nitelik tablosu, açıklama, doküman adı, firma adı+logo+Doğrulanmış+faaliyet+şehir, firmanın diğerleri, benzer, kategoride yeni | "Bilgi iste" (giriş → panel ürün sayfası), web sitesi, doküman indirme |
| Firma | logo/kapak/ad/rozet/şehir/faaliyet/kategori, Hakkında (düzyazı sezgisi), hizmet, sertifika, galeri, kuruluş, çalışan, **ortalama puan (tek sayı)**, tüm ürünler | Rothern ID, iletişim/web/sosyal, puan dağılımı, sipariş sayıları, talep/ilan listesi |
| Dizin `/firmalar` | **HERKESE AÇIK** (`public/companies/directory`, ISR, sitemap): koşul profil kapısı ∧ (≥1 yayında ürün ∨ tamlık ≥ %60); `profileCompleteness` @rothern/shared'a taşındı (Profilim ile aynı hesap); test verili Hakkında tamlığa sayılmaz | Rothern ID, iletişim |
| Alım talebi | başlık, kategori, kapsam, **kalem SAYISI + miktar** ("2 kalem · 1.200 adet"; toplam yalnız aynı birimde), satırlar "Kalem 1 · 500 adet" (AD YOK), alıcı şehri + faaliyet tipi, Doğrulanmış alıcı (gerçek bayrak), kalan süre, kapalı zarf | alıcı adı, kalem adları, şartname, dosyalar, teklif |

**"N tedarikçi inceledi" YOK** — görüntülenme kolonu yok; kural 1 (şema
dokunulmaz) + kural 2 (uydurma veri yok) → sayaç basılmaz. Tek kolonluk
migration onaylanırsa eklenir. Aynı sebeple "Hızlı yanıt veren", "Yakınımda
yarıçap", "teslimat bölgesi", "görüntülenmeye göre popüler" YOK; yedekler:
il seçimi, "kategoride yeni", ürün sayısına göre popüler kategoriler.

**Kanonik adresler DEĞİŞMEDİ:** ürün `/firma/<firma>/urun/<ürün>` (slug
firma içinde tekil — `/urun/<slug>` çakışırdı); talep `/talep/rot-…`
(`/alim-talepleri/<numara>` → 308).

**Anasayfa sırası:** header (Ürünler · Firmalar · Alım Talepleri · Nasıl
Çalışır + hero dışında kompakt arama) → hero (iki sekmeli arama + öneri
`public/suggest`, RFQ şeridi, güven bandı) → sayı şeridi (ürün ≥50 ∧ firma
≥20) → RFQ bannerı → öne çıkan ürünler (`products/featured`: doğrulanmış
önce, firma başına 2; ≥8) → kategori ızgarası 1+10 (7 sütun) → son eklenen
(≥8) → alım talebi teaser'ları (≥3, altında tek satır) → iki kart → firmalar
(≥4) → nasıl çalışır → popüler kategoriler (`stats.popularCategories`, L3
ürün sayısı) → SEO paragrafı → footer. Sıfır veride 1,2,4,6,9,11,13 görünür.

**Yeni API uçları:** `public/companies/directory(+/facets)`,
`public/products/featured`, `public/products/:firma/:urun/related`,
`public/suggest`, `public/stats`; `public/products` `?sort=&verified=1&
price=has|request`; `public/listings` `?closesWithin=7|30`.

**Kayıt niyeti:** `teklif` + `redirect` (yalnız site içi) — "Teklif ver" /
"Bilgi iste" kayıt+onboarding sonrası geldiği kaydın PANEL karşılığına döner.

**Doğrulama (lokal üretim build, Lighthouse mobil):** `/` 91·100·96·100,
`/urunler` 89·96→100·96·92, ürün 92·97→100·96·92, `/firma` 76·96·96·92,
`/firmalar` 91·100·96·92, `/alim-talepleri` 96·100·100·92. **SEO 92 =
ölçüm artefaktı:** Next 15 dinamik sayfada `<meta description>`ı gövdeye
akıtır, Lighthouse `<head>`e bakar; bot UA (Googlebot VE Chrome-Lighthouse
varsayılan `htmlLimitedBots` listesinde) bloklayan metadata alır — curl ile
doğrulandı (meta head içinde). `htmlLimitedBots`i elle yazmayın: varsayılan
listeyi EZER (Googlebot düşer). `/firma` 76: firmanın logo/kapağı ölü
`pub-*.r2.dev` host'unda 30 sn askıda — veri sorunu, `migrate-public-images`.

### Demo doluluk — pazar yeri (2026-09-04, kullanıcı kararı)

`packages/db/prisma/scripts/seed-marketplace-demo.ts` (`pnpm --filter
@rothern/db seed-marketplace-demo`): 20 firma (19'u paketli+doğrulanmış+
herkese açık; 1 STANDART örnek), 55 yayında ürün (görselli, fiyatlı/kademeli/
teklifle), 16 herkese açık ALIM talebi (5–25 gün açık), 8 SATIŞ ilanı, 16
bağlantı, 8 teklif. dev=prod DB olduğundan **canlıda da görünür** — bilinçli.
İşaret: sahip e-postası `@demofill.local`; giriş `<key>@demofill.local /
Demo1234!`. Görseller `loremflickr.com` (anahtar kelimeli, `lock` ile sabit).

**İdempotent ama SİLMEZ:** eski demo firmaların siparişleri FK ile bağlı
(`company_orders_buyerCompanyId_fkey`) → firma güncellenir, ürünler ve
teklifsiz açık ilanlar yeniden kurulur. Kaldırmak: `cleanup-marketplace-demo`
(ürün/ilan siler, teklifli ilanı iptal eder, vitrini kapatır; firma kalır).

Kategori kodları katalogda doğrulanır (`resolveCat`: kod → anahtar kelime →
segmentin ilk L3). Ariba adları noisy ("Reçeller ve jöleler ve fındık…") —
popüler kategori çipleri bu yüzden uzun okunabilir.

### Üye ↔ ziyaretçi TUTARLILIĞI (2026-09-04, gece)

Kullanıcı bulgusu: panel firma sayfası herkese açık profilden farklı
diziliyor, ürün ızgarası yok; Ürün Ara yalnız arama kutusu; dizin ücretsiz
üyeye kapalıyken ziyaretçiye açık. Kural: **üye, ziyaretçinin gördüğü her
şeyi AYNI bileşenle görür + üyeye özel alanlar.** Tek kaynaklar:

| Yüzey | Tek kaynak | Public | Panel |
|-------|-----------|--------|-------|
| Firma dizini | `common/company/company-directory.ts` `buildDirectory` (koşul ≥1 ürün ∨ tamlık ≥ %60) | `public/companies/directory` | `company/directory/search` (+rothernId, bağlantı durumu; kendisi+engelledikleri hariç) |
| Ürün dizini süzgeç/sıra/facet | `common/company/product-index.ts` | `public/products` | `company/items/discover/search` (+`/facets`; kendi ürünler hariç) |
| İlişkili ürün blokları | `common/company/related-products.ts` | `public/companies/:s/products/:p/related` (anahtara tabi DEĞİL) | aynı uç (`useRelatedProducts`) |
| Firma profili düzeni | `CompanyProfileView` (`main` slotu: ürünler + açık talepler) | `/firma/[slug]` | `/company/firma/[id]` |
| Test verisi Hakkında | `@rothern/shared` `looksLikeProse` | gizli | başkasının profilinde gizli, KENDİ profilinde ham |

**Görmek ücretsiz, listelenmek ücretli:** `searchCompanies` STANDART'a boş
dönmüyor; `getProfile` izleyenin paketine bakmıyor (`publicEnabled ∧ hedef
PAKET`); Keşfet sekmesi her üyeye açık. Eski davranış anonim ziyaretçinin
gördüğünü ücretsiz üyeden saklıyordu.

### Herkese açık yüzey v3 — görünürlük katmanı + tek kabuk (2026-09-04)

Ekran görüntülü denetim (3 Eylül, giriş yapmadan). Beş iş, her biri ayrı
commit (1b875c03 … 30397b3e). Kalıcı kararlar:

**Görünürlük katmanı — TEK KAYNAK `lib/public/visibility.ts`** (`VISIBILITY`
tablosu, `canSee`, `loginHref` → `?next=`, `PANEL_TARGET`). Herkese açık
sayfalar statik/ISR ve oturum tanımaz: `viewer` HER ZAMAN `anon`; üye/
bağlantılı katmanları PANELDE yaşar, tablo onları belgeler ve `GatedField`
bağlantısını nereye atacağımızı söyler. Gizlenen alan HTML'e HİÇ yazılmaz
(API projeksiyonu döndürmez; `null` bile RSC yüküne anahtar adı düşürür —
bu yüzden `ProfileViewData`'nın kapılı alanları opsiyonel ve public sayfa
onları hiç geçmez). `GatedField` (satır içi) / `size="box"` (sayfa başına
EN FAZLA BİR).

| Yüzey | Anonim GÖRÜR | Anonim GÖRMEZ |
|-------|--------------|---------------|
| İlan/talep | başlık, kategori, kapsam (kalem SAYISI + ilk 3 kalem ADI `itemPreview`), kalan süre, şehir, açıklama | kalem gövdesi (miktar/marka/şartname), `buyNowPrice`, sahip (HİÇBİR katmanda) |
| Ürün | görsel, ad, kategori, açıklama, **firma adı** (opt-in vitrin) | `priceAmount`/`priceTiers`/`priceCurrency`/`moq` — yalnız `priceMode` kalır ("Fiyat için giriş yapın" ↔ "teklif isteyin" dürüst kalsın) |
| Firma profili | ad, şehir, faaliyet, kategoriler (L1), logo/kapak/galeri, Hakkında ilk 2 satır, Doğrulanmış/Gold Üye | Rothern ID, kuruluş, çalışan, puan/dağılım, sipariş sayıları, hizmet, sertifika, web/sosyal |
| Firma dizini `/firmalar` | `public/companies/summary`: doğrulanmış firma SAYISI + en çok temsil edilen 8 kategori | liste (JWT, `company/directory`) |

**Panel fiyatı KAYBETMESİN diye ayrı uç:** panel ürün sayfası eskiden
public ucu okuyordu → `GET company/items/discover/:companySlug/:productSlug`
(üye katmanı, fiyat/MOQ dahil; kapı `publicProductWhere` + profil kapısı,
public uçla aynı). Web tipi `MemberProduct = PublicProduct & ProductPriceFields`.

**Test verisi herkese açık yüzeyde ÇIKMAZ:** `common/company/
public-text-quality.ts` `looksLikeProse` (≥40 karakter, ≥3 sözcük, %60
sesli, ort. sözcük ≤14) — geçmeyen "Hakkında" hiç dönmez, yazma
engellenmez. 2026-09-04 taraması: 1 kayıt (İkinci Firma Ltd, PNTT-9XP5,
"PSKDFMOKAND…"), gizlendi.

**Tek kabuk `components/marketplace/public-layout.tsx`:** her public sayfa
(liste, detay, `/firma`, `/firmalar`, `/nasil-calisir`, `/hakkimizda`,
`/iletisim`, `/talep-onayla`) aynı header/footer. Üç ayrı şablon vardı;
`/hakkimizda` ve `/iletisim`in hiç header'ı yoktu. `/tedarikciler` →
`/firmalar` (308, `next.config`), `/giris` → `/company/login`, `/kayit` →
`/company/kayit`.

**Anasayfa sırası:** hero (iki taraf: "Al, sat, tek hesap." + SEKMELİ arama,
varsayılan Ürünler, JS'siz de çalışır) → güven bandı → **kategori ızgarası
(1 büyük + 8, her zaman dolu; `category-showcase.ts` + `category-photos.ts`
— fotoğraf → ilk ürün kapağı → üretilmiş görsel; **2026-09-04 akşamı 58
segmentin HEPSİNE fotoğraf eklendi**, bkz. § Kategori fotoğrafları)** → eşikli
envanter (ürün ≥8, ilan ≥3; altında bölüm HİÇ çizilmez, boş kutu YOK) →
nasıl çalışır → kapanış CTA. Kayıt CTA'sı 8 → 3. `SectionGrid`in boş
durumu ve `EmptyListings` silindi; listelerde tek `PublicEmptyState`
("{Tür} bulunamadı." + Filtreleri temizle + Kategorilere göz at) — boş
sayfadan boş sayfaya bağlantı yok.

**Liste iskeleti `PublicListPage`** (ilan+ürün): sol süzgeç HER ZAMAN.
Yeni süzgeçler: ilan `?kapsam=yurtici|uluslararasi` (`scope`), ürün
`?faaliyet=` (`activity`) + facet sayaçları. **İki süzgeç hatası
düzeltildi:** (a) ilan kategori süzgeci `has` tam eşleşmeydi, facet L1
sayıyor, ilan L3+ taşıyor → tıklayınca SIFIR sonuç; artık `unnest`+`LIKE`
ile alt ağaç; (b) `code.replace(/0+$/)` `40000000`ı "4"e indiriyor, 41-49'u
da yakalıyordu → `@rothern/shared` `categoryPrefix()` (seviye × 2 hane),
dört çağrı yeri tek kaynağa. Facet dizileri `?? []` ile okunur: kenar
önbelleğindeki eski yanıt alan eksikse sayfa çökmez (doğrulamada 500 verdi).

**Kayıt niyeti `lib/company/signup-intent.ts`:** `?intent=talep|vitrin`
formda ön seçili; doğrulama sonrası `sessionStorage`, `/company` kökü
tüketip sihirbaza (`taleplerim/yeni`, `urunlerim?yeni=1`)
yönlendirir — onboarding araya girse de kaybolmaz.

**Sözlük kilidi:** `lib/public/public-terms.test.ts` public dizinlerde
"ihale/e-ihale/Satışçı" arar (yorumlar hariç). Fiyat kartlarında koltuklar
"satış koltuğu" biçiminde; rol adları panelde kalır. `/nasil-calisir`
sayaçları tek kaynaktan (58 segment, `registrationCountries()`), `CountUp`
son değerle başlar (JS/hareket yoksa "0 ülke" kalmıyor).

**AÇIK (o günkü durum, sonra kapandı):** Render `MARKETPLACE_LIVE` kullanıcı
tarafından açıldı (2026-09-04); kategori fotoğrafları 58/58 eklendi (aynı gün
akşamı); üye görünümü `CLAUDE.md.local`taki hesapla doğrulandı.

### Anasayfa & ürün süzgeci v3 (2026-09-04)

Kullanıcının A1–A7 / B1–B9 listesi; A (süzgeç) 1eb52c1a+c5731daf, B üç
commit (d6166305 kartlar · ea877ba7 anasayfa · 90d0b0d7 header/yüzen CTA).

**Süzgeç durumu URL'DE, tek kaynak `lib/public/product-filter-params.ts`**
(`?q&kategori&sehir=a,b&faaliyet=a,b&dogrulanmis=1&fiyat=var|teklif&fiyatMin&
fiyatMax&moqMax&sirala=yeni|fiyat|fiyat-azalan&nitelik&sayfa`). Kabuk
`components/marketplace/filter-shell.tsx`: `update()` → `startTransition(
router.replace(…, {scroll:false}))`, geçişte liste soluk (`FilterResults`),
`ResultCount` aria-live; mobilde Headless UI çekmecesi + "Sonuçları göster
(n)". Süzgeç bileşenleri `product-filters.tsx` (fieldset/legend, bölüm başına
sayı + Temizle, katlanır — `localStorage rothern.filters.<key>`, 6'dan sonra
"Tümünü göster", kategori arama kutusu, fiyat aralığı + MOQ, sıralamada yön
oku). **Facet sayıları BAĞLAMSAL**: `contextualFacetCounts` kendi boyutu
hariç seçili süzgeçlerle sayar; 0 → soluk + disabled. Panel **Ürün Ara**
AYNI kabuk ve AYNI bileşenler (`company/items/discover/{search,facets}`) —
public ile panel bir daha ayrışmasın.

**Anasayfa sırası:** hero (çipler: 6 popüler alt kategori) → hareket şeridi
→ alıcı akışı (3 adım) → açık alım talepleri → sekmeli ürün kaydırıcısı →
kategori listesi → iki kart → firmalar → TrustBand (tedarikçi akışı) →
popüler çipler → SEO paragrafı. Yüzen "Talep aç" ve header araması YALNIZ
hero görünümden çıkınca (`useHeroGone`, `[data-hero-search]` sentinel).

**Sayı şeridi = HAREKET, envanter değil.** "56 ürün / 20 firma" azlığı ilan
ediyordu; "bu hafta 9 ürün · 24 saatte 8 teklif" pazarın yaşadığını söyler.
0 satır basılmaz, <2 satırda şerit yok; envanter eşiği (ürün ≥50 ∧ firma
≥20) korunur.

**Kart kuralları:** talep kartında büyük sayı YALNIZ birimli miktar (çıplak
"3" ne olduğu belirsizdi), kalem sayısı meta; ≤3 gün rose / ≤7 amber; kart
tamamı tıklanır (başlık bağlantısı `after:inset-0`, "Teklif ver" z-10).
Ürün kartında stok görsel (loremflickr/picsum/unsplash — `isStockImage`)
"Temsili görsel" etiketi taşır; görselsiz ÜRÜN nötr gri (`fallback="neutral"`)
— ürün görseli zorunlu, yokluğu eksikliktir, tonlu kutu onu saklardı (ilan/
talep tonlu kategori görselini korur). Fiyat sembolü tek kaynak
`currencySymbol` ("41.000 ₺ / adet"). Firma kartında ad + ✓ aynı satır.

**Sekmeli kaydırıcı (`product-showcase.tsx`)** tek liste, üç sekme (Öne çıkan
≥8 · Yeni · Fiyatı yazılı ≥4); WAI tabs klavye; `tabpanel` rolü `<ul>`'a
verilemez (aria-allowed-role) — sarmalayıcı div. **`scroll-pl-*` ŞART:**
scroll-snap'li listede ilk kartın snap noktası scrollLeft=0'da değilse Chrome
yüklenişte 24px kaydırır; o scroll olayı LCP raporunu keser (Lighthouse
NO_LCP, CrUX'ta kayıp metrik) — 2026-09-04'te ölçüldü ve düzeltildi.

Lighthouse (prod build, lokal): anasayfa perf 88 · a11y 97 (kalan
color-contrast bulguları bu turda kapatıldı) · SEO 100; `/urunler` 75
(loremflickr görselleri). Küçük metinde `text-zinc-400` KULLANMA —
beyazda 2,6:1; en az zinc-500 (zinc-100 zeminde zinc-600).

### Anasayfa hydration hatası — İKİ sebep, ikisi de kapandı (2026-09-05)

www.rothern.com **anasayfası** her yüklemede React #418 veriyordu (yalnız
orada; diğer herkese açık sayfalar temizdi). İki ayrı sebep vardı:

**1. `usePathname()` statik/ISR üretimde "/" DÖNMÜYOR (asıl sebep).**
`MarketingHeader` kompakt aramayı `pathname !== "/" || heroGone` ile
gösteriyordu; sunucu HTML'i arama kutusunu BASIYOR, istemci basmıyordu →
uyuşmazlık → React tüm ağacı yeniden çiziyordu. Düzeltme: koşul yalnız
`useHeroGone()` — sunucu HER ZAMAN aramasız basar, kutuyu istemci gösterir.
**Kural: yol adına göre RENDER DALLANMASI yapma** (statik sayfada sunucu ile
istemci ayrışır); "şu an neredeyim" bilgisini istemci efektinden al.

**2. Ölü görsel adresi (ikincil).** İki firmanın logo/kapağı kapalı
`pub-*.r2.dev` host'undaydı; yüklenemeyince `CompanyLogo` yedeğe düşüyor ve
aynı uyarıyı üretiyordu. **Taşıma YAPILDI (2026-09-05):**
`migrate:public-images` ile `{prod,dev}/tenant-profile/**` `rothern-public`
kovasına kopyalandı (15 nesne) ve DB'deki 4 alan `cdn.rothern.com`'a
çevrildi. Artık DB'de `r2.dev` adresi YOK, dördü de 200 dönüyor. NOT: Demo
Firma'nın logosu 1×1 piksel bir test yüklemesi — geçerli ama görsel olarak
boş; gerçek logo (`logo-…-arsa.jpeg`) kovada duruyor, istenirse profilden
yeniden yüklenir.

Teşhis yolu (tekrar gerekirse): JS'siz DOM ile hydration sonrası DOM'u
ÖZNİTELİK düzeyinde karşılaştır — fark doğrudan görünür. `main` ile
sınırlama, header/footer dışarıda kalır. Elenen adaylar: sayılar, tarih
metinleri, JSON-LD, `useId`, HTML iç içeliği, önbellek bayatlığı, UA'ya göre
farklı HTML.

### Panel anasayfaları — "Ne arıyorsunuz?" kutusu önde (2026-09-05, kullanıcı kararı)

Kullanıcı: "Satınalma anasayfası www.rothern.com'daki ilk açıldığı tarzda
olacak; ürün ara direkt anasayfada, sol menüden kalkacak; Europages'teki
'ne ararsınız' kutusu; satış kısmında da alım talepleri gözükecek."

Tek bileşen `components/dashboard/panel-hero-search.tsx` (`PanelHeroSearch`):
başlık + büyük yuvarlak arama kutusu + altında en dolu 6 kategori çipi.
Düz `<form method="get">` (JS'siz `?q=` ile sonuç sayfasına gider), JS'de
`router.push`. Çip sayıları GERÇEK envanterden (arama logu yok).

| Panel | Kutu neyi arar | Sonuç sayfası | Çipler |
|-------|----------------|---------------|--------|
| Satınalma | ürün + firma (`?q=`) | `/company/satinalma` (liste anasayfada, `#urunler`) | (çipler kalktı — kategori kartları aynı işi görür) |
| Satış | açık alım talebi (`?q=`) | `/company/satis` (liste anasayfada, `#acik-talepler`) | `discover-facets` segmentleri → `?kategori=` |

**"Ürün Ara" SOL MENÜDEN KALKTI** (önce `secondaryNav`a taşındı; aynı gün
dördüncü turda SAYFA da kalktı — liste satınalma anasayfasında, bkz. aşağı).

**"Açık Talepler" SAYFASI DA KALKTI — liste satış ANASAYFASINDA (2026-09-05,
kullanıcı kararı; "filtreleme her şeyiyle eksiksiz").** `SellerTendersView
embedded` panoya gömülü: arama, durum/dönem/alıcı/kategori süzgeçleri,
sıralama, çipler, sayaç ve sayfalama AYNEN; yalnız sayfa başlığı düşer,
bölüm `id="acik-talepler"`. Hero kutusu ve sektör kartları aynı sayfayı
`?q=` / `?kategori=` ile süzer (liste URL'den okur). Rota
`/company/satis/acik-talepler/*` → `/company/satis` (308, sorgu taşınır);
iç bağlantılar `/company/satis#acik-talepler`. `MODULE_LABELS.satis.
acikIhaleler` silindi; ad tek kaynak `LISTING_TERMS.ACIK_TALEP.title`.
`MatchedRequestsWidget` ve `satis-chart-tabs` (ölü) silindi. Bildirim
e-postasındaki CTA (`company-listings.service` kategori eşleşmesi) de
anasayfaya gider.

Öneri dengesi (asistan notu): Açık Talepler'i menüde tutmayı önermiştim
(iş listesi, arama sonucu değil); kullanıcı birleştirmeyi seçti — liste
anasayfada tam işlevli olduğu için kayıp yok, yalnız sayfa derinliği arttı.

**Satış anasayfası — üçüncü revizyon (2026-09-05, kullanıcı: "filtreleme
daha iyi olsun; talepler üstünde ikinci arama kutusu neden var; sektör
çipleri ve fotoğraflı kategori kartları gerek yok; tüm talepler burada").**
Sıra: arama (öneriyle) → **Açık Talepler kenar süzgeçli TAM liste** → BUGÜN
→ ürün ekle şeridi → sağlık kartları. Sektör çipleri, `CategoryShowcasePanel`
(satışta) ve `BuyersBlock` (silindi) kalktı — kategori ve alıcı artık listenin
kenar süzgecinde SAYAÇLI; aynı bilgiyi ikinci kez basmak sayfayı
kalabalıklaştırıyordu. Listenin kendi arama kutusu YOK: hero `?q=` yazar,
listede yalnız "Arama: …" çipi (kaldırılabilir).

| Parça | Tek kaynak |
|-------|-----------|
| URL şeması (`?q&durum&uygunluk&kategori&kapsam&kapanis&alici&sehir&para&usul&donem&sirala&sayfa`) | `lib/company/request-filter-params.ts` |
| Süzme/sıralama/**bağlamsal** facet sayımı (istemci — uç zaten tüm listeyi verir, tavan 300) | `lib/company/request-facets.ts` |
| Kenar süzgeci, çipler, sıralama | `components/company/request-filters.tsx` |
| Yapı taşları (Group/Check/ShowMore/FilterChipBar) — ürün süzgeciyle ORTAK | `components/marketplace/filter-primitives.tsx` |
| Kabuk: `FilterShellCore<S>` (durumdan bağımsız) + ürün sarmalayıcısı `FilterShell` | `components/marketplace/filter-shell.tsx` |

Kategori süzgeci SEGMENT düzeyinde (`kategori=39000000,23000000`, çoklu);
öneri/çipten gelen tam kod segmentine indirgenir. Uygunluk grubu (davet /
bağlantılı / kategorime uygun / teklif verdiklerim) grup içi VEYA. İlgi
merdiveni (davetli › bağlantılı › kategori › skor kademesi) seçilen
sıralamanın ÜSTÜNDE kalır (eski karar, `sortRequests`). "Tümünü temizle"
aramayı DA sıfırlar (kutusu hero'da, listeden uzakta); sıralama kalır.
`PanelHeroSearch` hedef sayfa mevcut sayfaysa seçili süzgeçleri KORUR
(yalnız `q` ve `sayfa` değişir). Kabuk genellemesinde bulunan hata: `update({
page })` her zaman 1. sayfaya düşüyordu → panel Ürün Ara'da "Sonraki"
çalışmıyordu; sayfa artık yalnız açıkça istenince korunur. Sözleşmeler:
`request-filter-params.test`, `request-facets.test`, `seller-tenders-view.test`.

**İki anasayfa — dördüncü tur (2026-09-05, kullanıcı: "Europages gibi
kaliteli; filtreleme her şeyiyle tam; ürünlerine ve verdiği tekliflere göre
talepler uygun çıksın; arama şirket/kalem/ürün her türlü").**

*Satınalma anasayfası:* arama (öneri: **ürün 5 · firma 3 · kategori 3**) →
kategoriye göre keşfet (8 fotoğraflı kart; tıklayınca AYNI sayfadaki liste
`?kategori=…#urunler` ile süzülür) → **ÜRÜNLER: kenar süzgeçli tam dizin
gömülü** (`components/company/product-discovery-section.tsx`; herkese açık
`/urunler` ile aynı `ProductFilters`/URL şeması; sayfa boyutu 12) →
doğrulanmış tedarikçiler → BUGÜN → talep aç şeridi → profil → Raporlar.
Hero çipleri ve "Size uygun ürünler" bloğu (`PortalDiscovery`, silindi)
kalktı; **"Ürün Ara" sayfası kalktı** (`/company/satinalma/urunler` → 308
`/company/satinalma`, sorgu taşınır; ürün DETAYI `urunler/<firma>/<ürün>`
duruyor). Üst çubuk araması satınalmada anasayfaya `?q=` yazar ("Ürün veya
firma ara").

*Uygunluk (API):*
- `items/discover/search`: sıralama seçilmemişse firmanın **ALIM
  kategorileriyle** (L1 ana + L2-4 alt, kod ön eki) örtüşen ürünler ÖNCE
  (`matchesProfile` bayrağı → kartta "Alım kategorinizle eşleşiyor"
  rozeti); sayfalama iki kümenin birleşimi; açık sıralamada (en yeni/fiyat)
  karışmaz. `pageSize` (≤48) parametresi.
- `productSearchClauses`: token artık KATLANIR ("Çelik" → "celik" — ham
  token katlanmış `searchText`te hiç eşleşmiyordu, gizli hata) ve **firma
  adı** da aranır (tek kutu "ürün ya da firma").
- `seller-tenders`: satırda `itemNames` (ilk 20 kalem adı) + `productMatch`
  / `matchedProduct` — satıcının **katalog ürünleri** (aktif; taslak dahil)
  talebin kategori ata zinciriyle (L2+) ya da adı/anahtar kelimesiyle
  başlık+kalem adlarında eşleşir (`common/company/product-request-match.ts`;
  jenerik sözcük listesi). Merdiven: açık › davetli › bağlantılı › **ürün** ›
  kategori › ilgi skoru (web `sortRequests` AYNI sıra). `matchReason` ürün
  adıyla ("Ürününüz bu kategoride: …" / "Ürününüzle eşleşiyor: …"), yoksa
  ilgi motoru metni (geçmiş teklif/sipariş). Kapak görseli aynı `items`
  seçiminden (ilk görselli kalem).

*Satış anasayfası araması:* samanlık başlık · numara · alıcı · **kalem
adları** · kategori adları (`searchHaystack`, liste ve öneri AYNI); öneri
grupları **Açık talepler** (kalemden bulunduysa "Kalem: …") · **Alıcılar**
(`?alici=`) · **Sektörler** (`?kategori=`). Uygunluk süzgecine "Ürünlerimle
eşleşen"; satırda "Ürününüzle eşleşti" çipi (başlık ipucu ürün adı).

*Kabuk genellemesinde bulunan hata:* `update({ page })` 1. sayfaya
düşüyordu → düzeltildi (canlıda doğrulandı).

**AI ile ara (2026-09-05, kullanıcı: "Europages'teki gibi AI arama").**
İki anasayfanın arama kutusunda "Ara | ✨ AI ile ara" anahtarı. AI modunda
kutu doğal dil alır; `POST company/ai/search-intent` (`modules/ai/
search-intent/`, feature `search_intent`, Silver+ ∧ koltuk rolü —
`assertAiAccess`; bütçe/tavanlar `callAi` kapısından, thinking "low", tek
Flash çağrısı) yalnız SÜZGEÇ döner (`@rothern/shared` `AiSearchIntentResult`:
query, categoryHint→**kod backend'de** `category-hint-resolver.ts` (ürün
çıkarımıyla ORTAK, tek kaynak; talepte `discoveryOnly`), city (DB'deki il
yazımına kanonik), verifiedOnly, activity, priceMax, quantity, unit,
keywords, summary). Model sonuç/kod üretmez, yazma yok; `<metin>` VERİ,
şema + sanitizer (negatif/kod-gibi ipucu/geçersiz faaliyet düşer) son savunma.
Web: `lib/company/ai-search.ts` yorumu URL şemasına çevirir (satınalma:
`?q&kategori&sehir&faaliyet&dogrulanmis&fiyatMax&moqMax` — adet → MOQ
tavanı; satış: `?q&kategori(segment)&sehir`), sayfa `#urunler` /
`#acik-talepler`e gider; `AiIntentBand` "AI şöyle anladı" + çipler (URL'de
duranlar — kaldırılan gerçekten kalkar) + satınalmada "Bu tanımla talep aç"
(`ai-tender-draft` sessionStorage köprüsü → sihirbaz `?ai=1`; taslak
sunucuda kurulur: başlık, kalem (ad/adet/birim etiketi), açıklama = metin,
`suggestedCategoryIds`). Silver altı: anahtar devre dışı + "Silver ile
açılır". Sözleşmeler: `search-intent.spec.ts` (API), `ai-search.test`,
`ai-intent-band.test`, `panel-hero-search.test` (web).

İlk canlı denemede iki bulgu, ikisi de kapatıldı: (1) "kompanzasyon panosu"
ipucu ANAHTAR KELİMESİ yüzünden bir montaj HİZMETİ kategorisine düşüyordu
→ çözümleyici artık **ad öncelikli + Türkçe ek toleranslı** (`@rothern/shared`
`stemPrefix`: ≥6 karakterli katlanmış token'dan SON EK listesiyle düşer —
"borulari"→"boru", "panosu"→"pano", "sistemleri"→"sistem"; kör ön ek kesme
"elektrik"→"elek" gibi taşmalar yaptığı için ek listesi; tam ad › adda ek
toleransı › searchText › searchText ek toleransı; havuz 2000). Aynı kural
ÜRÜN aramasında (`productSearchClauses`, public dahil) ve AÇIK TALEP
aramasında (web `queryTokens` + sunucu sayımı) — üç yer ayrışmasın. (2) Yedi süzgecin toplamı 0 ürün veriyordu
→ **sunucuda gevşetme**: sayım gerçek motorla (`productIndexWhere` /
`sellerTenders`) yapılır, 0 ise kategori → fiyat tavanı → adet → faaliyet →
doğrulanmış → şehir sırasıyla kaldırılır; hâlâ 0 ise arama kelimeleri
"BİRİ HARİÇ" denenerek kısaltılır (en çok sonuç veren alt küme; sondan
kırpmak anahtar kelimeyi düşürüyordu — "elektrik panosu kompanzasyon"da
anahtar ortadaki), tek kelime kalana dek; sonuç `relaxed` (+"query") +
`relaxedCategoryName` ile döner, bant "Sonuç vermediği için kaldırıldı: …
arama kısaltıldı ("pano" kaldı)" der. Taslak gevşetmeden ÖNCEKİ kategoriyle kurulur. Satış
liste araması artık kelimelere bölünüp AND'lenir (AI 2-4 kelime üretir;
tam-ifade araması hiç eşleşmiyordu). Yerel `GEMINI_API_KEY` ön ödemeli
kredisi bitmiş (429) — AI yalnız canlıda (Vertex) doğrulanır.

**Üst çubuk araması iç sayfalarda devam ettirir (2026-09-05):**
`components/company-shell/topbar-search.tsx` — portal-yönlü (`TOPBAR_SEARCH`:
satınalma → `/company/satinalma/urunler?q=` "Ürün ara", satış →
`/company/satis?q=` "Açık talep ara"), md+ ekranda, düz `<form method="get">`.
Menüden kalkan "Ürün Ara"/"Açık Talepler" satırlarının yerini bu doldurur:
anasayfadaki büyük kutu ilk ekran deneyimi, üst çubuktaki küçük kutu iç
sayfalarda sürer. Hero (`[data-hero-search]`) ekrandayken ÇİZİLMEZ — aynı
görünümde iki arama kutusu olmasın.

> ⚠️ `useHeroGone` kancası 2026-09-05'te iki yönden düzeltildi: (a) panel
> kabuğu (üst çubuk) sayfadan ÖNCE mount olur — auth kapısı sayfayı sonradan
> basar — ve kanca sentinel'i bulamayınca "hero yok" sayıp kutuyu anasayfada
> da gösteriyordu; şimdi 4 sn `MutationObserver` ile geç gelen sentinel'i
> yakalar. (b) Üst çubuk kalıcı, sayfa değişir: `usePathname` YALNIZ efekt
> bağımlılığı (render dallanması değil — bkz. hydration #418 notu), her
> rotada yeniden değerlendirir. Public `MarketingHeader` aynı kancayı
> kullanır, aynı düzeltmeden yararlanır.

**Pano sırası (2026-09-05 ikinci revizyon — "Europages gibi düşün, Rothern
tarzını koru", "Başlangıç" listesi KALDIRILDI):**

| # | Satınalma | Satış | Bileşen |
|---|-----------|-------|---------|
| 1 | Arama (öneri: ürün 5 + kategori 3) | Arama (öneri: açık talep 5 + sektör 3) | `PanelHeroSearch` (kutusuz hero, `suggestions`+`onQueryChange` çağırandan) |
| 2 | Kategoriye göre keşfet — 8 fotoğraflı kart | Talep olan sektörler — 8 fotoğraflı kart | `CategoryShowcasePanel` (+`buildShowcase`, `category-photos`) |
| 3 | Size uygun ürünler (4) | Size uygun açık talepler (5) | `PortalDiscovery` / `MatchedRequestsWidget` (kutusuz) |
| 4 | Doğrulanmış tedarikçiler (4 firma kartı) | Talep açan alıcılar (4, `seller-tenders`ten türetilir) | `FeaturedCompaniesBlock` / `BuyersBlock` |
| 5 | BUGÜN: şerit + 4 KPI | BUGÜN: şerit + 4 KPI | `TodayBand` |
| 6 | "Talep aç" şeridi (ikincil — primary sol menüde) | "Ürün ekle" şeridi (primary — satış menüsünde CTA yok) | `CtaBand` |
| 7 | Profil sağlığı + Raporlar | Katalog/profil sağlığı | mevcut |

Bölüm ritmi tek: başlık solda + tek satır açıklama, çıkış bağlantısı sağda,
altında ızgara; kutu yalnız kartlarda. Öneri ve sayaçlar panelin kendi
uçlarından (`items/discover`, `discover-facets`, `seller-tenders`,
`categories/segments`); herkese açık `public/suggest` panelde YASAK.

### Kategori fotoğrafları — 58/58 (2026-09-04, akşam)

Kullanıcı: "kategori fotoğraflarını daha iyi yap". Tonlu ikon kutuları
(`category-visual.ts`) yerine her üst kategoriye GERÇEK fotoğraf:
`apps/web/public/categories/<segment kodu>.webp` × 58 (1200×800, `fit:
cover` + `position: attention`, ≤140 KB, toplam 4,4 MB — repo'da, CDN'de
değil: build ile gelir, `next/image` yerel dosyayı optimize eder).

**Kaynak ve lisans:** Openverse araması, YALNIZ `license=cc0,pdm` (atıf
zorunlu değil). Kayıt `docs/category-photo-credits.md` (kod · başlık ·
yaratıcı · lisans · kaynak bağlantısı) — kaynak değişirse diff'lenebilsin.
Seçim gözle: aday kontak sayfaları (3 tur, ~450 aday) tek tek bakılarak
seçildi; anahtar kelime İngilizce, sade (2 sözcük); `aspect_ratio=wide`
dışında süzgeç koymak sonuçları boşaltıyor.

**KURAL (kullanıcı kararı, aynı akşam revize):** gerçek fotoğraf YALNIZ
iki yerde — **ürün** (firma yükler; "Temsili görsel" etiketi ve
`isStockImage` KALDIRILDI) ve **kategori** (`CategoryGrid` anasayfa
kartları 16:10 + kategori sayfası başlığı, `PublicListPage image=`).
**Satın alma talebi fotoğraf TAŞIMAZ**: kart, teaser bandı ve detay bandı
tonlu segment ikonunda kalır (`CategoryImage`/`CategoryVisualBox` segment
fotoğrafına DÜŞMEZ — ilk sürüm düşüyordu, geri alındı). Tek kaynak
`category-photos.ts` `segmentPhotoSrc`; çağıran yalnız kategori sayfası.
`category-photos.test.ts` manifest ↔ dosya birebirliğini ve 58 segment =
ikon eşlemesi kümesini kilitler.

**Aynı turda bulunan hata:** `/urunler` ve kategori sayfasında React #418
hydration — `PublicListPage` özet satırı `<p>` içinde `<p aria-live>` +
`<div>` taşıyordu (süzgeç v3 kalıntısı). Sarmalayıcı `<div>` oldu. Hydration
teşhisi için `next dev -p 3005` + Playwright console dinleme: prod build
yalnız "#418" der, dev tam ağacı basar.

### Sözlük kalıntıları temizlendi (2026-09-03)

2026-09-01 yeniden adlandırması satış tarafında yanlış oturmuştu:
"Kazanılan Satın Alma Talebi" → **"Kazandığım İşler"** (satışta talep
KAZANILMAZ, teklif kazanılır) · "Aylık Satın Alma Talebi ve Verilen Teklif" →
**"Aylık Açık Talep ve Verilen Teklif"** · "En Rekabetçi Satın Alma Talebi" →
**"En Rekabetçi Talep"**.

**Ürün adları ayrıldı:** satınalmadaki keşif **"Ürün Ara"** (fiil), satıştaki
kendi katalog **"Ürünlerim"**. İkisi menüde yan yana okunduğunda ayırt
edilemiyordu (kullanıcı geri bildirimi). Keşif bloğundaki sekme:
"Tedarikçi ürünleri".

### Portal yönü içeriği belirler

| Panel | Şeritte ne var | Uç |
|-------|----------------|-----|
| Satınalma (firma ALIR) | firmaların **ürünleri** (satış ilanı kaldırıldı 2026-09-04) | `company/items/discover` |
| Satış (firma SATAR) | başkalarının **ALIM talepleri** | `seller-tenders` |

Yön ters dönerse kullanıcı kendi tarafındaki kayıtları "fırsat" sanır —
sözleşme testi `portal-discovery.test.tsx` bunu kilitler. Kendi kayıtların
şeritte YOK; onlar KPI'larda ve "Taleplerim/İlanlarım"da.

### Pazar yerinin herkese açık uçları PANELDE KULLANILMAZ

Üç sebep: (1) `MARKETPLACE_LIVE` kapalıyken boş dönerler, (2) maskeleme/davet/
bağlantı görünürlüğünü taşımazlar, (3) panelin göreceği içeriğin bir kısmı
(bağlantıya özel ilanlar) orada hiç yok. Blok panelin kendi auth'lu uçlarını
kullanır; görünürlük `sellerTenders` ile aynı fonksiyondan gelir.

### Sektör sayaçları ile liste TEK KAYNAK

`sellerVisibleWhere()` (company-listings.service) — `sellerTenders` ve
`discoverFacets` ikisi de onu okur. Ayrışsalardı kutuda "12 ilan" yazıp
tıklayınca 5 ilan çıkardı. Tarama tavanı da ortak (`SELLER_SCAN_CAP`).

`limit` SIRALAMADAN SONRA kırpar: sorguyu kırpsaydık "en uygun 6" değil
"rastgele 6" gösterirdik ve davetli ilan listenin dışında kalabilirdi.

### Panel ürün keşfi

`GET company/items/discover` — kapı `publicProductWhere()` TEK KAYNAĞI +
"kendi ürünlerin hariç". Panele özel gevşek bir kural yazılmadı: iki kapı
zamanla ayrışır ve "panelde görünen ama profilinde 404 veren ürün" üretir.
Kimlik AÇIK (panelde firma adı zaten görünür); ilan anonimliği yalnız herkese
açık sayfalarda geçerli.

Satınalma sol menüsünde **"Ürünler"** (başkalarının vitrini) — satış
portalındaki **"Ürünlerim"** (kendi katalog) ile karıştırılmamalı; ayrımı
iyelik kipi taşıyor.

### Arama devri

Keşif kutusundaki terim `?q=` ile ilgili listeye devredilir; `SellerTendersView`
ve ürün keşfi artık başlangıç değerlerini URL'DEN okur (yan fayda: o sayfalar
paylaşılabilir/yer imlenebilir oldu). `useSearchParams` null dönebildiği için
erişim opsiyoneldir — testte ve sunucu-öncesi render'da çökmesin.

## Ürün Kataloğu (firma vitrini) — 2026-09-02

`CompanyItem` iç kullanımlık "kalem kısayolu"ydu; Faz 2 onu firmanın HERKESE
AÇIK vitrini yaptı. Ayrı varlık AÇILMADI — aynı kayıt hem ilana eklenir hem
vitrinde durur; ikiye bölmek aynı ürünü iki yerde güncelleme borcu üretirdi.

| Yüzey | Adres |
|-------|-------|
| Panel | `/company/satis/urunlerim` (SATIŞ portalı — ürün "ne sattığım" beyanı) |
| Public | `/firma/<slug>/urun/<slug>` — URL firmanın ALTINDA (firma otoritesinden beslensin) |

### İlanla ürün arasındaki KİMLİK ayrımı

| | Ne | Sahip |
|---|-----|-------|
| İlan | işlem (süreli, teklif toplar) | **ANONİM** |
| Ürün | vitrin (kalıcı, opt-in) | **firma adıyla** |

Bir alım talebinde "kim alıyor" rekabet istihbaratıdır; ürün sayfası ise
firmanın kendi opt-in vitrini ve satılan bir özelliktir (BRONZ+). Sözleşme
testleri ikisini birlikte kilitliyor (`public-product.spec.ts`).

### Fiyat — üç mod, hiçbiri yalan gerektirmez

`CompanyItemPriceMode`: `FIXED` | `TIERED` | `ON_REQUEST` (varsayılan).

Europages'te fiyat tek zorunlu sayı kutusu ve fiyatını açmak istemeyen
satıcıların çoğu "1,00 €" yazıp geçiyor → alan dolu ama içi yalan, sıralanamaz.
Üç modda dürüst seçenek var, **ve tamamlanma skorunda ÜÇÜ DE TAM PUAN alır** —
dürüst seçeneği cezalandırmak kullanıcıyı tam da o sahte fiyata iterdi.

### Kategori → nitelik matrisi (MİRASLI)

`CategoryAttribute`: kategori düğümünde tanımlanır, ALT düğümler DEVRALIR.
Bir ürünün nitelikleri = kodunun ata zincirindeki tüm satırlar
(`categoryAncestors`, @rothern/shared — tedarikçi eşleştirmesi de aynı
fonksiyondan okur). Aynı `groupKey` daha spesifik düğümde varsa O KAZANIR.

Böylece 158.018 kategoriye tek tek satır yazmak gerekmiyor: 58 segment +
birkaç yüz aile yeter. **58 segmentin 58'i dolu: 237 nitelik / 59 düğüm**
(`src/seeds/category-attributes.ts` → `pnpm --filter @rothern/db
seed-category-attributes`, idempotent + fail-loud; kaynakta olmayan satırı
SİLER — matris tek kaynak, veritabanı kopyası).

İlk tur 14 segmentti; ürün dizini açılınca kalanı dolduruldu, çünkü nitelik
tanımlı olmayan dalda süzgeç kurulamıyor ve ürün formu o kullanıcıya hiçbir
yapılandırılmış soru sormuyordu — katalog dolu, karşılaştırılabilir veri yok.

Derinleştirme (L2/L3 bindirmesi) talep geldikçe: `40170000` (borular) örneği
dosyada. Ölçüldü — yaprak `40171501` sekiz nitelik devralıyor: dördü
segmentten (malzeme, basınç, sıcaklık, standart), dördü aileden (DN çapı, et
kalınlığı, bağlantı, üretim yöntemi). O yaprak için TEK satır yazılmadı.

Doldurulmamış bir dalda form nitelik SORMAZ ve akış çalışır — matris eksikken
ürün eklenemez hâle gelmemeli.

### Ürün ekleme İLAN AÇMAYA BENZEMEZ (2026-09-03)

İlan bir **sihirbazdır** (adımlar, kalemler, miktar, teslim, kapanış); ürün
**tek sayfa** bir vitrin kaydıdır — Europages'te de öyle. Bu yüzden "önce
kalem aç, sonra vitrini doldur" iki adımına BÖLMÜYORUZ: `POST
company/items/product` kaydı ve vitrin alanlarını TEK çağrıda yazar, iç
tarafta `create` + `updateShowcase` (aynı normalizasyon, tek yazma yolu).

Form sırası: **ad → kategori → açıklama → görseller → anahtar kelimeler →
nitelikler → fiyat/MOQ**, sağda canlı tamamlanma halkası. Ürün TASLAK doğar;
yayımlamak ayrı ve bilinçli bir adım.

> ⚠️ **Kapatılan çıkmaz:** vitrin formunda AD ve AÇIKLAMA alanları hiç YOKTU,
> ama yayın kapısı ≥100 karakter açıklama istiyor. Kullanıcı açıklamayı
> yazacak bir alan bulamadığı için ürününü yayımlayamıyordu. İkisi de artık
> `ShowcaseDto`da; ad değişince `searchText` yeniden türetilir (yoksa ürün
> eski adıyla aranmaya devam ederdi).

### Menüden ulaşılamayan sayfa bırakma

`satis/urunlerim` ve `satis/bilgi-talepleri` yazılmış, `MODULE_LABELS`e adları
girilmiş ama **menüye hiç eklenmemişti** — kullanıcı ürününü nereden
ekleyeceğini sordu. Sayfa yazmakla sayfayı ulaşılabilir kılmak ayrı işler.
`module-reachability.test.ts` bunu dosya sistemi üzerinden zorunlu tutar:
menüde olmayan her sayfa gerekçesiyle listede olmalı, ve `MODULE_LABELS`teki
her ad bir menü satırında kullanılmalı (bağlanmamış etiket, "sayfa var ama
ulaşılamıyor" hatasının erken işareti).

### Bilgi talepleri — İKİ PORTAL, İKİ YÖN (2026-09-03)

Canlıda bulunan iki hata aynı kökten geliyordu: giriş yapmış kullanıcı panel
içi ürün sayfasında **misafir formuyla** (ad/e-posta/firma/telefon) karşılaşıyor
ve gönderdiği talepler **satış** panelinin "Gönderdiklerim" sekmesinde
yaşıyordu — satın alma panelinde bilgi talebi diye bir şey yoktu.

| Portal | Sayfa | Ne |
|--------|-------|-----|
| Satınalma | `satinalma/bilgi-taleplerim` — **"Bilgi Taleplerim"** | GÖNDERDİĞİM sorular + yanıtlar |
| Satış | `satis/bilgi-talepleri` — **"Bilgi Talepleri"** | ürünlerime GELEN sorular |

Tek bileşen (`InquiriesView portal=…`), tek veri katmanı; karşı yönün sorgusu
o portalda hiç açılmaz. Ayrımı iyelik kipi taşıyor (Ürünlerim/Ürün Ara kuralı).

**Kayıtlı alıcı yolu AYRI uç:** `POST company/inquiries` (auth'lu, SATIN_ALMACI
rolü, KYC yok — mesaj sınıfı eylem). Misafir yolundan üç farkı tek sebebe
dayanır, kimlik zaten kanıtlı: doğrulama jetonu yok (satır `verifiedAt` +
`claimedCompanyId` ile doğar), bot savunması yok, kimlik alanı sorulmaz
(ad/e-posta/firma oturumdan). Misafir tavanı (3/gün/e-posta) UYGULANMAZ —
gerçek satın almacı günde üçten çok tedarikçiye sorar; frenler: aynı ürüne
24 saatte tek talep + firma başına 30/gün. Kendi ürününe talep 400.

**Yanıt bildirimi alıcının kayıtlı olup olmadığına göre ayrışır:** misafire
"hesap açın" + `/company/kayit`; kayıtlıya "Bilgi Taleplerim'den okuyun" +
`appRoutes.inquiriesSent`. Aynı metni ikisine göndermek hesabı olan kullanıcıyı
kayıt ekranına atıyordu. İçerik iki dalda da e-postaya konmaz.

**Ürün → talep köprüsü:** kutudaki ikinci eylem "Bu ürünü satın alma talebime
ekle" ürünü sihirbaza İLK KALEM olarak taşır (`map-product-to-form.ts`,
`sessionStorage` anahtarı AI taslağından AYRI — aynı anahtar olsaydı "AI
doldurdu" bandı basılırdı). Miktar ve fiyat TAŞINMAZ: MOQ satıcının tabanı,
vitrin fiyatı müzakereyi çıpalar.

Herkese açık ürün sayfasında `MARKETPLACE_LIVE` kapalıyken misafir kutusu
ÇİZİLMEZ (uç 404 döner; yazıp "gönder"de patlayan kutu yerine "Giriş yapıp
talep gönderin"). Sözleşmeler: `public-inquiry.spec.ts` "KAYITLI alıcı" bloğu,
`inquiries-portal.test.tsx`.

### Skor ≠ yayın kapısı

`common/company/product-completion.ts` ikisini AYRI tutar:
- **skor** (0-100) yönlendirir, engellemez;
- **`productPublishBlockers`** engeller: ad, kategori, ≥100 karakter açıklama,
  ≥1 görsel, ≥1 anahtar kelime. Fiyat ve nitelikler kapıda YOK (meşru biçimde
  bilinmeyebilir).

Skoru kapı yapmak ters teper: "80 puan olmadan yayımlayamazsın" demek
kullanıcıyı puan için alan uydurmaya iter.

### Slug DONAR

Yayımlandıktan sonra ad değişse bile URL korunur — başlık düzeltmesi yüzünden
gelen bağlantıyı ve arama sıralamasını çöpe atmamak için.

### ⛔ WEB SİTESİNDEN ÜRÜN ÇEKME — BİLİNÇLİ OLARAK YAPILMAYACAK

Katalog doldurma sürtünmesini azaltmak için önerilmişti, **reddedildi**
(2026-09-02, kullanıcı kararı). Üç gerekçe:

1. **Sahiplik doğrulanamaz.** Kullanıcı rakibinin URL'ini yapıştırırsa onun
   fotoğraflarını ve açıklamalarını `cdn.rothern.com`'a kopyalayıp başka bir
   firma adı altında yayımlarız — o noktada YAYINCI biziz.
2. **Uydurulmuş veri ticari beyan olur.** Rastgele HTML'den AI çıkarımı makul
   ama yanlış fiyat/MOQ üretir; ürün sayfasındaki yanlış fiyat yazım hatası
   değil FİYAT TEKLİFİDİR.
3. **Prompt injection.** Canlı web sitesi bizim denetimimizde olmayan düşmanca
   bir yüzey; AI-1'in belge sınırı orada geçerli değil.

YERİNE: **kullanıcının YÜKLEDİĞİ katalog** (Excel/PDF). Dosyayı kullanıcı
veriyor → zımni sahiplik beyanı + kimin ne yüklediğinin kaydı. Boru hattı
zaten var (AI-1 PDF'i doğrudan okur); çıktı TASLAK olarak düşer, kullanıcı
onaylamadan yayımlanmaz.

> NOT: `common/website-import.ts` bu karardan ETKİLENMEZ — o, firmanın KENDİ
> sitesinden logo/OG görseli/hakkımızda metni çeken profil zenginleştirmesidir
> (SSRF korumalı, onboarding'de kullanıcının kendi girdiği adres). Ürün
> kataloğuyla ilgisi yok.

### Toplu ürün ekleme — İKİ KAYNAK, TEK YAZMA YOLU

| Kaynak | Uç | AI | Paket |
|--------|-----|-----|-------|
| Excel/CSV şablonu | `GET/POST company/items/import/{template,parse}` | ❌ | hepsi |
| Katalog PDF/foto | `POST company/ai/product-extract` | ✅ | Silver+ |

İkisi de **aynı** `ProductImportResult` üretir ve **aynı** `commit` ucundan
(`POST company/items/import/commit`) geçer. İki ayrı yazma yolu olsaydı biri
diğerinin kuralını kaçırırdı; bu yüzden AI yalnız SATIRLARI üretir, yazmayı
kullanıcının onayı yapar. Sütun sözleşmesi tek kaynak: `@rothern/shared`
`product-import.ts`. Dosya okuma sertleştirmesi (zip bombası, CSV tavanı, MIME
sniff, `.xlsm` reddi, katı base64) `common/files/spreadsheet-reader.ts`'e
çıkarıldı — yeni yol onu kullanır.

> ⚠️ ESKİ yol (`listing-item-import.service.ts`) hâlâ AYNI korumaların KENDİ
> kopyasını taşıyor. Bu, denetimde en sık tekrar eden hatanın ta kendisi:
> helper yazılır, çağrı yerlerinin bir kısmı bağlanmaz, iki hesap sessizce
> ayrışır. Bir güvenlik düzeltmesi buraya geldiğinde İKİ dosyaya da uygulanmalı
> (ya da o yol tek kaynağa taşınmalı — borç kaydı aşağıda).

**Model KATEGORİ KODU yazamaz.** Kod üretirse "39121999" gibi geçerli GÖRÜNEN
ama katalogda olmayan (ya da bambaşka ürüne ait) bir koda düşer ve ürün
sessizce yanlış dala bağlanır. Model yalnız Türkçe ürün tipi ifadesi
(`categoryHint`) yazar, kodu backend **katalogda arayarak** bulur; bulunamazsa
alan BOŞ kalır ve satır uyarı taşır. Kod gibi görünen ipucu sanitizer'da
düşürülür. (Aynı ilke: teklif içe aktarmada "eşleştirme KODDA".)

**Kategori kodu VARLIĞI doğrulanır** — biçim (8 hane) yetmez. Karşılığı olmayan
kod hem önizlemede işaretlenir hem YAZMA yolunda null'lanır: yoksa nitelik
mirası boş döner ama yayın kapısı `categoryId` dolu göründüğü için AÇIK kalırdı.

Ürünler **TASLAK** doğar: 500 satır tek tıkla vitrine düşmez ve yayın en az bir
görsel ister — görsel ne Excel'de ne katalog çıkarımında taşınır.

## Pazar Yeri (herkese açık vitrin) — 2026-09-02

Giriş YAPMAMIŞ ziyaretçiye açık ilan/talep vitrini + firma dizini.
**Yayın anahtarı KAPALI — İKİ yerde açılır, ikisi de fail-closed:**

| Nerede | Env | Etkisi |
|--------|-----|--------|
| Web (Vercel) | `NEXT_PUBLIC_MARKETPLACE_LIVE=true` | `/` "Çok Yakında"dan pazar yerine döner; rotalar 404'ten çıkar; robots/sitemap açılır |
| API (Render) | `MARKETPLACE_LIVE=true` | `/public/listings*` ve `/public/companies/directory*` 404'ten çıkar |

İkisi ayrı çünkü web anahtarı yalnız SAYFALARI kapatır; uç açık kalsaydı
`api.rothern.com/api/public/listings` adresini bilen veriye ulaşırdı. Yalnız
web açılırsa pazar yeri BOŞ görünür — görünür ve teşhis edilebilir bir hata,
sessiz sızıntının tersi. Env yoksa KAPALI; yalnız tam olarak `"true"` açar.

### GÖRÜNÜRLÜK ≠ İNDEKSLENME (2026-09-03)

Ürün sayfası (`/firma/<slug>/urun/<slug>`) önce pazar yeri anahtarına
bağlanmıştı. Sonuç: panel "vitrinde yayımlandı" diyor, verdiği bağlantı
**404**. Kullanıcı bunu canlıda buldu.

Ayrım şu: ürün, firmanın **zaten herkese açık** olan profilinin ALTINDA
yaşıyor — görünürlüğü profil kapısına bağlıdır (`publicProductWhere`).
Anahtarın koruduğu şey **indekslenmedir**, görünürlük değil:

| Yüzey | Pazar yeri anahtarı |
|-------|---------------------|
| `/firma/<slug>` profil · `:slug/products` · tekil ürün sayfası | ❌ tabi değil |
| Ürün **sitemap**'i · `/urunler` dizini · `/public/products*` | ✅ tabi |
| Ürün sayfasının `robots` etiketi | anahtar kapalıyken `noindex, follow` |

Sözleşme: `public-product.spec.ts` guard metadatasını okur — firma-altı uçlarda
`MarketplaceLiveGuard` OLMAMALI, sitemap'te OLMALI.

`/public/companies/:slug` ve `/public/companies/sitemap` anahtara TABİ DEĞİL —
public profil özelliği pazar yerinden eskidir, onu kapatmak var olan bir
özelliği geri almak olurdu.

Açılış geri alınamaz bir dış etki olduğu için tetiği `git push` değil bilinçli
bir env kararıdır.

### Rotalar

| Rota | Ne | Render |
|------|-----|--------|
| `/` | pazar yeri anasayfası (envanter + arama + sektörler) | ○ statik, ISR 60sn |
| `/alim-talepleri` | ALIM listesi, süzgeçli (`/satilik` → `/urunler` 308) | ○ statik, ISR 60sn |
| `/urunler` | ÜRÜN dizini (firmalar arası vitrin) | ○ statik, ISR 5dk |
| `/urunler/kategori/<kod>-<ad>` | kategori kırılımı — long-tail | ● SSG, ISR 10dk |
| `/tedarikciler` | firma dizini — **GİRİŞ GEREKTİRİR** | ƒ dinamik, `noindex` |
| `/talep/<slug>` | tekil kayıt (`/ilan/*` → `/urunler` 308) | ƒ dinamik, ISR 120sn |
| `/nasil-calisir` | ESKİ pazarlama anasayfası (içerik birebir taşındı) | ○ statik, ISR 1sa |

Slug: **numara ÖNDE** (`/talep/rot-000042-celik-boru`). Ayrıştırma tek regex'e
iner; numara sonda olsaydı başlığı "…-rot-9" ile biten kayıt sessizce YANLIŞ
ilanı açardı. Eski slug **308** ile kanoniğe yönlenir. Sitemap ve sayfanın kanonik etiketi AYNI `listingPath`ten
üretilir — ayrı kurulsalardı Google ikisini de güvensiz sayardı.

### ÜÇÜNCÜ sözcük çerçevesi

Ziyaretçinin ne alıcılığı ne satıcılığı var; panelin iyelik kipli sözlüğü ona
uymaz. Tek kaynak `apps/web/src/lib/public/marketplace.ts`:

| kayıt | satınalma | satış | **pazar yeri** |
|-------|-----------|-------|----------------|
| ALIM | "Taleplerim" | "Açık Talepler" | **"Alım Talepleri"** |
| ÜRÜN | — | "Ürünlerim" | **"Ürünler"** |

**Ürün ≠ ilan.** İlan süreli bir işlemdir, ürün firmanın kalıcı vitrinidir;
ziyaretçiye ikisine de "ilan" demek, kapanmayan bir kaydı süreli sandırır.

### İki kapı — vitrin ve indeks AYRI

Tek kaynak `common/company/listing-visibility.ts`
(`marketplaceListingWhere`, `marketplaceIndexableWhere`):

```
VİTRİN = PUBLIC ∧ company.publicListingsEnabled ∧ firma aktif/bloksuz
         ∧ publishedAt ∧ embargo geçmiş
         ∧ statü ∈ {OPEN, IN_AWARD, IN_AWARD_APPROVAL, AWARDED, CLOSED_NO_AWARD}
İNDEKS = vitrin ∧ listing.publicIndexable ∧ company.publicEnabled ∧ statü=OPEN
```

`CLOSED` (admin moderasyonu) ve `CANCELLED` vitrine bile ÇIKMAZ — moderasyonla
kapatılan ilanı yayımlamak moderasyonu anlamsız kılardı. Kapanmış ilan sitede
DURUR (gelen bağlantı kırılmasın) ama `noindex` alır ve sitemap'ten düşer.

İndeks kapısında `company.publicEnabled` **YOKTUR** (2026-09-02 revizyonu): o
bayrak firmanın PROFİL sayfasını yönetir, ilan sayfası ise sahibinin adını hiç
göstermiyor. Kimlik açmayan bir sayfayı kimlik rızasına bağlamak, hiçbir şeyi
korumadan kapsamı daraltmak olurdu.

### İLAN SAHİBİ ANONİM (2026-09-02)

Herkese açık ilan/talep sayfasında firma **adı, logosu ve profil bağlantısı
GÖSTERİLMEZ**; `PUBLIC_LISTING_SELECT` bu kolonları hiç çekmez, JSON-LD'de de
`Organization` düğümü yoktur (yapısal veri sayfada olmayanı söyleyemez —
söylerse gizlemeye çalıştığımız kimliği makine-okunur biçimde geri verir).

Gerekçe: bir alım talebinde "kim alıyor" doğrudan rekabet istihbaratıdır
("X firması 40 ton çelik boru arıyor" = X'in üretim planı). Panelin kendi
maskeli önizlemesi de aynı kararı veriyor — STANDART üye PUBLIC ilanda
`owner`ı görmüyor; anonim ziyaretçi ücretsiz üyeden çoğunu göremez.

Gösterilen: **şehir, ülke, sektör, faaliyet tipi** — kimlik değil nitelik,
teklif verecek tarafın lojistik/uygunluk kararı için gerekli. Kenar çubuğunda
"Doğrulanmış alıcı/tedarikçi" + "Firma kimliği yalnız kayıtlı kullanıcılara
açıktır" ibaresi (eksik değil KURAL olduğu anlaşılsın diye).

Firma adının herkese açık göründüğü tek yer `/firma/<slug>` profilidir: opt-in
(`publicEnabled`) ve satılan bir özellik (BRONZ+ faydası). **Firma dizini
`/tedarikciler` giriş gerektirir** — uç `company/directory`,
`CompanyJwtAuthGuard` arkasında; kapı çerezin varlığı değil sunucu kararıdır.
Sayfa `noindex`, sitemap ve robots Allow dışı; menüdeki bağlantı duruyor
(anonim ziyaretçi kayıt ekranına düşer — huni, çıkmaz değil).

### Kapalı zarf YAPISAL

`dto/public-listing.projection.ts` `PUBLIC_LISTING_SELECT` bir **beyaz
liste**: listelenmeyen kolon Prisma'dan hiç dönmez, mapper'da unutulsa bile
sızamaz. Sözleşme testi `public-marketplace.spec.ts` yanıt ağacını gezip
yasaklı anahtar arar (gerçek teklif yazıp tutarının çıktıda geçmediğini
doğrular).

DIŞARIDA: teklifler **ve teklif SAYISI** (md. 3 sayıyı da yasaklıyor) ·
`targetPrice` (bayrak açık olsa bile — izin TEDARİKÇİYE verildi) ·
`minPrice`/`minUnitPrice` (pazarlık tabanı; `buyNowPrice` DAHİL, o kamuya açık
satış beyanı) · `terms`/`paymentNote` (serbest metin, IBAN/telefon taşıyabilir)
· `logistics`/adresler · `internalNotes` · `createdById` · cuid `id`'ler.
`description` DAHİL — sayfanın içeriği odur.

### Maskeli freemium ile ilişki

`listingBidEligibility` PUBLIC ilanı STANDART üyeye maskeli gösteriyor:
`description`, `owner.name`, `keywords`, `terms`, `paymentNote`, fiyatlar
gizli. Pazar yeri bu maskeyle büyük ölçüde HİZALI — sahip adı, `terms`,
`paymentNote` ve taban fiyat orada da yok.

Kalan fark: **`description` ve `keywords`** anonim ziyaretçiye açık, STANDART
üyeye kapalı. Bilinçli: açıklama sayfanın İÇERİĞİDİR, onsuz ince içerik
üretirdik ve pazar yerinin varlık sebebi kalmazdı. Küçük bir tutarsızlık
sürüyor (çıkış yapan açıklamayı görür, ücretsiz üye görmez); maskeyi PUBLIC
ilanlarda tümden kaldırmak — kapıyı "görmek"ten "teklif vermek"e taşımak,
zaten BRONZ+/KYC istiyor — bunu da kapatır. Yayın öncesi verilecek karar,
`docs/launch-checklist.md` § Pazar yeri açılışı.

### Ürün dizini — süzgeç YOLDA (2026-09-02)

Ürün kategori süzgeci sorgu parametresi DEĞİL yol parçasıdır
(`/urunler/kategori/39000000-elektrik-malzemeleri`). İki kazanç:

- sayfa **statik üretilebiliyor** (`generateStaticParams`, facet listesinden —
  yalnız ÜRÜNÜ OLAN kategoriler; 158 bin kategoriyi üretmek boş sayfa yığını
  ve "ince içerik" cezası demekti),
- her kategori **kendi indekslenebilir adresini** alıyor; long-tail'in tamamı
  buradan geliyor.

Kod ÖNDE (`<kod>-<ad>`) — ilan slug'ıyla aynı gerekçe: ayrıştırma tek regex'e
iner, ad sonda olsaydı "…-39000000" ile biten bir kategori adı sessizce yanlış
kodu verirdi. Kanonik olmayan yol **308** ile kanoniğe döner; sitemap ve
kanonik etiket AYNI `categoryPath()`ten üretilir.

**İlan listelerinde süzgeç hâlâ sorguda** — aynı dönüşüm oraya da yapılmalı
(`/alim-talepleri/kategori/<kod>`). Desen artık kurulu, mekanik iş.

### Nitelik süzgeci (2026-09-02)

Kategori kırılımının altındaki asıl ayrım: `?nitelik=malzeme:Çelik&nitelik=standart:EN`
(tekrarlanan parametre, tavan 6). Tek parametrede birleştirilmedi — değerler
kategori tanımından gelen serbest metin, "|" gibi bir ayraç ilk ayraçlı
seçenekte sessizce bölerdi.

| Kural | Neden |
|-------|-------|
| Tekli (dize) VE çoklu (dizi) değer birlikte eşleşir | Aynı anahtar iki biçimde saklanıyor; tek biçim arasak süzgeç kategorinin yarısında sessizce boş dönerdi |
| Nitelik facet'i YALNIZ kategori seçiliyken | Nitelikler kategoriye özgü; kategorisiz listede "IP sınıfı" satırı ürünlerin çoğunda tanımsız |
| Yalnız kapalı listeler sayılır (SELECT) | Serbest metin/sayıda her ürün kendi değerini üretir, sayım anlamsız |
| Değeri olmayan nitelik listede YOK | Hiçbir şeyi daraltmayan süzgeç satırı gösterilmez |
| Tanımlar MİRASLA gelir | Panelde sorulanla aynı kaynak (`resolveCategoryAttributes`) — sorulan alanla süzülen alan ayrışamaz |

**Bilinen sınır:** `attributes` JSON'ında indeks YOK. Kapı (`publicProductWhere`)
kümeyi zaten daraltıyor ve canlıda ürün sayısı üç haneli değil; ölçmeden GIN
indeksi eklemek erken olur. Ürün sayısı büyüdüğünde ilk bakılacak yer burası.

### Ürün dizini kapısı

`common/company/public-profile-gate.ts` `publicProductWhere()` — TEK KAYNAK.
Üç çağıran: firma altı ürün listesi, ürün sitemap'i, firmalar-arası dizin.
Kopyalansaydı ayrışması SESSİZ olurdu: paketi biten firmanın ürünü dizinde
kalır, profili 404 döner — ziyaretçi çıkmaz bağlantıya tıklar.

Dizin kartı **firma adını TAŞIR** (ilan kartının tersi). Sözleşme:
`public-product-index.spec.ts`.

## Migration Durumu

**Bekleyen YOK** — `migrate status` "up to date" (2026-09-02, 71 migration).
Kategori geçişinin iki migration'ı canlıya uygulandı:
- `20260902100000_category_in_discovery` — `Category.inDiscovery` kolonu
- `20260902100100_category_search_trgm` — `pg_trgm` + `searchText`/`nameTr`
  GIN indeksi (canlıda doğrulandı: `Bitmap Index Scan`, 1,35 ms)
- `20260902130000_marketplace_public_flags` — `Company.publicListingsEnabled`
  + `Listing.publicIndexable` (iki ADD COLUMN, sabit DEFAULT → kilit anlık)
- `20260902160000_category_image_url` — `Category.imageUrl` (nullable)
- `20260902170000_product_catalog` — `CompanyItem` vitrin kolonları +
  `CategoryAttribute` tablosu + iki enum (tablo 0 satır → kilit anlık)

> ⚠️ **`render.yaml` `autoDeploy: true`** — main'e push edilen API kodu prod'a
> KENDİLİĞİNDEN gider. Şema kullanan bir değişikliği push ettiysen migration'ı
> da AYNI turda uygula, yoksa canlı kod olmayan kolonu okur ve o uç 500 döner.
> Komut fail-closed: `ALLOW_REMOTE_MIGRATION=1 pnpm --filter @rothern/db migrate:deploy`
> (`assert-migration-target.ts` uzak host'u onaysız reddeder).

## Geliştirme Notları
- **NestJS CLI watch modu WSL'de bozuk.** `apps/api/package.json` `dev` script'i `concurrently` + `tsc -w` + `nodemon` kullanır. `nest start --watch` KULLANMAYIN.
- **Prisma `.env` symlink:** `packages/db/.env` → `../../.env`. Migration komutları için gerekli.
- **Tailwind v4:** `tailwind.config.ts` YOK, tema `globals.css`'te `@theme { ... }` ile.
- **`.env`'de `INITIAL_ADMIN_*`** seed için kullanılır (production'da kaldırılır).
- **Schema değişikliği:** `pnpm --filter @rothern/db migrate` (dev) → `migrate:deploy` (prod). Manuel SQL gerektiğinde `prisma/migrations/<timestamp>_<ad>/migration.sql` oluştur (Prisma uygulanan migration'ları DB'deki `_prisma_migrations` tablosunda izler — güncellenecek bir dosya YOKTUR). **Her yeni migration'dan ÖNCE `docs/migration-safety.md` kontrol listesini oku** (veri kaybı / kilit / rollback = PITR+snapshot kuralları).
- **DB cleanup:** `pnpm --filter @rothern/db cleanup-pending-relations` legacy `PENDING_TENANT_APPROVAL` kayıtlarını ACTIVE'e çevirir.
- **gitleaks pre-commit hook:** Repo `.githooks/pre-commit` ile staged sır taraması yapar (versiyonlanmış, husky yok). Klonladıktan sonra bir kez aktive et: `git config core.hooksPath .githooks`. gitleaks binary gerekir (kur: `~/.local/bin`); yoksa hook fail-closed engeller. Acil atlama: `SKIP_GITLEAKS=1 git commit ...`.

## Token İzolasyonu
JWT payload `type` field'ıyla doğrulanır. Tenant token → admin/supplier endpoint = 401 "Geçersiz token tipi". Aynı şekilde diğer kombinasyonlar. Cross-token testleri yapıldı.

---

## Test & Kalite Durumu

- **Test sayısı (2026-09-01):** API **152 suite / 1371 test** (+2 skipped) · web **57 dosya / 354 test** · admin **15 / 79**. Hepsi yeşil.
  - *Eski not kaldırıldı:* "534 test, bcrypt mock'ları kırık, test paketi refactor edilmeli" iddiası BAYATTI — `bcrypt` repoda hiç geçmiyor (Supabase Auth geçişi 2026-05-20'de tamamlandı), auth spec'leri geçiyor.
- **Coverage (geçiş öncesi):** Kritik dosyalarda %85-100 (auth, permissions, controllers)
- **Test DB — LOKAL izole Postgres (varsayılan):** integration testleri artık
  `docker-compose.test.yml`'daki lokal `postgres:17`'ye koşar (Supabase 17.6 paritesi),
  remote Supabase'e DEĞİL. Bağlantı `apps/api/.env.test` (lokal DB URL) → `test/
  integration/env.ts` (kök `.env`'den önce yükler, `rothern_test` şeması ekler, remote
  host'a fail-fast). Migration'lar jest globalSetup'ta `migrate deploy` ile uygulanır.
- ✅ **"Tek tek koş" workaround'u KALKTI — ama kök neden başkaymış.** `40P01`
  TRUNCATE deadlock **lokal izole DB'de + `maxWorkers:1` ile de tekrarlandı** (ilk
  varsayım "paylaşımlı remote kaynaklı" YANLIŞTI). GERÇEK kök neden: Prisma'nın
  varsayılan çoklu-bağlantı havuzu — `truncateAll`'ın TRUNCATE'i (AccessExclusiveLock)
  bir bağlantıda koşarken önceki testten sızan fire-and-forget yazım (bildirim/FX →
  FK RowShareLock) başka bağlantıda ters kilit sırası tutunca deadlock. **FIX:
  `test-db.ts` PrismaClient'ında `connection_limit=1`** → tüm sorgular tek bağlantıda
  serileşir, TRUNCATE hiçbir yazımla yarışamaz → deadlock yapısal olarak imkânsız.
  Testler zaten seri (maxWorkers:1) → performans kaybı yok. Ağır suite'ler artık
  **BİRLİKTE** koşar (bugün 147 suite / 1295 test yeşil, 0 deadlock). (Remote'a koşma;
  env.ts reddeder.) Not: lokalde deadlock ~1sn'de tespit edilip abort olur (remote'ta
  paylaşımlı-instance + yabancı idle bağlantı yüzünden 56 dk HANG'e dönüşüyordu).
- **Komutlar:**
  ```bash
  pnpm --filter @rothern/api test:db:up    # lokal test PG'yi başlat (docker, bir kez)
  pnpm --filter @rothern/api test          # TÜM spec'ler birlikte (lokal, deadlock yok)
  npx jest <spec>                          # tek spec (hızlı geri bildirim)
  pnpm --filter @rothern/api test:cov      # +coverage
  pnpm --filter @rothern/api test:db:down  # PG'yi durdur
  ```
  (Docker Desktop WSL entegrasyonu gerekir. PG kapalıysa testler net "docker compose
  up" hatası verir — sessizce remote'a düşmez.)
- **Kapsam:** RBAC matrisi, IDOR senaryoları, multi-tenant scope, auth attack (timing-safe, malformed JWT, expired token), DTO validation, state machine geçişleri.

## Güvenlik Durumu

Yapılan audit'ler:
- ✅ Auth/IDOR/RBAC E2E coverage
- ✅ Plain text parola sızıntısı (seed.ts) kapatıldı
- ✅ Yutulan catch'ler temizlendi
- ✅ Health endpoint DB ping (Redis kaldırıldıktan sonra)
- ✅ Console.log → NestJS Logger (production)
- ✅ Structured logger (Pino + redact) + Sentry entegre; kritik-audit kaybı + webhook imza hataları `reportToSentry()` ile Sentry'e bağlı (fırlatılmayan logler SentryGlobalFilter'a takılmıyordu)
- ✅ httpOnly cookie auth + CSRF double-submit (tamamlandı — token localStorage'dan kaldırıldı)
- ✅ CSP: API helmet sıkı (`default-src 'none'`); web+admin nonce tabanlı `script-src 'self' 'nonce-<per-request>' 'strict-dynamic'` (unsafe-inline/eval kaldırıldı, src/middleware.ts + force-dynamic; style-src 'unsafe-inline' bilinçli kalır)
- ✅ **Denetim 2026-08-23 Parça 1 (Kimlik&Oturum) Dalga A** (rapor `docs/audit-2026-08-23-part1-auth.md`): `parseCookies` toleranslı (bozuk `%` çerez 500/WS-çökme kapandı) + WS handshake tamamen try içinde + `process.on('unhandledRejection')` ağı; logout yanıtında kayan-oturum atlanır (`markAuthCleared`); gerçek istemci IP `resolveClientIp` (`TRUST_CF_CONNECTING_IP=true` prod — api Render'ın Cloudflare'i arkasında; throttle tracker + `@ClientIp()`); Sentry requestData cookies/headers/body KAPALI; access-log URL token maskesi (`maskSensitiveUrl`); **admin `tokenVersion`** (parola/2FA değişimi eski oturumları düşürür, yanıt taze `token` döner) + admin TOTP sırrı şifreli (`common/auth/totp-secret-cipher.ts`, opsiyonel `TOTP_ENC_KEY`); kuruculuk devri hedef aktif + `permissionsOverride` temizlenir; e-posta kodu hesap-bazlı 5/saat üretim tavanı + atomik deneme sayacı; Supabase Auth 429/5xx → 503 (+Sentry), "parola hatalı" değil. Kalan LOW/INFO + Dalga B raporda.
- ⏳ Bekleyen: alert webhook, audit_logs populate; fast-follow: log drain, frontend Sentry
- 🚀 **Launch checklist:** Prod deploy öncesi ödeme/plan + env + doğrulama adımları → **`docs/launch-checklist.md`**. Kritik: `SENTRY_DSN` boşsa error tracking + kritik-audit/webhook alarmları tümüyle pasif (sessiz no-op — tek fail-open servis); Supabase/R2/Resend env'leri eksikse app boot etmez (fail-closed).

---

## Tamamlanan Aşamalar (Özet)

Detaylı geçmiş için: `docs/history/CHANGELOG.md`

- **V1 Foundation (A → E.7.D):** Backend registration, admin application yönetimi, tenant tedarikçi yönetimi, supplier paneli, multi-tenant davet kabul, tender wizard, bid/eleme/kazandırma, sipariş, settings (5 alt sayfa), kullanıcı yönetimi, firma tercihleri, onay akışı runtime.
- **V1.5:** Sipariş workflow + approver fallback, sipariş PDF export, onay reminder cron, data cleanup.
- **V2-1 → V2-6:**
  - V2-1: Resend webhook (e-posta delivery tracking)
  - V2-2: Cloudflare R2 + dosya upload (presigned URL)
  - V2-3: Multi-currency + TCMB cron integration
  - V2-4: 1-on-1 messaging (Messenger-style)
  - V2-5: Tedarikçi paneli redesign
  - V2-6: UNSPSC kategori sistemi — bkz. aşağıdaki **Kategori Kataloğu**
    bölümü (2026-09-01'de Europages ölçeğine genişletildi).
- **Polish:** Liste sayfaları UX, admin paneli + KPI, form hata TR, mobile, e-posta QA.

---

## Bekleyen / Yapılacaklar

> **Sürüm/faz ayrımı YOK.** V1.5/V2/V2.7/V3 gibi kademeler kaldırıldı — her şey tek backlog, sıraya göre yapılır. Aşağıdaki gruplar yalnızca konuya göredir, öncelik/erteleme değil.

**Ürün özellikleri**
- ✅ **Tedarikçi keşfi + dış davet (2026-07-27):** "AI ile daha fazla eriş" —
  (A) dizin keşfi: kategori-eşleşmeli bağlantısız BRONZ+ firmalar → bağlantı
  daveti (`/company/ai/supplier-discovery`); (B) web keşfi: Gemini **Google
  Search grounding** (`webSearch` flag; grounding+responseSchema BİRLEŞMEZ →
  2 aşama: araştırma metni → şemalı JSON; e-posta yalnız açıkça yayınlanmışsa,
  kullanıcı doğrular); (C) dış davet e-postası: referral altyapısı + `listingId`
  bağlamı ("X sizi Y satın alma talebine davet etti", tender_external_invite şablonu) —
  frenler: günlük 20/firma, adrese ömür boyu 1, opt-out (`referral_opt_outs` +
  `/davet-kapat` + public GET endpoint), kayıtlı-adres skip; kayıt token'la
  tamamlanınca bağlantı ACTIVE + satın alma talebine otomatik davet (acceptReferralInvites).
  Giriş noktaları: wizard Davetliler adımı + satın alma talebi detay ⋮ menüsü.
- **Yurtdışı şirket kaydı — ÇEKİRDEK BİTTİ (Faz 1-3):** ülke seçimi (COUNTRIES, 98 ülke) + ülke-farkında vergi/adres doğrulama (TR strict VKN/TCKN, yabancı gevşek) + onboarding UI (alıcı+tedarikçi). Şema: Tenant/Supplier.country+stateRegion. KALAN: (a) i18n — UI hâlâ Türkçe (next-intl greenfield, ayrı büyük iş); (c) yabancı belge/KYB kontrolü = mevcut admin onayı + belge (ödeme sağlayıcısı KYB yapmaz çünkü sanal POS düşünülüyor). **(b) VIES YAPILDI** — `POST /company-auth/vies-check` + onboarding'de "VIES ile doğrula" butonu çalışıyor; not bayattı. AB kayıt kapısıyla kapalı olduğu için şu an erişilemez, AB açılınca hazır.
- STANDARD → PREMIUM upgrade akışı + ödeme (Iyzico/Stripe) + escrow
- Açık satın alma talebi (PUBLIC) + tedarikçi başvuru sistemi
- Kazandırma geri alma (un-award) — SONRAYA bırakıldı (canlı siparişlere dokunan riskli iş). NOT: eleme geri almaya gerek yok — elenen tedarikçi zaten baştan yeniden teklif verebiliyor (mevcut davranış kabul edildi).
- WebSocket real-time bildirim
- Admin ek kontroller: impersonate (güvenlik değerlendirilecek), iade/refund, doğrudan kullanıcı ekleme, CSV export, dahili not, global arama

**Altyapı / production**
- Hosting / production setup (Coolify + Hetzner, Chromium pre-installed Docker image — PDF)
- Resend domain doğrulaması + webhook tracking
- alert webhook, audit_logs populate (Structured logger/Sentry/CSP ✅ tamamlandı — bkz. Güvenlik Durumu)

**Teknik borç / temizlik**
- ~~Test paketi refactor~~ — **TAMAMLANDI**, madde kaldırıldı (bcrypt kalıntısı yok, suite yeşil).
- **Rig stub gotcha (tekrar eden):** yaygın enjekte edilen bir servise YENİ bağımlılık/çağrı eklendiğinde elle kurulan test rig'leri kırılır — bu denetim boyunca **8 kez** tekrarladı. İki biçimi var: (a) eksik stub → `x is not a function`, (b) **constructor SIRASI kayması** → yanlış nesne enjekte olur ve hata ancak o bağımlılığa ULAŞAN bir testte çıkar (sessiz). Böyle bir değişiklikten sonra **TAM api suite'i** koşulmalı; rig'ler mümkünse paylaşılan bir yardımcıdan kurulmalı.
- **Tablo okuma tek kaynağı yarım:** `common/files/spreadsheet-reader.ts` ürün
  içe aktarma için çıkarıldı; `listing-item-import.service.ts` hâlâ kendi
  kopyasını kullanıyor. Güvenlik düzeltmesi tek dosyaya inerse diğer yol açık
  kalır — taşınmalı (spec'leri var, mekanik iş).
- `Supplier.sectors` (kürasyonlu) deprecated kolon kaldırılmalı (migration).
- `@rothern/email` değişince `pnpm --filter @rothern/email build` şart — CI'da otomatikleşmeli.

**AI katmanı**
- ✅ **Faz AI-4 (2026-07-27): Asistan AKSİYON çerçevesi (Faz 1) BİTTİ** —
  "rol bazında her şey, ciddi işlerde onay" modeli. Model ASLA doğrudan
  yazamaz: `request_*` araçları yalnız DOĞRULANMIŞ `pendingAction` üretir
  (AiChatSession.pendingAction, tek kullanımlık, 10 dk TTL); yürütme YALNIZ
  kullanıcının confirm endpoint'iyle (`POST .../actions/:id/confirm`, CSRF'li)
  — prompt-injection zinciri yapısal kırık. Yetki = kullanıcı yetkisi (execute
  mevcut servisleri kullanıcı kimliğiyle çağırır; rol/tier/KYC kapıları aynen).
  Onay kartı içeriği backend özeti (model metni değil); critical'da vurgulu UI.
  Aksiyonlar: `request_send_invites` (normal) + `request_publish_tender`
  (critical; davetli-kapalı yayın → en az 1 bağlantılı davetli kodu zorunlu,
  varsayılan teslimat adresi otomatik) + Faz 2: `request_eliminate_bid`
  (normal; yalnız SUBMITTED) + `request_award_tender` (critical, TOPLU —
  kalem-bazlı sayfaya yönlendirilir; onay akışı devredeyse şirket onayına
  düşer, kararı model DEĞİL kullanıcı verir) + Faz 3: `request_place_bid`
  (critical, yalnız satis portalı; TÜM kalemler fiyatlı + teslim tarihi
  zorunlu, amount=Σ hesaplanır — award nöbetçisi uyumlu; belge/zorunlu-soru
  isteyen satın alma talebi sayfaya yönlendirilir; fiyatı model uyduramaz) +
  `request_mark_order_received` (normal, yalnız satinalma; IN_DELIVERY→
  DELIVERED). Diğer sipariş adımları (gönderim/ödeme/tamamlama/iptal) bilinçli
  araçsız — sayfaya yönlendirilir. Audit: `ai.action_executed` via metadata'lı.
- ✅ **Faz AI-3 (2026-07-24): Asistan yenileme BİTTİ** — (1) belge yükleme yeni talep sayfasında belirgin kart + asistan composer'ında 📎 (asistan içinden belge→taslak); (2) asistan UI modernize (marka gradient, avatar/timestamp, araç rozeti, öneri chip'leri, taslak kartı); (3) **konuşarak satın alma talebi açma**: `propose_tender_draft` non-binding araç — model çekirdek alanları toplar, eksik zorunluları sırayla sorar; taslak `AiChatSession.tenderDraft`'ta birikir (belge+konuşma birleşimi, `mergeDrafts`); yanıtta `tenderDraft` payload → "Satın Alma Talebi formunu aç" → `sessionStorage["ai-tender-draft"]` + `yeni?ai=1` → wizard prefilled. SATIN ALMA TALEBİ AÇILMAZ (kategori AI seçemez; kullanıcı formda seçip Yayınla — BAĞLAYICI-YAZMA-YOK korunur). Vertex prod'da çalışıyor; teşhis mesajı sadeleştirildi.
- ✅ **Faz AI-2 (2026-07-24): Asistan sohbeti BİTTİ** — `POST /company/ai/assistant/message` (+sessions CRUD); asistan sistemin OKUMA servislerini kullanıcı kimliğiyle IN-PROCESS çağırır (ham DB YOK) → yetki katmanı (rol/tier/görünürlük/kapalı-zarf/Faz O) bedava çalışır. 6-7 okuma aracı (Gemini function-calling), BAĞLAYICI YAZMA YOK (sayfaya yönlendirir). Portal-yönlü kısıt (SA satış/ST alım verisi göremez), araç hatası → nötr `unavailable` (bilgi sızmaz), kayan pencere (son 8 tur + tek özet), 90 gün TTL cron, kullanıcıya-scope'lu kalıcı oturum. Frontend: sağ-alt floating launcher + slide-over (Silver+ ∧ SA/ST). GOTCHA: Gemini 3 function-calling **thought signature** ZORUNLU — modelin functionCall part'ındaki `thoughtSignature` geri beslemede korunmazsa 400; ayrıca fnResponse turundan sonra boş user turu EKLEME (mesajı history'ye koy, prompt="").
- ✅ **Faz AI-1 (2026-07-24): Belge/fotoğraf → satın alma talebi formu BİTTİ** — `POST /company/ai/tender-extract` (+uploads/url, +tender-refine); girdi yönlendirici (metinli PDF→TEXT bedava çıkarım; taranmış/karışık PDF→Gemini'ye DOĞRUDAN inlineData ~258 tok/sayfa; foto→sharp ≤1500px, HEIC destekli); sayfa tavanı `AI_MAX_PAGES=20`; "bir kez oku, JSON'la konuş" (refine belgeyi yeniden okumaz); AI çıktısı shared-limits sanitizer'dan geçer (geçmeyen null+flag), vision'da miktar/birim/tarih/para birimi varsayılan işaretli; KDV-dahil uyarısı; prompt-injection sınırı (<belge> VERİ + şema-kısıtlı çıktı); wizard'a giriş noktası "Belgeden Doldur (AI)" + AiFlagsBanner + refine kutusu. AI satın alma talebi AÇMAZ — oluşturma normal kapılardan. NOT: `pnpm test` artık `NODE_OPTIONS=--experimental-vm-modules` ile koşar (pdfjs fake-worker dynamic import); tek spec koşarken de bu env gerekli: `NODE_OPTIONS=--experimental-vm-modules npx jest <spec>`.
- ✅ **Faz AI-0 (2026-07-24): AI altyapısı BİTTİ** — Gemini adapter (sağlayıcı-soyut `BaseAiProvider`), USD-bazlı firma bütçesi (Silver $6 / Gold $25, takvim ayı UTC), ön-rezervasyon + FOR UPDATE (yarış kapalı), tavanlar (kullanıcı %50, günlük %25, istek-başı %5, premium alt-bütçe %20), model yükseltme = KOD kararı (eşik/feature/retry — kullanıcı seçemez), `/company/ai/usage` + `ayarlar/ai-kullanim` ekranı (yalnız yüzde). `GEMINI_API_KEY` yoksa AI kapalı (503, prod'da gürültülü); fiyat tablosu `apps/api/src/modules/ai/ai.config.ts`, her satır costUsd snapshot. AI-1/AI-2 özellikleri `AiService.callAi` kapısından geçecek.
- ✅ **Excel ile kalem içe aktarma — Faz 1 (2026-08-22):** AI'sız, deterministik, her pakete açık. `GET /company/listing-item-import/template` (xlsx: Kalemler + Nasıl Doldurulur + Örnek; (taban/hemen-al sütunları satış ilanıyla birlikte kaldırıldı)) + `POST .../parse` (base64 gövde ≤5MB, xlsx/csv, yalnız ÖNİZLEME döner — satır-hata listesi; yazmaz). Sütun tanımı TEK KAYNAK `@rothern/shared` `item-import.ts` (başlık/alias/limit). Web: Kalemler adımında "Excel ile İçe Aktar" (önizleme → ekle/değiştir). AI "Belgeden Doldur" artık serbest Excel/CSV'yi de okur (router: sheet→metin tablo, TEXT yolu). **Faz 2 (2026-08-22) BİTTİ — tedarikçi fiyat içe aktarma:** `GET /company/listings/:id/bid-import/template` (satın alma talebine özel xlsx: kalemler ön-dolu + GİZLİ ItemId, yalnız fiyat/para birimi/teslim/not açık; AI'sız, her paket) + `POST .../bid-import/parse` (ItemId ile KESİN eşleme) + `POST /company/ai/bid-price-extract` (Silver+, feature `bid_price_extract`; model yalnız belge SATIRLARINI okur, fiyat uyduramaz; EŞLEŞTİRME KODDA `bid-matching.ts`: kod→ad→Dice/kapsama benzerliği ≥0.85 high / ≥0.60 medium / model ipucu ≥0.35; toplam÷miktar türetme, miktar/birim/para birimi/KDV uyarıları; teslim metni→BidDeliveryTime). Sözleşme `@rothern/shared bid-import.ts` (`BidImportResult`: her kalem için match + unmatchedDocRows + notices). Web: teklif-ver "Kalem Fiyatları" başlığında "Excel Şablonu ile Fiyatla" + "Belgeden Fiyatla (AI)" → tek önizleme dialog'u (güven rozeti, elle eşleme, uygula-kutusu) → yalnız itemState dolar; gönderme normal akış. Hiçbir uç teklif YAZMAZ.
- AI agent layer (event-bus, MCP entegrasyonu, action endpoint'leri `/api/agents/v1/...`)
- "Tercihlerimi Getir" preset, "Önceki Satın Alma Taleplerinden Ekle" template
- Akıllı şartname motoru, manipülasyon tespiti

---

## Claude Code Çalışma Kuralları

**Görev kapsamı:**
- "Kritik dosyalar" = auth, ödeme, multi-tenant scope, state machine olan dosyalar
- Coverage hedefi: kritik dosyalarda %80, diğerlerinde zorunlu değil
- Scope dışı testler: Puppeteer (PDF), R2 integration, webhook'lar

**Çalışma şekli:**
- `/loop` KULLANMA, her görev tek seferde bitsin
- "Doygunluğa ulaştı" / "scope dışı" dediğinde **DUR**, yeni tur açma
- Üretim kodunu değiştirmeden önce **onay bekle**
- Her büyük görev başında **plan çıkar, onay bekle**, sonra uygula
- Büyük dosyaları (>1000 satır) okurken modül modül ilerle, hepsini tek seferde context'e yükleme

**Yapma:**
- Yeni dependency eklerken sormadan ekleme
- Production secret'ı (.env) plain text yazma/loglama
- "Refactor edeyim mi" deyip kapsamı genişletme — sadece istenen iş
- `--dangerously-skip-permissions` ile riskli komut çalıştırma (rm -rf, force push, db drop)

---

## Git
- Repo: `git@github.com:ugur-062/rothern.git`
- Branch: `main`
- Her özellikten sonra commit + push.
- WIP commit'leri OK (oturum sonlarında), ama main'e push etmeden önce squash veya rebase düşün.
