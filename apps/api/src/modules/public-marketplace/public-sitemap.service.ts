import { Injectable, Optional } from "@nestjs/common";
import { LOCALES, type Locale } from "@rothern/i18n";
import { isHiddenCategory } from "@rothern/shared";
import { knownCityName, segmentCodeOf } from "@rothern/shared";
import { PrismaBypassService } from "../../common/prisma/prisma.service";
import { marketplaceIndexableWhere } from "../../common/company/listing-visibility";
import { PUBLIC_PROFILE_WHERE, publicProductWhere } from "../../common/company/public-profile-gate";
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
  /** Ürünü olan iller (yalnız TANINAN il). */
  productCities: { city: string; count: number; lastmod: string }[];
  /** Profili açık firması olan iller. */
  companyCities: { city: string; count: number; lastmod: string }[];
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
   */
  private async localesOf(type: TranslatableEntityType, ids: string[]): Promise<(id: string) => Locale[]> {
    const map = this.translations ? await this.translations.readyLocalesFor(type, ids) : null;
    return (id) => (map ? (map.get(id) ?? [...LOCALES]) : [...LOCALES]);
  }

  async summary(): Promise<SitemapSummary> {
    const now = new Date();
    const [products, companies, listings, productRows, companyRows] = await Promise.all([
      this.bucket(this.prisma.companyItem, publicProductWhere()),
      this.bucket(this.prisma.company, PUBLIC_PROFILE_WHERE),
      this.bucket(this.prisma.listing, { ...marketplaceIndexableWhere(now), number: { not: null } }),
      this.prisma.companyItem.findMany({
        where: publicProductWhere(),
        select: { categoryId: true, updatedAt: true, company: { select: { city: true } } },
        take: SCAN_CAP,
      }),
      this.prisma.company.findMany({
        where: PUBLIC_PROFILE_WHERE,
        select: { city: true, updatedAt: true },
        take: SCAN_CAP,
      }),
    ]);

    const segments = new Map<string, { count: number; lastmod: Date }>();
    const pCities = new Map<string, { count: number; lastmod: Date }>();
    for (const r of productRows) {
      const seg = segmentCodeOf(r.categoryId);
      if (seg) bump(segments, seg, r.updatedAt);
      const city = knownCityName(r.company.city);
      if (city) bump(pCities, city, r.updatedAt);
    }
    const cCities = new Map<string, { count: number; lastmod: Date }>();
    for (const r of companyRows) {
      const city = knownCityName(r.city);
      if (city) bump(cCities, city, r.updatedAt);
    }

    // Gizli segmentler sitemap'e girmez (herkese açık kategori sayfası da 404).
    for (const id of [...segments.keys()]) if (isHiddenCategory(id)) segments.delete(id);
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
        locales: locales(r.id),
      }));
  }

  async companies(page: number): Promise<{ slug: string; updatedAt: string; locales: Locale[] }[]> {
    const rows = await this.prisma.company.findMany({
      where: PUBLIC_PROFILE_WHERE,
      select: { id: true, slug: true, updatedAt: true },
      orderBy: { id: "asc" },
      skip: page * SITEMAP_PAGE_SIZE,
      take: SITEMAP_PAGE_SIZE,
    });
    const locales = await this.localesOf("COMPANY", rows.map((r) => r.id));
    return rows
      .filter((r): r is { id: string; slug: string; updatedAt: Date } => !!r.slug)
      .map((r) => ({ slug: r.slug, updatedAt: r.updatedAt.toISOString(), locales: locales(r.id) }));
  }

  async listings(page: number): Promise<{ number: string; title: string; updatedAt: string; locales: Locale[] }[]> {
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
      locales: locales(r.id),
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

function toCityList(m: Map<string, { count: number; lastmod: Date }>) {
  return [...m.entries()]
    .map(([city, v]) => ({ city, count: v.count, lastmod: v.lastmod.toISOString() }))
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city, "tr"));
}
