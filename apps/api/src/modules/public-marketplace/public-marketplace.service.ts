import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@rothern/db";
import { tokenizeQuery } from "@rothern/shared";
import { PrismaBypassService } from "../../common/prisma/prisma.service";
import {
  marketplaceIndexableWhere,
  marketplaceListingWhere,
} from "../../common/company/listing-visibility";
import {
  PUBLIC_LISTING_SELECT,
  type PublicListing,
  type PublicListingCard,
  type PublicListingRow,
  deriveCover,
  excerptOf,
  toPublicCompany,
  toPublicItem,
} from "./dto/public-listing.projection";
import type { PublicListQueryDto } from "./dto/public-list-query.dto";
import type { PublicProductQueryDto } from "./dto/public-product-query.dto";
import {
  PRODUCT_INDEX_SELECT,
  toProductIndexCard,
  type ProductIndexCard,
} from "./dto/public-product-index.projection";
import { publicProductWhere } from "../../common/company/public-profile-gate";

/** Sayfa başına kart — SEO'da ilk ekranda çok fazla bağlantı istemiyoruz. */
const PAGE_SIZE = 24;
/**
 * Facet hesabı BELLEKTE yapılır (kategori kodları `String[]`, Prisma dizi
 * elemanına groupBy yapamaz). Ham SQL yazmamamın sebebi drift: görünürlük
 * kapısı `listing-visibility.ts`de tek kaynaktır, ham SQL onu KOPYALAMAK
 * zorunda kalırdı ve kural değişince sessizce ayrışırdı.
 *
 * Bu tavan aşıldığında sayım EKSİK olur — o yüzden yanıt `truncated` bayrağı
 * taşır, sessizce kırpmaz. Aşıldığı gün doğru çözüm: kapıyı SQL'e çeviren
 * tek bir yardımcı yazıp facet'i `unnest` ile hesaplamak.
 */
const FACET_SCAN_CAP = 5000;

@Injectable()
export class PublicMarketplaceService {
  constructor(private readonly prisma: PrismaBypassService) {}

  private async resolveCategories(
    codes: string[],
  ): Promise<Map<string, { id: string; name: string; level: number }>> {
    const unique = [...new Set(codes)].filter(Boolean);
    if (unique.length === 0) return new Map();
    const rows = await this.prisma.category.findMany({
      where: { id: { in: unique } },
      select: { id: true, nameTr: true, level: true },
    });
    return new Map(
      rows.map((r) => [r.id, { id: r.id, name: r.nameTr, level: r.level }]),
    );
  }

  private toCard(
    row: PublicListingRow,
    cats: Map<string, { id: string; name: string; level: number }>,
  ): PublicListingCard {
    return {
      number: row.number ?? "",
      type: row.type,
      title: row.title,
      status: row.status,
      closesAt: row.closesAt?.toISOString() ?? null,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      primaryCurrency: row.primaryCurrency,
      isInternational: row.isInternational,
      itemCount: row.items.length,
      coverImageUrl: deriveCover(row),
      excerpt: excerptOf(row.description),
      buyNowPrice: row.buyNowPrice?.toString() ?? null,
      company: toPublicCompany(row.company),
      categories: row.categoryIds
        .map((id) => cats.get(id))
        .filter((c): c is NonNullable<typeof c> => !!c),
    };
  }

  private toDetail(
    row: PublicListingRow,
    cats: Map<string, { id: string; name: string; level: number }>,
  ): PublicListing {
    return {
      number: row.number ?? "",
      type: row.type,
      title: row.title,
      description: row.description,
      status: row.status,
      format: row.format,
      priceScope: row.priceScope,
      buyNowPrice: row.buyNowPrice?.toString() ?? null,
      primaryCurrency: row.primaryCurrency,
      allowedCurrencies: row.allowedCurrencies,
      isInternational: row.isInternational,
      targetCountries: row.targetCountries,
      categoryIds: row.categoryIds,
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
      items: row.items.map(toPublicItem),
      company: toPublicCompany(row.company),
      categories: row.categoryIds
        .map((id) => cats.get(id))
        .filter((c): c is NonNullable<typeof c> => !!c),
    };
  }

