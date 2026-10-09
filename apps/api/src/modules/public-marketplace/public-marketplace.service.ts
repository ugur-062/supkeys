import { i18nMessage } from "../../common/i18n/http-i18n";
import { PublicListFacetQueryDto } from "./dto/public-list-query.dto";
import { hiddenCategoryWhere, isHiddenCategory, listingSlug, visibleCategoryId, visibleCategoryIds } from "@rothern/shared";
import { Optional, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@rothern/db";
import { tokenizeQuery, categoryPrefix, isCompanyActivity, foldSearchText, stemPrefix } from "@rothern/shared";
import { likeLiteral } from "../../common/prisma/like-literal";
import {
  categoryRowRank,
  categorySearchStem,
  compareCategoryRank,
  stemAtWordStart,
} from "../categories/services/category-search-rank";
import { PrismaBypassService } from "../../common/prisma/prisma.service";
import { ContentTranslationService } from "../content-translation/content-translation.service";
import { currentLocale } from "../../common/i18n/locale-context";
import { DEFAULT_LOCALE, LOCALES } from "@rothern/i18n";
import { resolveVisitorCurrency } from "../../common/currency/fx-rates";
import { CATEGORY_NAME_SELECT, categoryName, categorySlug, localizeCategoryRows } from "../../common/company/category-name";
import {
  marketplaceIndexableWhere,
  marketplaceListingWhere,
} from "../../common/company/listing-visibility";
import {
  PUBLIC_LISTING_SELECT,
  type PublicListing,
  type PublicListingCard,
  type PublicListingRow,
  type PublicCategoryMap,
  excerptOf,
  toPublicListingCard,
  toPublicListingDetail,
} from "./dto/public-listing.projection";
import { buyerCountryList, type PublicListQueryDto } from "./dto/public-list-query.dto";
import type { PublicProductFacetQueryDto, PublicProductQueryDto } from "./dto/public-product-query.dto";
import {
  attributeFacets,
  contextualFacetCounts,
  employeeValuesQuery,
  productCategoryWhere,
  productSearchClauses,
  productIndexOrderBy,
  productIndexWhere,
  subCategoryCounts,
  toFacetRow,
} from "../../common/company/product-index";
import { relatedProducts } from "../../common/company/related-products";
import {
  PRODUCT_INDEX_SELECT,
  attachProductFeatures,
  toProductIndexCard,
  type ProductIndexCard,
} from "./dto/public-product-index.projection";
import { PUBLIC_PROFILE_WHERE, publicProductWhere } from "../../common/company/public-profile-gate";

/** Sayfa başına kart — SEO'da ilk ekranda çok fazla bağlantı istemiyoruz. */
const PAGE_SIZE = 24;
/** Talep kartları büyük (teaser) — sayfa başına 12 (PROMPT 4). Ürün dizini 24'te kalır. */
const LISTING_PAGE_SIZE = 12;
/** Arama önerisinde (typeahead) gösterilen en fazla kategori. */
const SUGGEST_CATEGORY_LIMIT = 5;
/**
 * Öneri için sıralanan aday sayısı (yazılan biçim ve kök için ayrı ayrı).
 * Tavan sıradan SONRA uygulanır: yalnız düzeye göre ilk beşi almak, adı
 * kelimeyi taşıyan kategoriyi eş anlamlısında taşıyan üst düzey satırların
 * arkasında bırakıyordu.
 */
const SUGGEST_CATEGORY_POOL = 100;
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
/**
 * `/public/stats` son 24 saat teklif sayısını ancak vitrinde en az bu kadar
 * açık talep varken verir; altında sayı tek tek taleplere indirgenebilir.
 */
export const PUBLIC_BIDS_METRIC_MIN_OPEN_DEMANDS = 10;
/** Nitelik facet'inde bir anahtar için gösterilecek en fazla değer. */
/** Sayılabilir nitelik tipleri — serbest metin ve sayı facet OLMAZ. */

@Injectable()
export class PublicMarketplaceService {
  constructor(
    private readonly prisma: PrismaBypassService,
    /** İçerik çevirisi (i18n Faz 1e) — isteğe bağlı; yoksa özgün metin. */
    @Optional() private readonly translations?: ContentTranslationService,
  ) {}

  /**
   * Kod → ad haritası (kart, detay, facet adı, seçili kategori, popüler
   * kategoriler). GİZLİ SEGMENTİN KODU ÇÖZÜLMEZ (2026-10-09): bu servisin ada
   * çevirdiği her kod buradan geçer, dolayısıyla eski bir talebin / ürünün
   * gizli kategorisi hiçbir yanıtta ad olarak çıkamaz.
   */
  private async resolveCategories(
    codes: string[],
  ): Promise<Map<string, { id: string; name: string; level: number; slug: string }>> {
    const unique = [...new Set(visibleCategoryIds(codes))];
    if (unique.length === 0) return new Map();
    const rows = await this.prisma.category.findMany({
      where: { id: { in: unique } },
      select: { id: true, ...CATEGORY_NAME_SELECT, level: true },
    });
    // i18n Faz 4: ad okuyucunun dilinde, `slug` HER ZAMAN Türkçe addan (adres dilden bağımsız).
    return new Map(
      rows.map((r) => [r.id, { id: r.id, name: categoryName(r), level: r.level, slug: categorySlug(r.nameTr) }]),
    );
  }

  // Kart ve detay yansıtması projeksiyon dosyasında TEK KAYNAK
  // (`toPublicListingCard`/`toPublicListingDetail`): panelin maskeli talep
  // satırı ve görünümü (ücretsiz üye, 2026-10-03) aynı fonksiyonları okur.
  private toCard(row: PublicListingRow, cats: PublicCategoryMap): PublicListingCard {
    return toPublicListingCard(row, cats);
  }

  private toDetail(row: PublicListingRow, cats: PublicCategoryMap): PublicListing {
    return toPublicListingDetail(row, cats);
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
    // ALICI ÜLKESİ süzgeci (2026-10-04 sahip kararı — alıcı ŞEHRİ süzgecinin
    // yerine; eski `city` parametresi DTO'da kabul edilip YOK SAYILIR) kapının
    // firma koşullarının ÜSTÜNE katılır, YANINA değil. Ayrı bir `company:`
    // spread'i olarak yazılsaydı kapının publicListingsEnabled/isActive/
    // isBlocked koşullarını ezer ve süzgeç kullanan her sorguda kapı
    // sessizce açılırdı.
    const buyerCountries = buyerCountryList(q.buyerCountry);
    const company: Prisma.CompanyWhereInput = {
      ...(gate.company as Prisma.CompanyWhereInput),
      ...(buyerCountries.length ? { country: { in: buyerCountries } } : {}),
    };
    // Süzgeçler kapıya SPREAD ile değil `AND` dizisiyle katılır (derin denetim
    // Y-10): kapı embargoyu üst düzey `OR` anahtarında taşır; ülke süzgeci de
    // bir `OR` olduğundan eskiden aynı anahtarı ezip embargoyu düşürüyordu →
    // `?country=TR` ile açılışı gelecekteki talepler listede görünüyordu.
    // Kapı kendi nesnesinde kalır, her süzgeç ayrı AND terimi olur; hiçbir
    // süzgeç kapının bir anahtarını ezemez.
    const filters: Prisma.ListingWhereInput[] = [
      ...(q.type ? [{ type: q.type }] : []),
      // Varsayılan: yalnız teklife AÇIK olanlar. Kapanmışlar `state=all` ile
      // istenirse gelir (arşiv sayfaları) — ama asla varsayılan değildir,
      // ziyaretçiye ölü ilan göstermek en kötü ilk izlenim.
      ...(q.state === "all" ? [] : [{ status: "OPEN" as const }]),
      await this.listingCategoryWhere(q.category),
      ...(q.country
        ? [{ OR: [{ targetCountries: { isEmpty: true } }, { targetCountries: { has: q.country.toUpperCase() } }] }]
        : []),
      ...(q.closesWithin
        ? [{ closesAt: { gte: now, lte: new Date(now.getTime() + Number(q.closesWithin) * 86_400_000) } }]
        : []),
      this.searchWhere(q.q),
    ].filter((f) => Object.keys(f).length > 0);
    const where: Prisma.ListingWhereInput = {
      AND: [{ ...gate, company }, ...filters],
    };

    const [total, rows] = await Promise.all([
      this.prisma.listing.count({ where }),
      this.prisma.listing.findMany({
        where,
        select: PUBLIC_LISTING_SELECT,
        // Varsayılan: yeni yayımlanan üstte; `closing` = süresi yaklaşan önce.
        // Numara kararlı ikincil anahtar (sayfalar arası kayma olmasın).
        orderBy:
          q.sort === "closing"
            ? [{ closesAt: "asc" }, { number: "desc" }]
            : [{ publishedAt: "desc" }, { number: "desc" }],
        skip: (page - 1) * LISTING_PAGE_SIZE,
        take: LISTING_PAGE_SIZE,
      }),
    ]);

    const cats = await this.resolveCategories(
      rows.flatMap((r) => r.categoryIds),
    );
    const cards = rows.map((r) => this.toCard(r, cats));
    // i18n Faz 1e: kart metni + alıcı firmanın sektörü okuyucunun dilinde.
    const localizedCards = this.translations
      ? await this.translations.localizeListingCompanies(
          await this.translations.localizeListings(cards, rows.map((r) => r.id), currentLocale(), excerptOf),
          rows.map((r) => r.company?.id),
          currentLocale(),
        )
      : cards;
    return {
      items: localizedCards,
      total,
      page,
      pageSize: LISTING_PAGE_SIZE,
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
   *
   * GİZLİ SEGMENT kodu süzgeç DEĞİLDİR (2026-10-09): elle yazılmış ya da eski
   * bir yer iminden gelen `?category=46000000` kategori seçilmemiş gibi
   * davranır — gizli dal süzülerek gezilemez (`facets` de aynı kuralı okur).
   */
  private async listingCategoryWhere(
    code?: string,
  ): Promise<Prisma.ListingWhereInput> {
    if (!code || isHiddenCategory(code)) return {};
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
   * Serbest arama — başlık/açıklama/anahtar kelime + `searchTextI18n`
   * (katlanmış kaynak + EN/RU çeviriler, kalem adları dahil; içerik çevirisi
   * servisi yazar). Ham ILIKE dalları sütun henüz dolmamış talepler için
   * yedek. Token AND, alanlar OR.
   *
   * Desene giden her kullanıcı metni `likeLiteral`den geçer: `%` ve `_` joker
   * değil düz karakterdir ("%%" eskiden yayındaki HER talebi döndürüyordu).
   * `keywords: { has }` desen değil tam eşleşmedir, ona uygulanmaz.
   */
  private searchWhere(raw?: string): Prisma.ListingWhereInput {
    const tokens = raw ? tokenizeQuery(raw) : [];
    if (tokens.length === 0) return {};
    return {
      AND: tokens.map((t) => ({
        OR: [
          { title: { contains: likeLiteral(t), mode: "insensitive" as const } },
          { description: { contains: likeLiteral(t), mode: "insensitive" as const } },
          { keywords: { has: t } },
          { searchTextI18n: { contains: likeLiteral(stemPrefix(foldSearchText(t))) } },
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
    if (!row) throw new NotFoundException(i18nMessage("api.publicMarketplace.ilanBulunamadi"));
    const cats = await this.resolveCategories(row.categoryIds);
    const detail = this.toDetail(row, cats);
    // Dil durumu (i18n SEO, 2026-09-27): web hreflang'i yalnız HAZIR dillere
    // yazar, kaynak metni gösterdiği dilde `lang={sourceLocale}` basar.
    if (!this.translations) return { ...detail, readyLocales: [...LOCALES], sourceLocale: DEFAULT_LOCALE };
    const locale = currentLocale();
    const [[localized], state] = await Promise.all([
      this.translations.localizeListings([detail], [row.id], locale, excerptOf),
      this.translations.localeState("LISTING", row.id),
    ]);
    const [withIndustry] = await this.translations.localizeListingCompanies([localized ?? detail], [row.company?.id], locale);
    const out = { ...(withIndustry ?? localized ?? detail), ...state };
    // Bu dilde çeviri henüz yoksa sayfa kaynak metni gösterir → indekslenmez
    // (kapsam denetimi dakikalar içinde çevirir, SEO bildirimi sayfayı tazeler).
    if (out.indexable && !state.readyLocales.includes(locale)) {
      return { ...out, indexable: false };
    }
    return out;
  }

  /* ---------------------------------------------------------------- */
  /* Facet                                                             */
  /* ---------------------------------------------------------------- */

  /**
   * Süzgeç sayaçları — BAĞLAMSAL (PROMPT 4, ürün dizini ile aynı kural): her
   * boyut, DİĞER seçimler uygulanmış hâlde sayılır; seçili boyutun kendisi
   * serbest kalır ki kullanıcı dal değiştirebilsin. Arama (`q`) hepsine
   * uygulanır. Kategori sayımı SEGMENT (L1) düzeyinde.
   */
  async facets(q: PublicListFacetQueryDto = {}): Promise<{
    categories: { id: string; name: string; level: number; count: number }[];
    /**
     * ALICI ÜLKESİ (talebin açıldığı ülke, 2026-10-04 — eski `cities`
     * facet'inin yerine): ülke kodu + bağlamsal sayı; seçili ülke sonuçsuz
     * kalsa da 0 ile listede (çip kaldırılabilsin).
     */
    buyerCountries: { code: string; count: number }[];
    types: { type: string; count: number }[];
    /** Görünürlük ülkesi (2026-09-21): `openToAll` = hedef listesi boş; `countries` = hedef listelerde geçen ülkeler. */
    openToAll: number;
    countries: { code: string; count: number }[];
    /** Kalan süre kovaları (3/7/30 gün) — diğer seçimlerle. */
    within: { "3": number; "7": number; "30": number };
    /**
     * Seçili kategorinin okuyucu dilindeki adı (arayüz testi D-061): talep
     * sayfasındaki çip yaprağa (L2–L4) bağlanır; `categories` yalnız segment
     * saydığı için aktif çip adını buradan okur (ürün facet'iyle aynı biçim).
     * Seçim yoksa / kod yoksa null.
     */
    selectedCategory: { id: string; name: string; level: number } | null;
    truncated: boolean;
  }> {
    const now = new Date();
    const rows = await this.prisma.listing.findMany({
      where: { ...marketplaceListingWhere(now), status: "OPEN", ...this.searchWhere(q.q) },
      select: {
        type: true,
        categoryIds: true,
        targetCountries: true,
        closesAt: true,
        company: { select: { country: true } },
      },
      take: FACET_SCAN_CAP + 1,
    });
    const truncated = rows.length > FACET_SCAN_CAP;
    const scanned = truncated ? rows.slice(0, FACET_SCAN_CAP) : rows;
    type Row = (typeof scanned)[number];

    // Gizli segmentin kodu süzgeç değildir (liste ucuyla aynı kural, bkz.
    // `listingCategoryWhere`): sayaçlar süzülmez, `selectedCategory` null.
    const category = visibleCategoryId(q.category) ?? undefined;
    const prefix = category ? categoryPrefix(category) : null;
    const buyerCountries = buyerCountryList(q.buyerCountry);
    const buyerSet = new Set(buyerCountries);
    const dayMs = 86_400_000;
    const inCat = (r: Row) => !prefix || r.categoryIds.some((c) => c.startsWith(prefix));
    const inBuyer = (r: Row) => buyerSet.size === 0 || (r.company.country != null && buyerSet.has(r.company.country));
    const country = q.country?.toUpperCase();
    const inScope = (r: Row) => !country || r.targetCountries.length === 0 || r.targetCountries.includes(country);
    const withinDays = (r: Row, d: number) =>
      !!r.closesAt && r.closesAt.getTime() >= now.getTime() && r.closesAt.getTime() <= now.getTime() + d * dayMs;
    const inWithin = (r: Row) => !q.closesWithin || withinDays(r, Number(q.closesWithin));

    const forCat = scanned.filter((r) => inBuyer(r) && inScope(r) && inWithin(r));
    const forBuyer = scanned.filter((r) => inCat(r) && inScope(r) && inWithin(r));
    const forScope = scanned.filter((r) => inCat(r) && inBuyer(r) && inWithin(r));
    const forWithin = scanned.filter((r) => inCat(r) && inBuyer(r) && inScope(r));

    const catCount = new Map<string, number>();
    for (const r of forCat) {
      // 8 haneli kodun ilk iki hanesi segmenttir (hiyerarşi koddan türer).
      for (const seg of new Set(r.categoryIds.filter((c) => c.length === 8 && !isHiddenCategory(c)).map((c) => `${c.slice(0, 2)}000000`))) {
        catCount.set(seg, (catCount.get(seg) ?? 0) + 1);
      }
    }
    const buyerCount = new Map<string, number>();
    for (const r of forBuyer) {
      if (r.company.country) buyerCount.set(r.company.country, (buyerCount.get(r.company.country) ?? 0) + 1);
    }
    for (const c of buyerCountries) if (!buyerCount.has(c)) buyerCount.set(c, 0);
    const typeCount = new Map<string, number>();
    for (const r of scanned) typeCount.set(r.type, (typeCount.get(r.type) ?? 0) + 1);
    // Ülke facet'i ("Teklif verebilecek tedarikçi ülkesi", 2026-09-27 kuralı):
    // HER ülke seçilebilir ve C ülkesinin sayısı = `openToAll` + C'yi açıkça
    // hedefleyen talepler (`countryCanSee`, liste süzgeci `inScope` ile aynı).
    // `countries` yalnız AÇIK hedef sayılarını taşır (istemci `openToAll`
    // ekler); seçili ülke hedeflenmemiş olsa da 0 ile listede kalır ki çip ve
    // sayaç "tüm ülkelere açık" talepleri göstersin (eskiden liste yalnız
    // hedeflenen ülkelerdi → her talep herkese açıkken grup hiç çizilmiyordu).
    const openToAll = forScope.filter((r) => r.targetCountries.length === 0).length;
    const countryCount = new Map<string, number>();
    for (const r of forScope) for (const c of r.targetCountries) countryCount.set(c, (countryCount.get(c) ?? 0) + 1);
    if (country && /^[A-Z]{2}$/.test(country) && !countryCount.has(country)) countryCount.set(country, 0);

    const cats = await this.resolveCategories([...catCount.keys(), ...(category ? [category] : [])]);
    const selected = category ? cats.get(category) : undefined;
    return {
      categories: [...catCount.entries()]
        .map(([id, count]) => {
          const c = cats.get(id);
          return c ? { ...c, count } : null;
        })
        .filter((c): c is NonNullable<typeof c> => !!c)
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "tr")),
      buyerCountries: [...buyerCount.entries()]
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
      types: [...typeCount.entries()].map(([type, count]) => ({ type, count })),
      // Görünürlük ülkesi süzgeci — bkz. yukarıdaki kural (seçilebilir her ülke).
      openToAll,
      countries: [...countryCount.entries()]
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
      within: {
        "3": forWithin.filter((r) => withinDays(r, 3)).length,
        "7": forWithin.filter((r) => withinDays(r, 7)).length,
        "30": forWithin.filter((r) => withinDays(r, 30)).length,
      },
      selectedCategory: selected ? { id: selected.id, name: selected.name, level: selected.level } : null,
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
    const where = productIndexWhere(
      {
        ...q,
        verified: q.verified === "1",
        priceUnpriced: q.priceUnpriced === "1",
        fastReply: q.fastReply === "1",
        currency: resolveVisitorCurrency(q.currency, currentLocale()),
      },
      [],
      { employeeValues: await employeeValuesQuery(this.prisma, q.employees) },
    );
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
    const items = await attachProductFeatures(this.prisma, rows, rows.map(toProductIndexCard));
    return {
      items: this.translations ? await this.translations.localizeProducts(items, rows.map((r) => r.id), currentLocale()) : items,
      total,
      page,
      pageSize: PAGE_SIZE,
    };
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
    const cards = this.translations
      ? await this.translations.localizeProducts(rows.map(toProductIndexCard), rows.map((r) => r.id), currentLocale())
      : rows.map(toProductIndexCard);
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
  async relatedProducts(companySlug: string, productSlug: string) {
    const { ids, ...rest } = await relatedProducts(this.prisma, companySlug, productSlug);
    if (!this.translations) return rest;
    const locale = currentLocale();
    const t = this.translations;
    return {
      fromCompany: { items: await t.localizeProducts(rest.fromCompany.items, ids.fromCompany, locale), total: rest.fromCompany.total },
      similar: await t.localizeProducts(rest.similar, ids.similar, locale),
      popular: await t.localizeProducts(rest.popular, ids.popular, locale),
    };
  }

  /**
   * KATEGORİ ÖNERİSİ (en fazla `SUGGEST_CATEGORY_LIMIT`) — kategori aramasıyla
   * (`CategoryService.searchHierarchical`) AYNI kural ve AYNI sıra
   * (`categoryRowRank`):
   *   · adının tamamı sorguya eşit olan;
   *   · adı YAZILAN kelimeyi taşıyan;
   *   · adı kelimenin KÖKÜNÜ bir sözcüğün başında taşıyan ("boruları" → "boru",
   *     "rulmanlarının" → "rulman", "pipes" → "pipe", "кабели" → "кабел";
   *     `categorySearchStem` — 4 karakterden kısa kök kullanılmaz);
   *   · yazılan kelimeyi yalnız eş anlamlısında taşıyan;
   *   · kökü yalnız eş anlamlısında taşıyan.
   *   Eşitte üst düzey önce. `%` / `_` joker değil düz karakterdir (`likeLiteral`).
   * Tek süzgeç kökken öneri yalnız düzeye göre sıralandığı için kökün başka
   * sözcükte geçtiği üst düzey satırlar beş yerin hepsini alıyordu: "kaplin"
   * (kök "kapl" ⊂ kaplama / kaplı) hiçbir kaplin önermiyor, "cıvata" (kök
   * "civa") "Toksik ve tehlikeli atık temizliği" ile açılıyordu
   * (marketplace-suggest-stem-outranks-typed).
   *
   * Yalnız bağlaçtan oluşan sorguda ("ve", "the") kelime kalmaz; kategori
   * aramasındaki gibi bütün ifade tek kelime sayılır. Eskiden süzgeç boş
   * kalıyor, ilk beş kategori öneriliyordu.
   */
  private async suggestCategories(tokens: string[], query: string) {
    const phrase = foldSearchText(query);
    const folded = tokens.map((t) => foldSearchText(t)).filter(Boolean);
    const terms = folded.length
      ? folded.map((fold) => ({ fold, stem: categorySearchStem(fold) }))
      : [{ fold: phrase, stem: phrase }];
    if (!phrase) return [];
    const find = (form: "fold" | "stem") =>
      this.prisma.category.findMany({
        where: {
          inDiscovery: true,
          level: { gte: 2 },
          ...hiddenCategoryWhere(),
          // Kök yalnız sözcük başında aranır (`stemAtWordStart`); yazılan biçim düz alt dizgi.
          AND: terms.map((t) =>
            form === "fold" || t.stem === t.fold
              ? { searchText: { contains: likeLiteral(t.fold) } }
              : { OR: stemAtWordStart("searchText", likeLiteral(t.stem)) },
          ),
        },
        select: { id: true, ...CATEGORY_NAME_SELECT, level: true, sortOrder: true, searchText: true },
        orderBy: [{ level: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
        take: SUGGEST_CATEGORY_POOL,
      });
    const [typed, byStem] = await Promise.all([
      find("fold"),
      terms.some((t) => t.stem !== t.fold) ? find("stem") : Promise.resolve([]),
    ]);
    const seen = new Set(typed.map((c) => c.id));
    return [...typed, ...byStem.filter((c) => !seen.has(c.id))]
      .map((row) => ({ row, rank: categoryRowRank(row, folded, phrase) }))
      .sort(
        (a, b) =>
          compareCategoryRank(a.rank, b.rank) ||
          a.row.level - b.row.level ||
          a.row.sortOrder - b.row.sortOrder ||
          a.row.id.localeCompare(b.row.id),
      )
      .slice(0, SUGGEST_CATEGORY_LIMIT)
      .map((x) => x.row);
  }

  /**
   * ARAMA ÖNERİSİ — hero kutusunda yazarken: ürün + kategori + firma.
   * Kapılar liste uçlarıyla aynı; kategori yalnız discovery L2+.
   */
  async suggest(raw: string, scope?: string) {
    const q = raw.trim();
    const empty = { products: [], categories: [], companies: [], listings: [] };
    if (q.length < 2) return empty;
    const tokens = tokenizeQuery(q);
    // Kapsam seçiciyle (PROMPT 6) yalnız o grup sorgulanır; kapsam yoksa
    // hepsi (eski çağrı biçimi — hero araması scope göndermiyordu).
    const want = (g: "products" | "companies" | "listings") => !scope || scope === "all" || scope === g;
    const now = new Date();
    const [products, categories, companies, listings] = await Promise.all([
      want("products")
        ? this.prisma.companyItem.findMany({
            where: { ...publicProductWhere(), ...(tokens.length ? { AND: productSearchClauses(q) } : {}) },
            select: {
              id: true,
              name: true,
              slug: true,
              images: true,
              company: { select: { slug: true, name: true } },
            },
            orderBy: [{ completionScore: "desc" }],
            take: 5,
          })
        : [],
      // Kategori önerisi HER kapsamda: kategori hem ürün hem talep listesini
      // süzer, kullanıcının aradığı çoğu zaman dalın kendisidir.
      this.suggestCategories(tokens, q),
      want("companies")
        ? this.prisma.company.findMany({
            where: {
              ...PUBLIC_PROFILE_WHERE,
              // Joker yok: "%%" her firmayı öneriyordu.
              name: { contains: likeLiteral(q), mode: "insensitive" },
            },
            select: { name: true, slug: true, city: true, logoUrl: true },
            take: 5,
          })
        : [],
      want("listings")
        ? this.prisma.listing.findMany({
            // Vitrin kapısı + AÇIK: kapanmış talebi öneri olarak sunmak
            // "teklif ver" beklentisi yaratır. Sahip ADI YOK (anonimlik).
            where: { ...marketplaceListingWhere(now), status: "OPEN", ...this.searchWhere(q) },
            select: { id: true, number: true, title: true, closesAt: true },
            orderBy: [{ publishedAt: "desc" }],
            take: 5,
          })
        : [],
    ]);
    const productHits = products.map((p) => ({
      name: p.name,
      slug: p.slug ?? "",
      companySlug: p.company.slug ?? "",
      companyName: p.company.name,
      image: p.images[0] ?? null,
    }));
    const listingHits = listings.map((l) => ({
      number: l.number,
      slug: listingSlug(l.number ?? "", l.title),
      title: l.title,
      closesAt: l.closesAt?.toISOString() ?? null,
    }));
    return {
      products: this.translations
        ? await this.translations.localizeProducts(productHits, products.map((p) => p.id), currentLocale())
        : productHits,
      categories: categories.map((c) => ({ id: c.id, name: categoryName(c), level: c.level, slug: categorySlug(c.nameTr) })),
      companies: companies.map((c) => ({
        name: c.name,
        slug: c.slug as string,
        city: c.city,
        logoUrl: c.logoUrl,
      })),
      listings: this.translations
        ? await this.translations.localizeListings(listingHits, listings.map((l) => l.id), currentLocale())
        : listingHits,
    };
  }

  /**
   * MEGA MENÜ — L1 segmentler + L2 aileler, ürün sayısıyla (PROMPT 6).
   *
   * Katalog GERÇEK ve gezilebilir: ürünü olmayan dal da listelenir, sayı
   * yalnız > 0 ise basılır (kategori kartıyla aynı kural — "0 ürün" yazmak
   * envanterin azlığını duyurur). Sıra: ürünü olan segment önce, sonra ad.
   */
  async categoryMenu(): Promise<
    { id: string; name: string; count: number; children: { id: string; name: string; count: number }[] }[]
  > {
    const [rows, cats] = await Promise.all([
      this.prisma.companyItem.findMany({
        where: publicProductWhere(),
        select: { categoryId: true },
        take: FACET_SCAN_CAP,
      }),
      this.prisma.category.findMany({
        where: { inDiscovery: true, level: { lte: 2 }, ...hiddenCategoryWhere() },
        select: { id: true, ...CATEGORY_NAME_SELECT, level: true },
      }),
    ]);
    const segCount = new Map<string, number>();
    const famCount = new Map<string, number>();
    for (const r of rows) {
      const id = r.categoryId ?? "";
      if (id.length !== 8) continue;
      const seg = `${id.slice(0, 2)}000000`;
      const fam = `${id.slice(0, 4)}0000`;
      segCount.set(seg, (segCount.get(seg) ?? 0) + 1);
      famCount.set(fam, (famCount.get(fam) ?? 0) + 1);
    }
    const families = cats.filter((c) => c.level === 2);
    return cats
      .filter((c) => c.level === 1)
      .map((seg) => ({
        id: seg.id,
        name: categoryName(seg),
        slug: categorySlug(seg.nameTr),
        count: segCount.get(seg.id) ?? 0,
        children: families
          .filter((f) => f.id.slice(0, 2) === seg.id.slice(0, 2))
          .map((f) => ({ id: f.id, name: categoryName(f), slug: categorySlug(f.nameTr), count: famCount.get(f.id) ?? 0 }))
          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "tr"))
          .slice(0, 12),
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "tr"));
  }

  /**
   * Anasayfa sayı şeridi — gerçek sayımlar; envanter eşiğini web uygular.
   * Teklif sayısının eşiği (`PUBLIC_BIDS_METRIC_MIN_OPEN_DEMANDS`) burada:
   * yanıt anonim ve herkese açık, çizimdeki eşik veriyi gizlemez.
   */
  async stats() {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
    const dayAgo = new Date(now.getTime() - 86_400_000);
    const [products, companies, openDemands, catRows, productsThisWeek, bidsLast24h, verifiedCompanies] = await Promise.all([
      this.prisma.companyItem.count({ where: publicProductWhere() }),
      this.prisma.company.count({ where: PUBLIC_PROFILE_WHERE }),
      this.prisma.listing.count({ where: { ...marketplaceListingWhere(now), status: "OPEN", type: "ALIM" } }),
      this.prisma.companyItem.findMany({
        where: publicProductWhere(),
        select: { categoryId: true },
        take: FACET_SCAN_CAP,
      }),
      // HAREKET metrikleri (2026-09-04): mutlak sayılar erken aşamada küçük;
      // "bu hafta eklenen" ve "son 24 saatte teklif" canlılığı gösterir.
      this.prisma.companyItem.count({ where: { ...publicProductWhere(), publishedAt: { gte: weekAgo } } }),
      this.prisma.listingBid.count({ where: { submittedAt: { gte: dayAgo }, listing: marketplaceListingWhere(now) } }),
      this.prisma.company.count({
        where: { companyVerificationStatus: "VERIFIED", ...PUBLIC_PROFILE_WHERE },
      }),
    ]);
    // "Ürünü olan kategori" sayısı (llms-full.txt envanteri): ürün facet'iyle
    // AYNI kural — yayındaki ürünlerin gizli olmayan 8 haneli kodlarının
    // segmenti (L1), kategori tablosunda var olanlar. Eskiden keşifteki TÜM
    // L1 segmentler sayılıyordu (29), listede ise ürünlü 19 satır vardı
    // (arayüz testi D-077).
    const segments = [
      ...new Set(
        catRows
          .map((r) => r.categoryId)
          .filter((c): c is string => !!c && c.length === 8 && !isHiddenCategory(c))
          .map((c) => `${c.slice(0, 2)}000000`),
      ),
    ];
    const categories = segments.length
      ? await this.prisma.category.count({ where: { id: { in: segments }, ...hiddenCategoryWhere() } })
      : 0;
    // "Popüler aramalar" — arama logu YOK; yedek: ürün sayısı en yüksek 20
    // ALT kategori (L3 sınıf). Etiket web'de "Popüler kategoriler".
    // Gizli segmentin sınıfı SAYILMAZ (2026-10-09): eski bir ürün yüzünden
    // anasayfaya gizli kategoriye giden çip çıkmasın, 20 yerden birini de
    // tüketmesin (ad çözümü de gizliyi vermez — `resolveCategories`).
    const l3 = new Map<string, number>();
    for (const r of catRows) {
      if (r.categoryId && r.categoryId.length === 8 && !isHiddenCategory(r.categoryId)) {
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
      productsThisWeek,
      // Anonim uca ham teklif sayısı yalnız yeterince açık talep varken
      // (derin denetim LU-18): vitrinde tek/az talep varken sayı o talebin
      // kapalı zarftaki teklif sayısını ele verir. Eşik altında 0 — web şeridi
      // sıfır satırı zaten basmaz.
      bidsLast24h: openDemands >= PUBLIC_BIDS_METRIC_MIN_OPEN_DEMANDS ? bidsLast24h : 0,
      verifiedCompanies,
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
  async productFacets(q: PublicProductFacetQueryDto = {}): Promise<{
    categories: { id: string; name: string; level: number; count: number }[];
    subCategories: { id: string; name: string; level: number; count: number }[];
    /** Seçili kategorinin adı — ürünü olmasa da (çip/başlık için). */
    selectedCategory: { id: string; name: string; level: number } | null;
    cities: { city: string; count: number }[];
    /** Satıcı ülkesi sayaçları (`?ulke=`) — web süzgeç grubu + ülke şeridi. */
    countries: { country: string; count: number }[];
    activities: { activity: string; count: number }[];
    verified: number;
    fastReply: number;
    price: { has: number; request: number };
    certifications: { cert: string; count: number }[];
    employees: { key: number; count: number }[];
    moq: Record<string, number>;
    /** Histogramın (ve süzgeç sınırlarının) para birimi — web etiketleri bununla. */
    currency: string;
    priceHistogram: {
      min: number;
      max: number;
      quantiles: { p33: number; p66: number };
      buckets: { from: number; to: number; count: number }[];
    } | null;
    attributes: {
      key: string;
      nameTr: string;
      unit: string | null;
      values: { value: string; count: number }[];
    }[];
    truncated: boolean;
  }> {
    // Sert süzgeçler (arama + kategori) sorguda/bellekte; şehir/faaliyet/
    // doğrulanmış/fiyat "diğer boyutlar" mantığıyla (`contextualFacetCounts`).
    // Sektör listesi kategoriden BAĞIMSIZ kalır (kategori sayfasında başka
    // sektöre geçilebilsin) → tek tarama, kategori süzgeci bellekte.
    const rows = await this.prisma.companyItem.findMany({
      where: { ...publicProductWhere(), ...(q.q ? { AND: productSearchClauses(q.q) } : {}) },
      select: {
        categoryId: true,
        priceMode: true,
        attributes: true,
        moq: true,
        priceAmount: true,
        priceAmountBase: true,
        company: {
          select: {
            city: true,
            cityId: true,
            country: true,
            activities: true,
            companyVerificationStatus: true,
            certifications: true,
            employeeCount: true,
            medianReplyHours: true,
          },
        },
      },
      take: FACET_SCAN_CAP + 1,
    });
    const truncated = rows.length > FACET_SCAN_CAP;
    const scanned = truncated ? rows.slice(0, FACET_SCAN_CAP) : rows;
    // Gizli segmentin kodu süzgeç değildir (2026-10-09; liste ucunda
    // `productIndexWhere` aynı kuralı uygular): sayaçlar süzülmez, seçili
    // kategori / alt dal / nitelik facet'i dönmez.
    const category = visibleCategoryId(q.category) ?? undefined;
    const prefix = category ? categoryPrefix(category) : null;
    const inCategory = prefix ? scanned.filter((r) => (r.categoryId ?? "").startsWith(prefix)) : scanned;
    const sel = {
      city: q.city,
      country: q.country,
      activity: q.activity,
      verified: q.verified === "1",
      price: q.price,
      cert: q.cert,
      employees: q.employees,
      near: q.near,
      radius: q.radius,
      fastReply: q.fastReply === "1",
      currency: resolveVisitorCurrency(q.currency, currentLocale()),
    };
    // `attributes` facet'i ham satırı ister (JSON alanı), sayaçlar eşlenmişi.
    const ctx = contextualFacetCounts(inCategory.map(toFacetRow), sel);
    const catCounts = contextualFacetCounts(scanned.map(toFacetRow), sel).categories;
    const subCounts = subCategoryCounts(inCategory, category);
    // Seçili kategori de çözülür: ürünü olmasa bile çipte/başlıkta ADI
    // yazsın (panel ucuyla aynı kural, bkz. company-items.service).
    const cats = await this.resolveCategories([
      ...new Set([
        ...catCounts.map(([id]) => id),
        ...subCounts.map(([id]) => id),
        ...(category ? [category] : []),
      ]),
    ]);
    const named = (pairs: [string, number][]) =>
      pairs
        .map(([id, count]) => {
          const c = cats.get(id);
          return c ? { ...c, count } : null;
        })
        .filter((c): c is NonNullable<typeof c> => !!c)
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "tr"));
    const selected = category ? cats.get(category) : undefined;
    return {
      categories: named(catCounts),
      /** Seçili kategorinin BİR ALT seviyesi — kategori sayfasının çipleri. */
      subCategories: named(subCounts),
      /** Seçili kategorinin kendisi (ürünü olmasa da). */
      selectedCategory: selected ?? null,
      cities: ctx.cities,
      // Hesaplanıyordu ama yanıta bağlanmamıştı (derin denetim MU-10).
      countries: ctx.countries,
      activities: ctx.activities,
      verified: ctx.verified,
      fastReply: ctx.fastReply,
      price: ctx.price,
      certifications: ctx.certifications,
      employees: ctx.employees,
      moq: ctx.moq,
      currency: sel.currency,
      priceHistogram: ctx.priceHistogram,
      attributes: await attributeFacets(this.prisma, category, inCategory),
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
    { number: string; slug: string; title: string; type: string; updatedAt: string }[]
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
      slug: listingSlug(r.number as string, r.title),
      title: r.title,
      type: r.type,
      updatedAt: r.updatedAt.toISOString(),
    }));
  }
}
