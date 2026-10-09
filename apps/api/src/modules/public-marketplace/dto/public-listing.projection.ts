import { Prisma } from "@rothern/db";
import { listingSlug, visibleCategoryIds } from "@rothern/shared";

/**
 * HERKESE AÇIK İLAN YANSITMASI — kapalı zarfın YAPISAL güvencesi.
 *
 * Buradaki kural elle uygulanan bir disiplin değil, tipin kendisi: servis
 * SADECE `PUBLIC_LISTING_SELECT` ile sorgular ve SADECE `toPublicListing`
 * çıktısını döndürür. Prisma `select`'i beyaz listedir — listelenmeyen kolon
 * sorgudan HİÇ dönmez, dolayısıyla mapper'da unutulsa bile sızamaz.
 * `public-marketplace.spec.ts` yanıt ağacını gezip yasaklı anahtar arar; bu dosyaya alan eklerken o test de düşünülmelidir.
 *
 * ── DIŞARIDA BIRAKILANLAR ve GEREKÇELERİ ──────────────────────────────────
 *
 * `bids` / teklif sayısı / teklif veren kimlikleri
 *   Kapalı zarf (Aracılık Sözleşmesi md. 3): teklif verenler birbirinin
 *   teklifini, kimliğini VE SAYISINI göremez. "3 firma teklif verdi" bile
 *   rekabet istihbaratıdır — anonim ziyaretçiye hiç verilmez.
 *
 * `targetPrice` (kalem hedef birim fiyat)
 *   Alıcının bütçesi. `showTargetToSuppliers` açık olsa bile o izin
 *   TEDARİKÇİYE verilmiştir, açık web'e değil. Bayraktan bağımsız dışarıda.
 *
 * (Satış ilanına özgü taban/hemen-al fiyat kolonları 2026-09-04'te şemadan
 *   kaldırıldı — özellik yok.)
 *
 * `items[]` gövdesi — v2 (2026-09-04): satır = sıra + miktar + birim; AD,
 *   marka, şartname, tarih üyeye. Toplam miktar özeti `itemSummary`.
 *
 * `terms` / `paymentNote` (serbest metin)
 *   Sahip buraya IBAN, telefon, e-posta yazabiliyor; panelde maskeli
 *   önizlemede de bu yüzden gizli (BK-B). Platform dışına yönlendirmeyi
 *   kolaylaştırır, SEO değeri düşüktür. `description` DAHİL: sayfanın
 *   içeriği odur, onsuz "thin content" üretmiş oluruz.
 *
 * `logistics` (Json) / `deliveryAddressId` / `billingAddressId`
 *   Adres taşır.
 *
 * ── İLAN SAHİBİ ANONİM ────────────────────────────────────────────────────
 * `company.name` / `company.slug` / `company.logoUrl`
 *   İlanı KİMİN açtığı herkese açık sayfada gösterilmez. Bir alım talebinde
 *   bu bilgi doğrudan rekabet istihbaratıdır ("X firması 40 ton çelik boru
 *   arıyor" = X'in üretim planı); satış ilanında da müşteri listesini açık
 *   eder. Panelde ücretsiz (STANDART) üye bağsız PUBLIC talebi tam görmez
 *   (`listingBidEligibility.hidden`); Açık Talepler'de onu ALICI GİZLİ satır
 *   olarak görür — o satır ve maskeli görünüm BU dosyanın kart/detay
 *   yansıtmasından üretilir (`toPublicListingCard`/`toPublicListingDetail`,
 *   2026-10-03), yani ziyaretçiden fazlasını taşıyamaz. Anonim ziyaretçi teaser'ı görür (başlık, açıklama, kalem sayısı) ama
 *   sahibi asla — sahip kimliği hiçbir yüzeyde ücretsiz/anonim tarafa açılmaz.
 *
 *   Firma adının herkese açık göründüğü tek yer `/firma/<slug>` profilidir:
 *   orası ayrı, OPT-IN (`publicEnabled`) ve her pakete açık (2026-09-06).
 *   İlan sayfasından oraya bağlantı da verilmez — bağlantının kendisi kimliği
 *   ele verirdi.
 *
 *   Kalan alanlar (ülke, sektör, faaliyet tipi) kimlik değil nitelik:
 *   teklif verecek tarafın lojistik ve uygunluk kararı için gerekli. Alıcının
 *   ŞEHRİ 2026-10-04'ten beri talep yüzeylerinde YOK (sahip kararı: konum =
 *   ülke; süzgeç de şehir değil alıcı ülkesi).
 *
 * `internalNotes` — tanımı gereği yalnız sahip.
 * `createdById` — kişi kimliği (KVKK).
 * `id` / `companyId` — cuid. Dışarıya YALNIZ ilan `number`ı verilir; iç
 *   tanımlayıcıyı yayımlamak numaralandırma yüzeyi açar.
 * `auctionRateSnapshot` / `bidVisibility` / `autoExtend*` — teklif mekaniği.
 */