  /* ---------------------------------------------------------------- */
  /* Liste                                                             */
  /* ---------------------------------------------------------------- */

  async list(q: PublicListQueryDto): Promise<{
    items: PublicListingCard[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const now = new Date();
    const page = Math.max(1, q.page ?? 1);
    const gate = marketplaceListingWhere(now);
    // Şehir süzgeci kapının firma koşullarının ÜSTÜNE katılır, YANINA değil.
    // Ayrı bir `company:` spread'i olarak yazılsaydı kapının
    // publicListingsEnabled/isActive/isBlocked koşullarını ezer ve süzgeç
    // kullanan her sorguda kapı sessizce açılırdı.
    const company: Prisma.CompanyWhereInput = {
      ...(gate.company as Prisma.CompanyWhereInput),
      ...(q.city ? { city: q.city } : {}),
    };
    const where: Prisma.ListingWhereInput = {
      ...gate,
      company,
      ...(q.type ? { type: q.type } : {}),
      // Varsayılan: yalnız teklife AÇIK olanlar. Kapanmışlar `state=all` ile
      // istenirse gelir (arşiv sayfaları) — ama asla varsayılan değildir,
      // ziyaretçiye ölü ilan göstermek en kötü ilk izlenim.
      ...(q.state === "all" ? {} : { status: "OPEN" }),
      ...(q.category ? { categoryIds: { has: q.category } } : {}),
      ...this.searchWhere(q.q),
    };

    const [total, rows] = await Promise.all([
      this.prisma.listing.count({ where }),
      this.prisma.listing.findMany({
        where,
        select: PUBLIC_LISTING_SELECT,
        // Yeni yayımlanan üstte; `publishedAt` eşitse numara kararlı ikincil
        // anahtar (sayfalar arası kayma olmasın).
        orderBy: [{ publishedAt: "desc" }, { number: "desc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);

    const cats = await this.resolveCategories(
      rows.flatMap((r) => r.categoryIds),
    );
    return {
      items: rows.map((r) => this.toCard(r, cats)),
      total,
      page,
      pageSize: PAGE_SIZE,
    };
  }

  /**
   * Serbest arama — başlık/açıklama/anahtar kelime. Kategori aramasındaki
   * `searchText` yolundan AYRI: orada katlanmış tek bir sütun var, burada
   * yok. Sorgu tokenlenir ve her token AND'lenir (sıra önemsiz), her token
   * üç alanda OR'lanır.
   */
  private searchWhere(raw?: string): Prisma.ListingWhereInput {
    const tokens = raw ? tokenizeQuery(raw) : [];
    if (tokens.length === 0) return {};
    return {
      AND: tokens.map((t) => ({
        OR: [
          { title: { contains: t, mode: "insensitive" as const } },
          { description: { contains: t, mode: "insensitive" as const } },
          { keywords: { has: t } },
        ],
      })),
    };
  }

  /* ---------------------------------------------------------------- */
  /* Detay                                                             */
  /* ---------------------------------------------------------------- */

  async getByNumber(number: string): Promise<PublicListing> {
    const now = new Date();
    const row = await this.prisma.listing.findFirst({
      where: { ...marketplaceListingWhere(now), number },
      select: PUBLIC_LISTING_SELECT,
    });
    if (!row) throw new NotFoundException("İlan bulunamadı");
    const cats = await this.resolveCategories(row.categoryIds);
    return this.toDetail(row, cats);
  }

  /* ---------------------------------------------------------------- */
  /* Facet                                                             */
  /* ---------------------------------------------------------------- */

  async facets(): Promise<{
    categories: { id: string; name: string; level: number; count: number }[];
    cities: { city: string; count: number }[];
    types: { type: string; count: number }[];
    truncated: boolean;
  }> {
    const now = new Date();
    const rows = await this.prisma.listing.findMany({
      where: { ...marketplaceListingWhere(now), status: "OPEN" },
      select: {
        type: true,
        categoryIds: true,
        company: { select: { city: true } },
      },
      take: FACET_SCAN_CAP + 1,
    });
    const truncated = rows.length > FACET_SCAN_CAP;
    const scanned = truncated ? rows.slice(0, FACET_SCAN_CAP) : rows;

    const catCount = new Map<string, number>();
    const cityCount = new Map<string, number>();
    const typeCount = new Map<string, number>();
    for (const r of scanned) {
      typeCount.set(r.type, (typeCount.get(r.type) ?? 0) + 1);
      const city = r.company.city?.trim();
      if (city) cityCount.set(city, (cityCount.get(city) ?? 0) + 1);
      // Kategori sayımı SEGMENT (L1) düzeyinde: ilan L3/L4 kod taşır, ama
      // ziyaretçiye 158 bin satırlık bir süzgeç sunulamaz. 8 haneli kodun ilk
      // iki hanesi segmenttir (hiyerarşi koddan türer).
      for (const seg of new Set(
        r.categoryIds.filter((c) => c.length === 8).map((c) => `${c.slice(0, 2)}000000`),
      )) {
        catCount.set(seg, (catCount.get(seg) ?? 0) + 1);
      }
    }

    const cats = await this.resolveCategories([...catCount.keys()]);
    return {
      categories: [...catCount.entries()]
        .map(([id, count]) => {
          const c = cats.get(id);
          return c ? { ...c, count } : null;
        })
        .filter((c): c is NonNullable<typeof c> => !!c)
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "tr")),
      cities: [...cityCount.entries()]
        .map(([city, count]) => ({ city, count }))
        .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city, "tr")),
      types: [...typeCount.entries()].map(([type, count]) => ({ type, count })),
      truncated,
    };
  }

  /* ---------------------------------------------------------------- */
  /* ÜRÜN DİZİNİ (firmalar arası)                                       */
  /* ---------------------------------------------------------------- */

  /**
   * Kategori süzgeci ATA ZİNCİRİNİ kapsar: ziyaretçi "Elektrik" (L1) seçtiğinde
   * altındaki her yaprağı görmeli. Hiyerarşi koddan türediği için bu, kod
   * önekiyle eşleşmeye iner — ayrı bir ağaç sorgusu gerekmez.
   *
   * `40000000` → önek `4`  · `40170000` → önek `4017` · `40171501` → tam kod.
   * Sondaki sıfırları atmak sağlam: kodun anlamlı kısmı hep başta.
   */
  private productCategoryWhere(code?: string): Prisma.CompanyItemWhereInput {
    if (!code || !/^\d{8}$/.test(code)) return {};
    return { categoryId: { startsWith: code.replace(/0+$/, "") } };
  }

  /**
   * Arama koşulları — AND dizisi olarak döner (tek nesne değil): şehir süzgeci
   * de `company` anahtarını kullanıyor ve tek nesnede iki `company` alanı
   * olamaz. Hepsi tek bir `AND` altında birleşir.
   */
  private productSearchClauses(raw?: string): Prisma.CompanyItemWhereInput[] {
    const tokens = raw ? tokenizeQuery(raw) : [];
    // `searchText` = fold(ad + marka + mpn + anahtar kelimeler); tokenler
    // AND'lenir, sıra önemsiz (kategori aramasıyla aynı kural).
    return tokens.map((t) => ({ searchText: { contains: t } }));
  }

  async listProducts(q: PublicProductQueryDto): Promise<{
    items: ProductIndexCard[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = Math.max(1, q.page ?? 1);
    const and: Prisma.CompanyItemWhereInput[] = [
      ...this.productSearchClauses(q.q),
      // Şehir AYRI bir yan koşul: `publicProductWhere` de `company` altında
      // filtreliyor ve tek nesnede aynı anahtar iki kez bulunamaz.
      ...(q.city ? [{ company: { city: q.city } }] : []),
    ];
    const where: Prisma.CompanyItemWhereInput = {
      ...publicProductWhere(),
      ...this.productCategoryWhere(q.category),
      ...(and.length ? { AND: and } : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.companyItem.count({ where }),
      this.prisma.companyItem.findMany({
        where,
        select: PRODUCT_INDEX_SELECT,
        // Eksiksiz ürün vitrinin yüzü — firma altı listeyle AYNI sıralama,
        // ziyaretçi iki yerde farklı bir düzen görmesin.
        orderBy: [{ completionScore: "desc" }, { publishedAt: "desc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);

    return { items: rows.map(toProductIndexCard), total, page, pageSize: PAGE_SIZE };
  }

  /**
   * Ürün süzgeç sayaçları. İlan facet'iyle aynı gerekçe: sayım BELLEKTE, çünkü
   * kapı tek kaynak bir Prisma `where`; ham SQL'e çevirmek onu kopyalamak
   * olurdu. Tavan aşılırsa `truncated` döner — sessizce eksik sayılmaz.
   */
  async productFacets(): Promise<{
    categories: { id: string; name: string; level: number; count: number }[];
    cities: { city: string; count: number }[];
    truncated: boolean;
  }> {
    const rows = await this.prisma.companyItem.findMany({
      where: publicProductWhere(),
      select: { categoryId: true, company: { select: { city: true } } },
      take: FACET_SCAN_CAP + 1,
    });
    const truncated = rows.length > FACET_SCAN_CAP;
    const scanned = truncated ? rows.slice(0, FACET_SCAN_CAP) : rows;

    const catCount = new Map<string, number>();
    const cityCount = new Map<string, number>();
    for (const r of scanned) {
      const city = r.company.city?.trim();
      if (city) cityCount.set(city, (cityCount.get(city) ?? 0) + 1);
      // SEGMENT (L1) düzeyinde sayım: ürün L3/L4 kod taşır ama ziyaretçiye
      // 158 bin satırlık süzgeç sunulamaz (ilan facet'iyle aynı karar).
      if (r.categoryId && r.categoryId.length === 8) {
        const seg = `${r.categoryId.slice(0, 2)}000000`;
        catCount.set(seg, (catCount.get(seg) ?? 0) + 1);
      }
    }

    const cats = await this.resolveCategories([...catCount.keys()]);
    return {
      categories: [...catCount.entries()]
        .map(([id, count]) => {
          const c = cats.get(id);
          return c ? { ...c, count } : null;
        })
        .filter((c): c is NonNullable<typeof c> => !!c)
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "tr")),
      cities: [...cityCount.entries()]
        .map(([city, count]) => ({ city, count }))
        .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city, "tr")),
      truncated,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Sitemap                                                           */
  /* ---------------------------------------------------------------- */

  /**
   * Yalnız DİZİNLENEBİLİR ilanlar. Başlık da döner: URL slug'ı web tarafında
   * numara+başlıktan kurulur (`lib/public/marketplace.ts`), sitemap'in kanonik
   * URL ile birebir aynı dizeyi üretmesi ŞART — yoksa Google sitemap'teki
   * adresi izler, sayfada başka bir kanonik görür ve ikisini de güvensiz sayar.
   */
  async sitemap(): Promise<
    { number: string; title: string; type: string; updatedAt: string }[]
  > {
    const now = new Date();
    const rows = await this.prisma.listing.findMany({
      where: { ...marketplaceIndexableWhere(now), number: { not: null } },
      select: { number: true, title: true, type: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 45000, // sitemap dosya başına 50.000 URL sınırının altında
    });
    return rows.map((r) => ({
      number: r.number as string,
      title: r.title,
      type: r.type,
      updatedAt: r.updatedAt.toISOString(),
    }));
  }
}
