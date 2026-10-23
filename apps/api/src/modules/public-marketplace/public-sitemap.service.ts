import { Injectable, Optional } from "@nestjs/common";
import { Prisma } from "@rothern/db";
import { LOCALES, type Locale } from "@rothern/i18n";
import { isHiddenCategory } from "@rothern/shared";
import { segmentCodeOf } from "@rothern/shared";
import { geoIndex } from "../../common/geo/geo-index";
import { PrismaBypassService } from "../../common/prisma/prisma.service";
import { marketplaceIndexableWhere } from "../../common/company/listing-visibility";
import { PUBLIC_PROFILE_WHERE, isProfileIndexable, publicProductWhere } from "../../common/company/public-profile-gate";
import { ContentTranslationService } from "../content-translation/content-translation.service";
import type { TranslatableEntityType } from "../content-translation/content-translation.logic";

/**
 * SİTEMAP KAYNAĞI — sayfalı + görselli + gerçek `lastmod` (SEO Parça 5).
 *
 * Eski uçlar (`/public/companies/products/sitemap` vb.) tek parça ve 45.000
 * satırla kırpılıyordu; sitemap dosya başına 50.000 URL sınırı vardır ve
 * vitrin büyüdüğünde geri kalan sessizce indeksten düşerdi. Web artık
 * sitemap İNDEKSİ üretiyor (`/sitemap.xml` → `/sitemaps/products-N.xml`);
 * bu servis parçaları `page` ile verir, toplamı `summary` söyler.
 *
 * `lastmod` UYDURULMAZ: kategori ve şehir sayfalarının tarihi o daldaki EN
 * YENİ ürünün `updatedAt`ıdır — "şimdi" yazmak her saat sahte değişim
 * bildirmek olur ve Google `lastmod`a güvenmeyi bırakır.
 *
 * Görseller ürün sitemap'ine girer (Google image sitemap uzantısı):
 * "çelik boru" görsel aramasında vitrin fotoğrafı çıkar, sayfaya trafik gelir.
 */

/**
 * Kayıt/parça. Her kayıt HER HAZIR DİLİNDE ayrı `<url>` girdisi üretir
 * (i18n SEO 2026-09-26) — 5.000 × 3 dil = 15.000 URL; 5 dile çıkınca 25.000.
 * Protokol sınırı 50.000 URL ve 50 MB; girdi başına 4-6 hreflang + 3 görsel
 * ~1,5 KB → parça ~22 MB. Web `PART_PAGE_SIZE` ile AYNI olmalı.
 */
export const SITEMAP_PAGE_SIZE = 5_000;
/** Bellekte taranan ürün tavanı (facet tarayıcısıyla aynı disiplin). */
const SCAN_CAP = 200_000;

export interface SitemapProductRow {
  companySlug: string;
  slug: string;
  name: string;
  updatedAt: string;
  images: string[];
  /** Sayfanın kendi dilinde gösterilebildiği diller (çevirisi hazır olanlar). */
  locales: Locale[];
  /** Dil başına `lastmod` (hazır diller) — bkz. `SitemapLocales`. */
  lastmods?: Partial<Record<Locale, string>>;
}

/**
 * Kaydın sitemap dil girdileri (2026-09-27): `locales` hazır diller;
 * `lastmods[l]` = max(varlık `updatedAt`, o dilin çeviri zamanı) — EN/RU
 * sayfası yeniden çevrilince yalnız o dilin `lastmod`u ilerler. Kaynak dilde
 * çeviri satırı yok → varlığın kendi zamanı. Çeviri tablosu okunamazsa
 * `lastmods` yazılmaz (web `updatedAt`e düşer).
 */
export interface SitemapLocales {
  locales: Locale[];
  lastmods?: Partial<Record<Locale, string>>;
}

export interface SitemapBucket {
  count: number;
  /** ISO — kümede en yeni güncelleme; küme boşsa null. */
  lastmod: string | null;
}

export interface SitemapSummary {
  products: SitemapBucket;
  companies: SitemapBucket;
  listings: SitemapBucket;
  /** Segment (L1) kategorileri — yalnız ürünü olanlar. */
  categories: { id: string; name: string; count: number; lastmod: string }[];
  /**
   * Ürünü olan şehirler — DÜNYA GENELİ (2026-09-27; eskiden yalnız 81 il).
   * `city` = şehir sayfasının KALICI ADRESİ ("bursa", "de-munich"), `name`
   * Türkçe ad, `country` ISO.
   */
  productCities: { city: string; name: string; country: string; count: number; lastmod: string }[];
  /** Profili açık firması olan şehirler (aynı biçim). */
  companyCities: { city: string; name: string; country: string; count: number; lastmod: string }[];
  /** Ürünü olan satıcı ülkeleri — ülke sayfaları (2026-09-27). */
  productCountries: { country: string; count: number; lastmod: string }[];
}