export const PUBLIC_LISTING_SELECT = {
  // İç kimlik yalnız ÇEVİRİ eşlemesi için (i18n Faz 1e); mapper yanıta YAZMAZ.
  id: true,
  number: true,
  type: true,
  title: true,
  description: true,
  status: true,
  format: true,
  primaryCurrency: true,
  allowedCurrencies: true,
  isInternational: true,
  targetCountries: true,
  categoryIds: true,
  // ARANAN TEDARİKÇİ TİPİ — talebin NİTELİĞİ, sahibinin kimliği değil.
  // Ziyaretçi teklif verip vermeyeceğine karar verirken işine yarar
  // ("üretici aranıyor" yazan talebe bayi boşuna hazırlık yapmasın).
  preferredActivities: true,
  keywords: true,
  requireAllItems: true,
  requireBidDocument: true,
  requireGuaranteeLetter: true,
  isSealedBid: true,
  isLogistics: true,
  deliveryTerm: true,
  paymentCategory: true,
  paymentTiming: true,
  advancePercent: true,
  paymentDays: true,
  lcType: true,
  lcConfirmed: true,
  closesAt: true,
  publishedAt: true,
  updatedAt: true,
  publicIndexable: true,
  coverImageUrl: true,
  items: {
    // Kapsam önizlemesi: sıra, AD (2026-09-18, kullanıcı kararı: "kalemlerin
    // neler olduğu gözüksün, firma bilgisi zaten gizli"), miktar, birim,
    // görsel. Marka, açıklama, şartname, hedef/hemen-al fiyatı SELECT'TE
    // YOK — sızamaz.
    select: {
      lineNo: true,
      name: true,
      images: true,
      quantity: true,
      unit: true,
    },
    orderBy: { lineNo: "asc" },
  },
  company: {
    select: {
      // KİMLİK ALANLARI BİLİNÇLİ OLARAK YOK: `name`, `slug`, `logoUrl`.
      // İlanı kimin açtığı herkese açık sayfada GÖSTERİLMEZ (aşağıdaki
      // "İLAN SAHİBİ ANONİM" notu). Select'ten çıkarılmalarının sebebi
      // yalnız gizlemek değil: Prisma'dan hiç dönmedikleri için mapper,
      // JSON-LD veya ileride eklenecek bir alan onları kazara yazamaz.
      // `id` YALNIZ iç kullanım (sektör çevirisi için firma çevirisi aranır); `toPublicCompany` yazmaz.
      id: true,
      // ŞEHİR YOK (2026-10-04 sahip kararı): talepte alıcının konumu
      // yalnız ÜLKE olarak gösterilir ve süzülür; şehir hiçbir talep
      // yüzeyinde (liste, detay, maskeli satır, süzgeç) yok — sorguya da girmez.
      country: true,
      industry: true,
      activities: true,
      companyVerificationStatus: true,
    },
  },
} satisfies Prisma.ListingSelect;

export type PublicListingRow = Prisma.ListingGetPayload<{
  select: typeof PUBLIC_LISTING_SELECT;
}>;

/**
 * İlan sahibinin ANONİM tarifi. Ad/slug/logo YOK — bkz. "İLAN SAHİBİ ANONİM".
 * Kalanlar kimlik değil NİTELİK: alıcının hangi ülkede, hangi sektörde ve ne
 * tür bir firma olduğu, teklif verecek tarafın işine yarar ve tek başına
 * firmayı işaret etmez.
 */
export interface PublicListingCompany {
  /** Talebin açıldığı ülke (alıcı firmanın ülkesi, ISO alpha-2). Şehir YOK (2026-10-04). */
  country: string | null;
  industry: string | null;
  activities: string[];
  /** KYC tamam — "Doğrulanmış alıcı/tedarikçi" rozeti (kimlik değil nitelik). */
  verified: boolean;
}

/**
 * KALEM SATIRLARI — MİKTAR AÇIK, AD GİZLİ (v2, 2026-09-04 kullanıcı kararı).
 *
 * Ziyaretçi "Kalem 1 · 500 adet" görür: kapsamı ve ölçeği anlar, ne
 * istendiğini bilmez — ad, marka, şartname, hemen-al fiyatı üyeye. Özet
 * (`itemSummary`) toplam miktarı YALNIZ tüm kalemler aynı birimdeyse verir;
 * karışık birimde toplam uydurulmaz, yalnız sayı.
 */
export interface PublicListingItemRow {
  lineNo: number;
  /** 2026-09-18: kalem adı herkese açık (marka/açıklama/şartname değil). */
  name: string;
  quantity: string;
  unit: string;
}

