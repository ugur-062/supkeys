import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  PUBLIC_PATHS,
  categoryPath,
  cityCompanyPath,
  cityProductPath,
  companyPath,
  knownCityName,
  listingPath,
  productPath,
  segmentCodeOf,
} from "@rothern/shared";
import { resolveWebUrl } from "../../common/config/web-url";
import { PrismaService } from "../../common/prisma/prisma.service";

/**
 * YAYIN ANI → ARAMA MOTORU BİLDİRİMİ (2026-09-09, SEO Parça 5).
 *
 * Kullanıcı kararı: "eklenen her firma, ürün, alım talebi otomatik olarak
 * çok yüksek SEO/GEO'ya sahip olsun." Sayfa şablonu bunun yarısı; diğer
 * yarısı motorun sayfayı NE ZAMAN öğrendiği. Bildirimsiz akışta yeni ürün
 * sitemap'in 1 saatlik önbelleğini, sonra motorun sitemap'i yeniden okuma
 * sırasını bekliyordu — günler. Bu servis iki kanalı aynı anda çalıştırır:
 *
 *  1. IndexNow (api.indexnow.org) — Bing, Yandex, Naver, Seznam ve Bing
 *     indeksinden beslenen üretken motorlar (Copilot; ChatGPT aramasının
 *     büyük bölümü) dakikalar içinde tarar. Google IndexNow'a KATILMIYOR ve
 *     bu içerik tipleri için push API'si de yok (Indexing API yalnız
 *     JobPosting/BroadcastEvent) — Google'a kanal, doğru `lastmod`lu sitemap.
 *  2. Web önbellek tazeleme (`POST /api/seo/revalidate`) — Next.js'in ISR
 *     önbelleğindeki ürün/firma/talep sayfası, ilgili kategori/şehir/dizin
 *     sayfaları ve sitemap parçaları ANINDA yenilenir; Google'ın bir sonraki
 *     sitemap okuması taze `lastmod` görür.
 *
 * TASARIM
 *  · Çağıran yalnız KİMLİK verir (`productChanged(id)`); adresler burada,
 *    web ile AYNI fonksiyondan (`@rothern/shared` public-paths) üretilir.
 *  · Toplu: 5 sn içinde biriken adresler TEK istekte gider (toplu içe
 *    aktarma 500 ürün → 500 HTTP değil 1).
 *  · Fail-open: hiçbir hata iş akışını durdurmaz; uyarı loglanır. Bildirim
 *    kaçırmanın bedeli gecikme, ürünü yayımlayamamanın bedeli ise kayıp.
 *  · Anahtar yoksa kanal SESSİZCE kapalı değil — prod'da bir kez uyarı.
 *  · Test ortamında (NODE_ENV=test) dış çağrı HİÇ yapılmaz.
 *
 * Kapalı içerik BİLDİRİLMEZ: yalnız herkese açık adres üretilir (ürün
 * yayında değilse, firma profili kapalıysa, ilan PUBLIC değilse yalnız
 * "kaldırıldı" anlamında dizin/sitemap tazelenir, sayfa adresi IndexNow'a
 * gitmez — motoru 404/noindex'e yönlendirmek de bir sinyaldir ama gereksiz
 * tarama bütçesi harcar).
 */

const FLUSH_DELAY_MS = 5_000;
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
/** IndexNow tek istekte 10.000 URL kabul eder. */
const INDEXNOW_BATCH = 10_000;

export interface SeoChange {
  /** Web'de `revalidatePath` — kanonik yol (`/firma/acme`). */
  paths: string[];
  /** Web'de `revalidateTag` — veri katmanı etiketleri (`product:acme/boru`). */
  tags: string[];
  /** IndexNow'a gidecek herkese açık sayfa adresleri (yol, mutlak değil). */
  indexNow: string[];
}

/** Sitemap parçaları — web `app/sitemaps/[name]` ile AYNI adlar. */
export const SITEMAP_PATHS = {
  index: "/sitemap.xml",
  products: "/sitemaps/products.xml",
  companies: "/sitemaps/companies.xml",
  listings: "/sitemaps/listings.xml",
  categories: "/sitemaps/categories.xml",
  cities: "/sitemaps/cities.xml",
} as const;

export const SEO_TAGS = {
  products: "seo:products",
  companies: "seo:companies",
  listings: "seo:listings",
  facets: "seo:facets",
  sitemap: "seo:sitemap",
  product: (companySlug: string, slug: string) => `product:${companySlug}/${slug}`,
  company: (slug: string) => `company:${slug}`,
  listing: (number: string) => `listing:${number.toLowerCase()}`,
} as const;

