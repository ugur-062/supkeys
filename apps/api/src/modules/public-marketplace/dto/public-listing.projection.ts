import { Prisma } from "@rothern/db";

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
 *   eder. Panelin kendi maskeli önizlemesi de aynı kararı veriyor: STANDART
 *   üye PUBLIC bir ilanda `owner`ı görmüyor (`listingBidEligibility`).
 *   Anonim ziyaretçi, giriş yapmış ücretsiz üyeden DAHA ÇOĞUNU göremez.
 *
 *   Firma adının herkese açık göründüğü tek yer `/firma/<slug>` profilidir:
 *   orası ayrı, OPT-IN (`publicEnabled`) ve satılan bir özelliktir (BRONZ+).
 *   İlan sayfasından oraya bağlantı da verilmez — bağlantının kendisi kimliği
 *   ele verirdi.
 *
 *   Kalan alanlar (şehir, ülke, sektör, faaliyet tipi) kimlik değil nitelik:
 *   teklif verecek tarafın lojistik ve uygunluk kararı için gerekli.
 *
 * `internalNotes` — tanımı gereği yalnız sahip.
 * `createdById` — kişi kimliği (KVKK).
 * `id` / `companyId` — cuid. Dışarıya YALNIZ ilan `number`ı verilir; iç
 *   tanımlayıcıyı yayımlamak numaralandırma yüzeyi açar.
 * `auctionRateSnapshot` / `bidVisibility` / `autoExtend*` — teklif mekaniği.
 */
export const PUBLIC_LISTING_SELECT = {
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
    // Yalnız kapak türetimi + kapsam önizlemesi için: ad ve görsel. Miktar,
    // marka, şartname, hemen-al fiyatı SELECT'TE YOK — sızamaz.
    select: {
      lineNo: true,
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
      city: true,
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
 * Kalanlar kimlik değil NİTELİK: alıcının hangi şehirde, hangi sektörde ve ne
 * tür bir firma olduğu, teklif verecek tarafın işine yarar ve tek başına
 * firmayı işaret etmez.
 */
export interface PublicListingCompany {
  city: string | null;
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
  /** Kategori kodlarının çözülmüş adları (kod → ad); eksik kod atlanır. */
  categories: { id: string; name: string; level: number }[];
}

/** Liste kartı — detayın DAR alt kümesi (kalem/şartname gövdesi taşımaz). */
export type PublicListingCard = Pick<
  PublicListing,
  | "number"
  | "type"
  | "title"
  | "status"
  | "closesAt"
  | "publishedAt"
  | "primaryCurrency"
  | "isInternational"
  | "itemCount"
  | "itemSummary"
  | "company"
  | "categories"
  | "coverImageUrl"
> & {
  /** İlk ~200 karakter — kart özeti; tam metin detayda. */
  excerpt: string | null;
};


type ItemQty = { lineNo: number; quantity: Prisma.Decimal; unit: string };

export function itemRowsOf(items: ItemQty[]): PublicListingItemRow[] {
  return [...items]
    .sort((a, b) => a.lineNo - b.lineNo)
    .map((i) => ({ lineNo: i.lineNo, quantity: i.quantity.toString(), unit: i.unit }));
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
    city: c.city,
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

export function excerptOf(description: string | null, max = 200): string | null {
  if (!description) return null;
  const flat = description.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}