@Injectable()
export class PublicSitemapService {
  constructor(
    private readonly prisma: PrismaBypassService,
    // SONDA ve @Optional (rig stub kuralı): yoksa her kayıt tüm dillerde listelenir.
    @Optional() private readonly translations?: ContentTranslationService,
  ) {}

  /**
   * Kayıt başına HAZIR diller — sayfanın `noindex`iyle aynı kural
   * (`readyLocales`): çevirisi gelmemiş dil sitemap'e ve hreflang'e girmez.
   * Yanında dil başına `lastmod` (bkz. `SitemapLocales`).
   */
  private async localesOf(
    type: TranslatableEntityType,
    ids: string[],
  ): Promise<(id: string, updatedAt: Date) => SitemapLocales> {
    const map = this.translations ? await this.translations.sitemapLocalesFor(type, ids) : null;
    return (id, updatedAt) => {
      const row = map?.get(id);
      if (!map || !row) return { locales: [...LOCALES] };
      const lastmods: Partial<Record<Locale, string>> = {};
      for (const l of row.locales) {
        const at = row.translatedAt[l];
        lastmods[l] = (at && at > updatedAt ? at : updatedAt).toISOString();
      }
      return { locales: row.locales, lastmods };
    };
  }

  /**
   * Parça `lastmod`u: varlığın en yeni `updatedAt`i ile o türün en yeni
   * ÇEVİRİSİNDEN büyük olanı — yalnız çeviri güncellenince de (EN/RU girdisinin
   * `lastmod`u ilerledi) indeks parçayı "değişti" göstersin. Çeviri satırı
   * görünmeyen bir kayda ait olabilir; bedeli yalnız fazladan bir parça
   * taraması (tarih uydurulmuyor, gerçek bir yazım zamanı).
   */
  private async withTranslations(type: TranslatableEntityType, b: SitemapBucket): Promise<SitemapBucket> {
    if (!this.translations || b.count === 0) return b;
    try {
      const agg = await this.prisma.contentTranslation.aggregate({
        where: { entityType: type, status: "DONE", fields: { not: Prisma.DbNull } },
        _max: { updatedAt: true },
      });
      const t = agg._max.updatedAt;
      return t && (!b.lastmod || t.toISOString() > b.lastmod) ? { ...b, lastmod: t.toISOString() } : b;
    } catch {
      return b;
    }
  }