@Injectable()
export class SeoIndexService {
  private readonly logger = new Logger(SeoIndexService.name);
  private readonly pending = {
    paths: new Set<string>(),
    tags: new Set<string>(),
    indexNow: new Set<string>(),
  };
  private timer: NodeJS.Timeout | null = null;
  private warnedMissing = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /* ---------------------------------------------------------------- */
  /* Giriş noktaları — çağıran yalnız kimlik verir                     */
  /* ---------------------------------------------------------------- */

  /** Ürün yayımlandı / güncellendi / vitrinden çekildi / arşivlendi. */
  productChanged(itemId: string): void {
    void this.safely("ürün", async () => {
      const row = await this.prisma.companyItem.findUnique({
        where: { id: itemId },
        select: {
          slug: true,
          isPublic: true,
          isActive: true,
          categoryId: true,
          company: { select: { slug: true, city: true, publicEnabled: true } },
        },
      });
      if (!row?.company.slug) return;
      const visible = row.isPublic && row.isActive && row.company.publicEnabled;
      const change = await this.productChange(row.company.slug, row.slug, row.categoryId, row.company.city, visible);
      this.enqueue(change);
    });
  }

  /** Firma profili açıldı/kapandı/değişti; askıya alındı. */
  companyChanged(companyId: string): void {
    void this.safely("firma", async () => {
      const row = await this.prisma.company.findUnique({
        where: { id: companyId },
        select: { slug: true, city: true, publicEnabled: true, isActive: true, isBlocked: true },
      });
      if (!row?.slug) return;
      const visible = row.publicEnabled && row.isActive && !row.isBlocked;
      const city = knownCityName(row.city);
      const paths = [
        companyPath(row.slug),
        PUBLIC_PATHS.companies,
        ...(city ? [cityCompanyPath(city), cityProductPath(city)] : []),
        SITEMAP_PATHS.index,
        SITEMAP_PATHS.companies,
        SITEMAP_PATHS.products, // ürün sayfaları firma adı/şehri taşır
        SITEMAP_PATHS.cities,
      ];
      this.enqueue({
        paths,
        // `company:<slug>` etiketi firmanın ÜRÜN sayfalarını da yeniler
        // (web `fetchProduct` bu etiketi taşır) — ad/şehir/logo değişince
        // ürün sayfasındaki satıcı bloğu bayat kalmasın.
        tags: [SEO_TAGS.company(row.slug), SEO_TAGS.companies, SEO_TAGS.facets, SEO_TAGS.sitemap],
        indexNow: visible ? [companyPath(row.slug), ...(city ? [cityCompanyPath(city)] : [])] : [],
      });
    });
  }

  /** İlan yayımlandı / kapandı / iptal / kazandırıldı / embargo açıldı. */
  listingChanged(listingId: string): void {
    void this.safely("ilan", async () => {
      const row = await this.prisma.listing.findUnique({
        where: { id: listingId },
        select: {
          number: true,
          title: true,
          status: true,
          visibility: true,
          publicIndexable: true,
          company: { select: { publicListingsEnabled: true, city: true } },
        },
      });
      if (!row?.number) return;
      const path = listingPath(row.number, row.title);
      // Vitrin kapısı `listing-visibility.ts` ile aynı ruh: PUBLIC ∧ firma
      // izinli. Statü/embargo ayrıntısı sayfada çözülür; burada yalnız
      // "adres herkese açık mı" sorusu var.
      const visible = row.visibility === "PUBLIC" && row.company.publicListingsEnabled;
      this.enqueue({
        paths: [path, PUBLIC_PATHS.demands, "/", SITEMAP_PATHS.index, SITEMAP_PATHS.listings],
        tags: [SEO_TAGS.listing(row.number), SEO_TAGS.listings, SEO_TAGS.facets, SEO_TAGS.sitemap],
        indexNow: visible ? [path] : [],
      });
    });
  }

  /* ---------------------------------------------------------------- */
  /* Adres türetme                                                     */
  /* ---------------------------------------------------------------- */

  private async productChange(
    companySlug: string,
    productSlug: string | null,
    categoryId: string | null,
    cityRaw: string | null,
    visible: boolean,
  ): Promise<SeoChange> {
    const segment = segmentCodeOf(categoryId);
    const cat = segment
      ? await this.prisma.category.findUnique({ where: { id: segment }, select: { nameTr: true } })
      : null;
    const city = knownCityName(cityRaw);
    const own = productSlug ? productPath(companySlug, productSlug) : null;
    const catPath = segment && cat ? categoryPath(segment, cat.nameTr) : null;
    const paths = [
      ...(own ? [own] : []),
      companyPath(companySlug),
      PUBLIC_PATHS.products,
      "/",
      ...(catPath ? [catPath] : []),
      ...(city ? [cityProductPath(city)] : []),
      SITEMAP_PATHS.index,
      SITEMAP_PATHS.products,
      SITEMAP_PATHS.categories,
      SITEMAP_PATHS.cities,
      "/llms-full.txt",
    ];
    return {
      paths,
      tags: [
        ...(productSlug ? [SEO_TAGS.product(companySlug, productSlug)] : []),
        SEO_TAGS.company(companySlug),
        SEO_TAGS.products,
        SEO_TAGS.facets,
        SEO_TAGS.sitemap,
      ],
      indexNow: visible && own ? [own, companyPath(companySlug), ...(catPath ? [catPath] : [])] : [],
    };
  }