export interface PublicListingItemSummary {
  count: number;
  /** Tüm kalemler aynı birimdeyse toplam; değilse null. */
  totalQuantity: string | null;
  unit: string | null;
}

export interface PublicListing {
  number: string;
  /** Dilden bağımsız adres parçası — KAYNAK başlığın slug'ı (`listingSlug`). Çevrilmiş
   *  başlıktan slug üretilmez: `/en/talep/<slug>` = `/talep/<slug>` (i18n Faz 1e). */
  slug: string;
  type: "ALIM";
  title: string;
  description: string | null;
  status: string;
  format: string | null;
  primaryCurrency: string;
  allowedCurrencies: string[];
  isInternational: boolean;
  targetCountries: string[];
  categoryIds: string[];
  preferredActivities: string[];
  keywords: string[];
  requireAllItems: boolean;
  requireBidDocument: boolean;
  requireGuaranteeLetter: boolean;
  isSealedBid: boolean;
  isLogistics: boolean;
  deliveryTerm: string | null;
  paymentCategory: string;
  paymentTiming: string;
  advancePercent: number | null;
  paymentDays: number | null;
  lcType: string | null;
  lcConfirmed: boolean;
  closesAt: string | null;
  publishedAt: string | null;
  updatedAt: string;
  /**
   * Kart/OG görseli. Sahibi seçmediyse İLK KALEMİN ilk görselinden türetilir;
   * o da yoksa `null` ve web tarafı kategori görseline düşer.
   */
  coverImageUrl: string | null;
  /** Arama motoru dizinlemesine sahip tarafından izin verildi mi. */
  indexable: boolean;
  itemCount: number;
  itemSummary: PublicListingItemSummary;
  /** Satırlar: sıra + miktar + birim; AD YOK. */
  items: PublicListingItemRow[];
  company: PublicListingCompany;
  /** Kategori kodlarının çözülmüş adları (kod → ad); eksik ve GİZLİ segment kodu atlanır. */
  categories: { id: string; name: string; level: number }[];
  /**
   * Dil durumu (i18n SEO, 2026-09-27) — YALNIZ detay yanıtında: talebin kendi
   * dilinde gösterilebildiği diller (hreflang) ve özgün metnin dili ("und" =
   * henüz bilinmiyor). Kimlik değil, içerik niteliği.
   */
  readyLocales?: string[];
  sourceLocale?: string;
}

/** Liste kartı — detayın DAR alt kümesi (kalem/şartname gövdesi taşımaz). */
export type PublicListingCard = Pick<
  PublicListing,
  | "number"
  | "slug"
  | "type"
  | "title"
  | "status"
  | "closesAt"
  | "publishedAt"
  | "primaryCurrency"
  | "isInternational"
  | "targetCountries"
  | "itemCount"
  | "itemSummary"
  | "company"
  | "categories"
  | "coverImageUrl"
> & {
  /** İlk ~200 karakter — kart özeti; tam metin detayda. */
  excerpt: string | null;
};


type ItemQty = { lineNo: number; name?: string | null; quantity: Prisma.Decimal; unit: string };

export function itemRowsOf(items: ItemQty[]): PublicListingItemRow[] {
  return [...items]
    .sort((a, b) => a.lineNo - b.lineNo)
    // 2026-09-18: kalem ADI herkese açık (kullanıcı kararı); firma kimliği gizli kalır.
    .map((i) => ({ lineNo: i.lineNo, name: i.name ?? "", quantity: i.quantity.toString(), unit: i.unit }));
}

export function itemSummaryOf(items: ItemQty[]): PublicListingItemSummary {
  const units = new Set(items.map((i) => i.unit));
  if (items.length === 0 || units.size !== 1) {
    return { count: items.length, totalQuantity: null, unit: null };
  }
  const total = items.reduce((s, i) => s.plus(i.quantity), new Prisma.Decimal(0));
  return { count: items.length, totalQuantity: total.toString(), unit: items[0].unit };
}

export function toPublicCompany(
  c: PublicListingRow["company"],
): PublicListingCompany {
  return {
    country: c.country,
    industry: c.industry,
    activities: c.activities,
    verified: c.companyVerificationStatus === "VERIFIED",
  };
}

/**
 * İlan kapağı — sahibinin seçtiği görsel, yoksa İLK KALEMİN ilk görseli.
 *
 * Türetme burada TEK KAYNAK: kart ve detay aynı sonucu vermeli, aksi hâlde
 * ziyaretçi listede bir görsel görüp tıklayınca başkasını bulurdu.
 */
export function deriveCover(row: {
  coverImageUrl: string | null;
  items: { images: string[] }[];
}): string | null {
  if (row.coverImageUrl) return row.coverImageUrl;
  for (const item of row.items) {
    if (item.images.length > 0) return item.images[0];
  }
  return null;
}

