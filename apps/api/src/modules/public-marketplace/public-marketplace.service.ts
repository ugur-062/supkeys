import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@rothern/db";
import { tokenizeQuery, categoryPrefix, isCompanyActivity, foldSearchText } from "@rothern/shared";
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
  itemRowsOf,
  itemSummaryOf,
} from "./dto/public-listing.projection";
import type { PublicListQueryDto } from "./dto/public-list-query.dto";
import type { PublicProductQueryDto } from "./dto/public-product-query.dto";
import { resolveCategoryAttributes } from "../../common/company/category-attributes";
import { anyPackageWhere } from "../../common/company/effective-tier";
import {
  productCategoryWhere,
  productFacetCounts,
  productSearchClauses,
  productIndexOrderBy,
  productIndexWhere,
} from "../../common/company/product-index";
import { relatedProducts } from "../../common/company/related-products";
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
/** Nitelik facet'inde bir anahtar için gösterilecek en fazla değer. */
const ATTR_FACET_VALUES = 12;
/** Sayılabilir nitelik tipleri — serbest metin ve sayı facet OLMAZ. */
const FACETABLE_TYPES = new Set(["SINGLE_SELECT", "MULTI_SELECT"]);

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
      itemSummary: itemSummaryOf(row.items),
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
      itemSummary: itemSummaryOf(row.items),
      items: itemRowsOf(row.items),
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
      ...(await this.listingCategoryWhere(q.category)),
      ...(q.scope ? { isInternational: q.scope === "international" } : {}),
      ...(q.closesWithin
        ? { closesAt: { gte: now, lte: new Date(now.getTime() + Number(q.closesWithin) * 86_400_000) } }
        : {}),
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
   * İlan kategori süzgeci ALT AĞACI kapsar (2026-09-04 düzeltmesi).
   *
   * Eskiden `categoryIds: { has: kod }` idi; facet L1 segment sayıyor, ilan
   * ise L3+ kod taşıyor → ziyaretçi kenar çubuğunda "Elektrik (12)" görüp
   * tıklayınca SIFIR sonuç alıyordu. Prisma dizi kolonunda önek eşleşmesi
   * yok; eşleşen ilan kimlikleri ham SQL ile alınır (`unnest` + `LIKE`),
   * sorgu `id IN (...)` ile daralır. Tavan 5000 — facet tarama tavanıyla
   * aynı ölçek. Yaprak kod verilirse doğrudan `has`.
   */
  private async listingCategoryWhere(
    code?: string,
  ): Promise<Prisma.ListingWhereInput> {
    if (!code) return {};
    const prefix = categoryPrefix(code);
    if (!prefix) return {};
    if (prefix.length === 8) return { categoryIds: { has: code } };
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT l.id FROM listings l
      WHERE EXISTS (
        SELECT 1 FROM unnest(l."categoryIds") AS c WHERE c LIKE ${`${prefix}%`}
      )
      LIMIT 5000`;
    return { id: { in: rows.map((r) => r.id) } };
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
    scopes: { scope: "domestic" | "international"; count: number }[];
    truncated: boolean;
  }> {
    const now = new Date();
    const rows = await this.prisma.listing.findMany({
      where: { ...marketplaceListingWhere(now), status: "OPEN" },
      select: {
        type: true,
        categoryIds: true,
        isInternational: true,
        company: { select: { city: true } },
      },
      take: FACET_SCAN_CAP + 1,
    });
    const truncated = rows.length > FACET_SCAN_CAP;
    const scanned = truncated ? rows.slice(0, FACET_SCAN_CAP) : rows;

    const catCount = new Map<string, number>();
    const cityCount = new Map<string, number>();
    const typeCount = new Map<string, number>();
    let international = 0;
    for (const r of scanned) {
      typeCount.set(r.type, (typeCount.get(r.type) ?? 0) + 1);
      if (r.isInternational) international += 1;
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
      // Kapsam süzgeci (yurtiçi / uluslararası) — sayfa açıklaması bunu vaat
      // ediyordu, süzgeç yoktu.
      scopes: [
        { scope: "domestic" as const, count: scanned.length - international },
        { scope: "international" as const, count: international },
      ].filter((s) => s.count > 0),
      truncated,
    };
  }

  /* ---------------------------------------------------------------- */
  /* ÜRÜN DİZİNİ (firmalar arası)                                       */
  /* ---------------------------------------------------------------- */


  /**
   * Arama koşulları — AND dizisi olarak döner (tek nesne değil): şehir süzgeci
   * de `company` anahtarını kullanıyor ve tek nesnede iki `company` alanı
   * olamaz. Hepsi tek bir `AND` altında birleşir.
   */
  async listProducts(q: PublicProductQueryDto): Promise<{
    items: ProductIndexCard[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = Math.max(1, q.page ?? 1);
    // Where/orderBy TEK KAYNAK (`common/company/product-index.ts`) — panelin
    // "Ürün Ara"sı aynı fonksiyonu okur.
    const where = productIndexWhere({ ...q, verified: q.verified === "1" });
    const [total, rows] = await Promise.all([
      this.prisma.companyItem.count({ where }),
      this.prisma.companyItem.findMany({
        where,
        select: PRODUCT_INDEX_SELECT,
        orderBy: productIndexOrderBy(q.sort),
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);
    return { items: rows.map(toProductIndexCard), total, page, pageSize: PAGE_SIZE };
  }

  /**
   * ANASAYFA ÜRÜN SEÇKİSİ — doğrulanmış firma önce, sonra tamamlanma ve tarih;
   * aynı firmadan en fazla 2 ürün (tek firmanın kaydırıcıyı doldurmasın).
   */
  async featuredProducts(limit = 12): Promise<ProductIndexCard[]> {
    const rows = await this.prisma.companyItem.findMany({
      where: publicProductWhere(),
      select: PRODUCT_INDEX_SELECT,
      orderBy: [{ completionScore: "desc" }, { publishedAt: "desc" }],
      take: Math.min(limit * 6, 200),
    });
    const cards = rows.map(toProductIndexCard);
    cards.sort((a, b) => Number(b.company.verified) - Number(a.company.verified));
    const perCompany = new Map<string, number>();
    const out: ProductIndexCard[] = [];
    for (const c of cards) {
      const n = perCompany.get(c.company.slug) ?? 0;
      if (n >= 2) continue;
      perCompany.set(c.company.slug, n + 1);
      out.push(c);
      if (out.length >= limit) break;
    }
    return out;
  }

  /** Ürün sayfası ilişkili bloklar — `common/company/related-products.ts`. */
  relatedProducts(companySlug: string, productSlug: string) {
    return relatedProducts(this.prisma, companySlug, productSlug);
  }

  /**
   * ARAMA ÖNERİSİ — hero kutusunda yazarken: ürün + kategori + firma.
   * Kapılar liste uçlarıyla aynı; kategori yalnız discovery L2+.
   */
  async suggest(raw: string) {
    const q = raw.trim();
    if (q.length < 2) return { products: [], categories: [], companies: [] };
    const tokens = tokenizeQuery(q);
    const [products, categories, companies] = await Promise.all([
      this.prisma.companyItem.findMany({
        where: { ...publicProductWhere(), ...(tokens.length ? { AND: productSearchClauses(q) } : {}) },
        select: { name: true, slug: true, company: { select: { slug: true } } },
        orderBy: [{ completionScore: "desc" }],
        take: 5,
      }),
      this.prisma.category.findMany({
        where: {
          inDiscovery: true,
          level: { gte: 2 },
          AND: tokens.map((t) => ({ searchText: { contains: foldSearchText(t) } })),
        },
        select: { id: true, nameTr: true, level: true },
        orderBy: [{ level: "asc" }],
        take: 5,
      }),
      this.prisma.company.findMany({
        where: {
          publicEnabled: true,
          isActive: true,
          isBlocked: false,
          slug: { not: null },
          ...anyPackageWhere(),
          name: { contains: q, mode: "insensitive" },
        },
        select: { name: true, slug: true, city: true },
        take: 5,
      }),
    ]);
    return {
      products: products.map((p) => ({ name: p.name, slug: p.slug ?? "", companySlug: p.company.slug ?? "" })),
      categories: categories.map((c) => ({ id: c.id, name: c.nameTr, level: c.level })),
      companies: companies.map((c) => ({ name: c.name, slug: c.slug as string, city: c.city })),
    };
  }

  /** Anasayfa sayı şeridi — gerçek sayımlar; eşiği web uygular. */
  async stats() {
    const now = new Date();
    const [products, companies, categories, openDemands, catRows] = await Promise.all([
      this.prisma.companyItem.count({ where: publicProductWhere() }),
      this.prisma.company.count({
        where: { publicEnabled: true, isActive: true, isBlocked: false, slug: { not: null }, ...anyPackageWhere() },
      }),
      this.prisma.category.count({ where: { inDiscovery: true, level: 1 } }),
      this.prisma.listing.count({ where: { ...marketplaceListingWhere(now), status: "OPEN", type: "ALIM" } }),
      this.prisma.companyItem.findMany({
        where: publicProductWhere(),
        select: { categoryId: true },
        take: FACET_SCAN_CAP,
      }),
    ]);
    // "Popüler aramalar" — arama logu YOK; yedek: ürün sayısı en yüksek 20
    // ALT kategori (L3 sınıf). Etiket web'de "Popüler kategoriler".
    const l3 = new Map<string, number>();
    for (const r of catRows) {
      if (r.categoryId && r.categoryId.length === 8) {
        const cls = `${r.categoryId.slice(0, 6)}00`;
        l3.set(cls, (l3.get(cls) ?? 0) + 1);
      }
    }
    const top = [...l3.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
    const names = await this.resolveCategories(top.map(([id]) => id));
    return {
      products,
      companies,
      categories,
      openDemands,
      popularCategories: top
        .map(([id, count]) => ({ id, name: names.get(id)?.name ?? null, count }))
        .filter((c): c is { id: string; name: string; count: number } => !!c.name),
    };
  }

  /**
   * Ürün süzgeç sayaçları. İlan facet'iyle aynı gerekçe: sayım BELLEKTE, çünkü
   * kapı tek kaynak bir Prisma `where`; ham SQL'e çevirmek onu kopyalamak
   * olurdu. Tavan aşılırsa `truncated` döner — sessizce eksik sayılmaz.
   */
  async productFacets(category?: string): Promise<{
    categories: { id: string; name: string; level: number; count: number }[];
    cities: { city: string; count: number }[];
    activities: { activity: string; count: number }[];
    attributes: {
      key: string;
      nameTr: string;
      unit: string | null;
      values: { value: string; count: number }[];
    }[];
    truncated: boolean;
  }> {
    // Tarama KATEGORİDEN BAĞIMSIZ: sektör ve şehir sayaçları TÜM vitrini
    // göstermeli, yoksa kategori sayfasındaki "Sektör" listesi yalnız o
    // sektörü gösterir ve ziyaretçi başka sektöre geçemez. Kategoriye özgü
    // olan tek şey NİTELİK sayımı; o, aynı taramadan bellekte süzülür.
    const rows = await this.prisma.companyItem.findMany({
      where: publicProductWhere(),
      select: {
        categoryId: true,
        attributes: true,
        company: { select: { city: true, activities: true } },
      },
      take: FACET_SCAN_CAP + 1,
    });
    const truncated = rows.length > FACET_SCAN_CAP;
    const scanned = truncated ? rows.slice(0, FACET_SCAN_CAP) : rows;

    const counts = productFacetCounts(scanned);
    const cats = await this.resolveCategories(counts.categories.map(([id]) => id));
    return {
      categories: counts.categories
        .map(([id, count]) => {
          const c = cats.get(id);
          return c ? { ...c, count } : null;
        })
        .filter((c): c is NonNullable<typeof c> => !!c)
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "tr")),
      cities: counts.cities,
      activities: counts.activities,
      attributes: await this.attributeFacets(
        category,
        // Nitelik sayımı YALNIZ o daldaki ürünlerden: kod öneki, kategori
        // süzgecinin (ata zinciri) bellek karşılığı.
        category
          ? scanned.filter((r) =>
              (r.categoryId ?? "").startsWith(categoryPrefix(category) ?? category),
            )
          : [],
      ),
      truncated,
    };
  }

  /**
   * NİTELİK facet'leri — yalnız bir kategori seçiliyken.
   *
   * Sebep: nitelikler kategoriye özgü. Kategori seçilmeden "IP sınıfı" süzgeci
   * göstermek, listedeki ürünlerin çoğunda o alanın hiç tanımlı olmadığı bir
   * kenar çubuğu üretirdi.
   *
   * Tanımlar kategori ağacından MİRASLA gelir (panelde sorulanla AYNI kaynak),
   * sayımlar taranan ürünlerden. Yalnız kapalı listeler sayılır: serbest metin
   * ve sayı alanında her ürün kendi değerini üretir, sayım anlamsızdır.
   *
   * Değeri OLMAYAN nitelik listeye girmez — süzgeç, o ekranda hiçbir şeyi
   * daraltmayan bir satır göstermemeli.
   */
  private async attributeFacets(
    category: string | undefined,
    rows: { attributes: Prisma.JsonValue | null }[],
  ): Promise<
    { key: string; nameTr: string; unit: string | null; values: { value: string; count: number }[] }[]
  > {
    if (!category || !/^\d{8}$/.test(category)) return [];
    const defs = (await resolveCategoryAttributes(this.prisma, category)).filter(
      (d) => FACETABLE_TYPES.has(d.type),
    );
    if (defs.length === 0) return [];

    const counts = new Map<string, Map<string, number>>();
    for (const d of defs) counts.set(d.key, new Map());
    for (const r of rows) {
      const a = r.attributes;
      if (!a || typeof a !== "object" || Array.isArray(a)) continue;
      for (const d of defs) {
        const raw = (a as Record<string, unknown>)[d.key];
        // Tekli seçim dize, çoklu seçim dizi — ikisi de aynı sayaca düşer.
        const values = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
        const bucket = counts.get(d.key)!;
        for (const v of values) {
          if (typeof v !== "string" || !v.trim()) continue;
          bucket.set(v, (bucket.get(v) ?? 0) + 1);
        }
      }
    }

    return defs
      .map((d) => ({
        key: d.key,
        nameTr: d.nameTr,
        unit: d.unit,
        values: [...counts.get(d.key)!.entries()]
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "tr"))
          .slice(0, ATTR_FACET_VALUES),
      }))
      .filter((f) => f.values.length > 0);
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