  /* ---------------------------------------------------------------- */
  /* Kuyruk                                                            */
  /* ---------------------------------------------------------------- */

  enqueue(change: SeoChange): void {
    if (this.config.get<string>("NODE_ENV") === "test") return;
    for (const p of change.paths) this.pending.paths.add(p);
    for (const t of change.tags) this.pending.tags.add(t);
    for (const u of change.indexNow) this.pending.indexNow.add(u);
    if (!this.timer) {
      this.timer = setTimeout(() => void this.flush(), FLUSH_DELAY_MS);
      // Süreç kapanırken kuyruk bekletmesin (test/CLI).
      this.timer.unref?.();
    }
  }

  /** Bekleyenleri gönderir. Testler ve kapanış için dışa açık. */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const paths = [...this.pending.paths];
    const tags = [...this.pending.tags];
    const indexNow = [...this.pending.indexNow];
    this.pending.paths.clear();
    this.pending.tags.clear();
    this.pending.indexNow.clear();
    if (paths.length === 0 && tags.length === 0 && indexNow.length === 0) return;
    await Promise.all([this.revalidateWeb(paths, tags), this.submitIndexNow(indexNow)]);
  }

  /* ---------------------------------------------------------------- */
  /* Kanal 1 — web önbellek tazeleme                                   */
  /* ---------------------------------------------------------------- */

  private async revalidateWeb(paths: string[], tags: string[]): Promise<void> {
    if (paths.length === 0 && tags.length === 0) return;
    const secret = this.config.get<string>("SEO_REVALIDATE_SECRET");
    if (!secret) {
      this.warnOnce("SEO_REVALIDATE_SECRET", "web önbellek tazeleme KAPALI — yeni içerik ISR süresini bekler");
      return;
    }
    const base = resolveWebUrl(this.config);
    try {
      const res = await fetch(`${base}/api/seo/revalidate`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-seo-secret": secret },
        body: JSON.stringify({ paths, tags }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        this.logger.warn(`Web tazeleme HTTP ${res.status} (${paths.length} yol, ${tags.length} etiket)`);
        return;
      }
      this.logger.log(`Web tazelendi: ${paths.length} yol, ${tags.length} etiket`);
    } catch (err) {
      this.logger.warn(`Web tazeleme başarısız: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Kanal 2 — IndexNow                                                */
  /* ---------------------------------------------------------------- */

  private async submitIndexNow(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    const key = this.config.get<string>("INDEXNOW_KEY");
    if (!key) {
      this.warnOnce("INDEXNOW_KEY", "IndexNow bildirimi KAPALI — Bing/Yandex yeni sayfayı sitemap'ten öğrenir");
      return;
    }
    const base = resolveWebUrl(this.config);
    // Localhost'u dış motora bildirmek anlamsız (dev): sessizce atla.
    if (/localhost|127\.0\.0\.1/i.test(base)) return;
    const host = new URL(base).host;
    const urlList = paths.map((p) => `${base}${p}`);
    for (let i = 0; i < urlList.length; i += INDEXNOW_BATCH) {
      const batch = urlList.slice(i, i + INDEXNOW_BATCH);
      try {
        const res = await fetch(INDEXNOW_ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify({
            host,
            key,
            // Anahtar dosyası web'de `/indexnow/<key>.txt` (route handler) —
            // kök dizine statik dosya koymak yerine env'den doğrulanır.
            keyLocation: `${base}/indexnow/${key}.txt`,
            urlList: batch,
          }),
          signal: AbortSignal.timeout(10_000),
        });
        // 200 ve 202 başarı; 4xx anahtar/host sorunu — sessiz kalmasın.
        if (res.status !== 200 && res.status !== 202) {
          this.logger.warn(`IndexNow HTTP ${res.status} (${batch.length} adres)`);
          continue;
        }
        this.logger.log(`IndexNow: ${batch.length} adres bildirildi`);
      } catch (err) {
        this.logger.warn(`IndexNow başarısız: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  /* ---------------------------------------------------------------- */

  private async safely(label: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.warn(`SEO bildirimi hazırlanamadı (${label}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private warnOnce(key: string, msg: string): void {
    if (this.warnedMissing.has(key)) return;
    this.warnedMissing.add(key);
    if (this.config.get<string>("NODE_ENV") === "production") {
      this.logger.warn(`${key} tanımsız — ${msg}`);
    } else {
      this.logger.debug(`${key} tanımsız (dev) — ${msg}`);
    }
  }
}