/** Çözülmüş kategori (kod → ad, okuyucunun dilinde) — kart ve detay aynı haritayı okur. */
export type PublicCategoryMap = Map<string, { id: string; name: string; level: number }>;

/**
 * GİZLİ SEGMENT BURADA DÜŞER (2026-10-09, sahip kuralı: "anasayfada olmayan
 * kategori talepte, üründe ya da başka yerde de gösterilmesin"). Süzgeç HARİTADA
 * değil KODDA: haritayı üç ayrı çağıran kuruyor (herkese açık liste/detay,
 * panelin maskeli satırı ve maskeli görünümü) ve biri süzmeyi unutsa bile eski
 * talebin gizli kategorisi ada/çipe/bağlantıya dönüşemez. Kayıt (`Listing.
 * categoryIds`) değişmez; eşleştirme ve bildirim kodların tamamını okur.
 */
const categoriesOf = (row: PublicListingRow, cats: PublicCategoryMap) =>
  visibleCategoryIds(row.categoryIds)
    .map((id) => cats.get(id))
    .filter((c): c is NonNullable<typeof c> => !!c);

/**
 * KART YANSITMASI — TEK KAYNAK. Herkese açık liste (`PublicMarketplaceService.list`)
 * ve panelde ücretsiz üyenin MASKELİ talep satırı (`CompanyListingsService.
 * maskedPublicTenders`, 2026-10-03) aynı fonksiyonu okur: maskeli satır
 * ziyaretçinin gördüğünden FAZLASINI taşıyamasın diye ayrı mapper yazılmadı.
 */
export function toPublicListingCard(row: PublicListingRow, cats: PublicCategoryMap): PublicListingCard {
  return {
    number: row.number ?? "",
    slug: listingSlug(row.number ?? "", row.title),
    type: row.type,
    title: row.title,
    status: row.status,
    closesAt: row.closesAt?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    primaryCurrency: row.primaryCurrency,
    isInternational: row.isInternational,
    targetCountries: row.targetCountries,
    itemCount: row.items.length,
    coverImageUrl: deriveCover(row),
    excerpt: excerptOf(row.description),
    itemSummary: itemSummaryOf(row.items),
    company: toPublicCompany(row.company),
    categories: categoriesOf(row, cats),
  };
}

/**
 * DETAY YANSITMASI — TEK KAYNAK. Herkese açık `/talep/<slug>` (`getByNumber`)
 * ve panelin maskeli talep görünümü (`maskedPublicTender`) aynı çıktıyı verir;
 * sahip/teklifçi serileştiricisi (`getOne`) bu yola HİÇ girmez.
 */
export function toPublicListingDetail(row: PublicListingRow, cats: PublicCategoryMap): PublicListing {
  return {
    number: row.number ?? "",
    slug: listingSlug(row.number ?? "", row.title),
    type: row.type,
    title: row.title,
    description: row.description,
    status: row.status,
    format: row.format,
    primaryCurrency: row.primaryCurrency,
    allowedCurrencies: row.allowedCurrencies,
    isInternational: row.isInternational,
    targetCountries: row.targetCountries,
    // Ham kod da gizlenir: istemci ton/ikon/bağlantıyı koddan türetebiliyor.
    categoryIds: visibleCategoryIds(row.categoryIds),
    preferredActivities: row.preferredActivities,
    keywords: row.keywords,
    requireAllItems: row.requireAllItems,
    requireBidDocument: row.requireBidDocument,
    requireGuaranteeLetter: row.requireGuaranteeLetter,
    isSealedBid: row.isSealedBid,
    isLogistics: row.isLogistics,
    deliveryTerm: row.deliveryTerm,
    paymentCategory: row.paymentCategory,
    paymentTiming: row.paymentTiming,
    advancePercent: row.advancePercent,
    paymentDays: row.paymentDays,
    lcType: row.lcType,
    lcConfirmed: row.lcConfirmed,
    closesAt: row.closesAt?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    coverImageUrl: deriveCover(row),
    // `marketplaceIndexableWhere` ile AYNI mantık: ilan bazlı izin ∧ hâlâ
    // teklife açık. Sahip izin vermiş olsa bile kapanmış ilan dizinlenmez.
    // Sayfa bunu okuyup `noindex` basar; sitemap zaten sorguda süzüyor.
    indexable: row.publicIndexable && row.status === "OPEN",
    itemCount: row.items.length,
    itemSummary: itemSummaryOf(row.items),
    items: itemRowsOf(row.items),
    company: toPublicCompany(row.company),
    categories: categoriesOf(row, cats),
  };
}

export function excerptOf(description: string | null, max = 200): string | null {
  if (!description) return null;
  const flat = description.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}