  async summary(): Promise<SitemapSummary> {
    const now = new Date();
    const [products, companies, listings, productRows, companyRows] = await Promise.all([
      this.bucket(this.prisma.companyItem, publicProductWhere()).then((b) => this.withTranslations("PRODUCT", b)),
      this.bucket(this.prisma.company, PUBLIC_PROFILE_WHERE).then((b) => this.withTranslations("COMPANY", b)),
      this.bucket(this.prisma.listing, { ...marketplaceIndexableWhere(now), number: { not: null } }).then((b) =>
        this.withTranslations("LISTING", b),
      ),
      this.prisma.companyItem.findMany({
        where: publicProductWhere(),
        select: { categoryId: true, updatedAt: true, company: { select: { cityId: true, country: true } } },
        take: SCAN_CAP,
      }),
      this.prisma.company.findMany({
        where: PUBLIC_PROFILE_WHERE,
        select: { cityId: true, updatedAt: true },
        take: SCAN_CAP,
      }),
    ]);

    const segments = new Map<string, { count: number; lastmod: Date }>();
    const pCities = new Map<string, { count: number; lastmod: Date }>();
    const pCountries = new Map<string, { count: number; lastmod: Date }>();
    for (const r of productRows) {
      // Gizli dallar sitemap'e girmez (herkese açık kategori sayfası da 404).
      // Süzme segmente yuvarlamadan ÖNCE, ürünün KENDİ koduyla (2026-10-10):
      // görünür segmentin gizli dalındaki ürün (`4610…`) o segmentin sayısına
      // da `lastmod`una da girmez — sayfada listelenmediği için.
      const seg = isHiddenCategory(r.categoryId) ? null : segmentCodeOf(r.categoryId);
      if (seg) bump(segments, seg, r.updatedAt);
      if (r.company.cityId != null) bump(pCities, String(r.company.cityId), r.updatedAt);
      if (r.company.country) bump(pCountries, r.company.country, r.updatedAt);
    }
    const cCities = new Map<string, { count: number; lastmod: Date }>();
    for (const r of companyRows) {
      if (r.cityId != null) bump(cCities, String(r.cityId), r.updatedAt);
    }

    const cats = segments.size
      ? await this.prisma.category.findMany({
          where: { id: { in: [...segments.keys()] } },
          select: { id: true, nameTr: true },
        })
      : [];
    const catName = new Map(cats.map((c) => [c.id, c.nameTr]));

    return {
      products,
      companies,
      listings,
      categories: [...segments.entries()]
        .filter(([id]) => catName.has(id))
        .map(([id, v]) => ({ id, name: catName.get(id) as string, count: v.count, lastmod: v.lastmod.toISOString() }))
        .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id)),
      productCities: toCityList(pCities),
      companyCities: toCityList(cCities),
      productCountries: [...pCountries.entries()]
        .map(([country, v]) => ({ country, count: v.count, lastmod: v.lastmod.toISOString() }))
        .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country)),
    };
  }

  async products(page: number): Promise<SitemapProductRow[]> {
    const rows = await this.prisma.companyItem.findMany({
      where: publicProductWhere(),
      select: {
        id: true,
        slug: true,
        name: true,
        images: true,
        updatedAt: true,
        company: { select: { slug: true } },
      },
      // Sıra KARARLI olmalı: sayfalar arasında kayma, bir ürünü iki dosyaya
      // ya da hiçbirine düşürür. `updatedAt` her düzenlemede değişir → id.
      orderBy: { id: "asc" },
      skip: page * SITEMAP_PAGE_SIZE,
      take: SITEMAP_PAGE_SIZE,
    });
    const locales = await this.localesOf("PRODUCT", rows.map((r) => r.id));
    return rows
      .filter((r) => r.slug && r.company.slug)
      .map((r) => ({
        companySlug: r.company.slug as string,
        slug: r.slug as string,
        name: r.name,
        updatedAt: r.updatedAt.toISOString(),
        images: r.images.slice(0, 3),
        ...locales(r.id, r.updatedAt),
      }));
  }

  async companies(page: number): Promise<({ slug: string; updatedAt: string } & SitemapLocales)[]> {
    const rows = await this.prisma.company.findMany({
      where: PUBLIC_PROFILE_WHERE,
      select: {
        id: true,
        slug: true,
        updatedAt: true,
        aboutText: true,
        logoUrl: true,
        website: true,
        // Sayfanın sayımıyla AYNI kapı (`public-profile.service` getBySlug).
        _count: { select: { items: { where: publicProductWhere() } } },
      },
      orderBy: { id: "asc" },
      skip: page * SITEMAP_PAGE_SIZE,
      take: SITEMAP_PAGE_SIZE,
    });
    // VİTRİN ≠ İNDEKS: yalnız indekslenebilir profil — sayfanın `robots`u AYNI
    // fonksiyonu okur (`isProfileIndexable`). Bu süzgeç eski `listPublicSlugs`
    // ucundaydı; web bu servise geçince düştü ve sitemap `noindex` taşıyan
    // profilleri listeliyordu (yerel SEO denetimi 2026-09-26).
    const indexable = rows.filter(
      (r) =>
        !!r.slug &&
        isProfileIndexable({ aboutText: r.aboutText, logoUrl: r.logoUrl, website: r.website, publicProductCount: r._count.items }),
    );
    const locales = await this.localesOf("COMPANY", indexable.map((r) => r.id));
    return indexable.map((r) => ({ slug: r.slug as string, updatedAt: r.updatedAt.toISOString(), ...locales(r.id, r.updatedAt) }));
  }

  async listings(page: number): Promise<({ number: string; title: string; updatedAt: string } & SitemapLocales)[]> {
    const rows = await this.prisma.listing.findMany({
      where: { ...marketplaceIndexableWhere(new Date()), number: { not: null } },
      select: { id: true, number: true, title: true, updatedAt: true },
      orderBy: { id: "asc" },
      skip: page * SITEMAP_PAGE_SIZE,
      take: SITEMAP_PAGE_SIZE,
    });
    const locales = await this.localesOf("LISTING", rows.map((r) => r.id));
    return rows.map((r) => ({
      number: r.number as string,
      title: r.title,
      updatedAt: r.updatedAt.toISOString(),
      ...locales(r.id, r.updatedAt),
    }));
  }

  /** count + max(updatedAt) — tek `aggregate`, tam tarama yok. */
  private async bucket(
    model: { aggregate: (args: any) => Promise<any> }, // eslint-disable-line @typescript-eslint/no-explicit-any
    where: object,
  ): Promise<SitemapBucket> {
    const agg = await model.aggregate({ where, _count: { _all: true }, _max: { updatedAt: true } });
    const max = agg._max?.updatedAt as Date | null | undefined;
    return { count: agg._count?._all ?? 0, lastmod: max ? max.toISOString() : null };
  }
}

function bump(m: Map<string, { count: number; lastmod: Date }>, key: string, at: Date): void {
  const cur = m.get(key);
  if (!cur) m.set(key, { count: 1, lastmod: at });
  else {
    cur.count++;
    if (at > cur.lastmod) cur.lastmod = at;
  }
}

/** `cityId` → şehir sayfası satırı (kalıcı adres + Türkçe ad); listede olmayan id düşer. */
function toCityList(m: Map<string, { count: number; lastmod: Date }>) {
  const idx = geoIndex();
  const out: { city: string; name: string; country: string; count: number; lastmod: string }[] = [];
  for (const [id, v] of m) {
    const row = idx.byId(Number(id));
    if (row) out.push({ city: row.slug, name: idx.label(row, "tr"), country: row.countryCode, count: v.count, lastmod: v.lastmod.toISOString() });
  }
  return out.sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
}
