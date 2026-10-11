import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  PUBLIC_PATHS,
  categoryPath,
  cityProductPath,
  companyPath,
  countryProductPath,
  listingPath,
  productPath,
  segmentCodeOf,
  visibleCategoryId,
} from "@rothern/shared";
import { LOCALES } from "@rothern/i18n";
import { localizeAppPath } from "../../common/company/app-routes";
import { resolveWebUrl } from "../../common/config/web-url";
import { PrismaBypassService } from "../../common/prisma/prisma.service";
import { geoIndex } from "../../common/geo/geo-index";

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

/** Dış arama motorlarına YALNIZ bu konak bildirilir. */
const CANONICAL_WEB_HOST = "www.rothern.com";

function isCanonicalWebHost(base: string): boolean {
  try {
    return new URL(base).host === CANONICAL_WEB_HOST;
  } catch {
    return false;
  }
}
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
  countries: "/sitemaps/countries.xml",
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

/**
 * IndexNow adres listesi — her Türkçe İÇ yolun üç dildeki DIŞ adresi
 * (i18n SEO, 2026-09-25). `/en/products/…`, `/ru/tovary/…` ayrı adreslerdir;
 * yalnız Türkçe bildirilirse motor EN/RU sayfayı ancak sitemap turunda öğrenir.
 */
export function localizedIndexNowUrls(base: string, paths: string[]): string[] {
  return [...new Set(paths.flatMap((p) => LOCALES.map((l) => `${base}${localizeAppPath(p, l)}`)))];
}

/**
 * `marketplaceIndexableWhere` (common/company/listing-visibility.ts) kuralının
 * bellek içi karşılığı — ikisi birlikte değişmeli: vitrin (PUBLIC, yayımlanmış,
 * embargo geçmiş, firma vitrini açık ve aktif) ∧ status OPEN ∧ publicIndexable.
 */
export function isListingIndexable(
  row: {
    status: string;
    visibility: string;
    publicIndexable: boolean;
    publishedAt: Date | null;
    bidsOpenAt: Date | null;
    company: { publicListingsEnabled: boolean; isActive: boolean; isBlocked: boolean };
  },
  now: Date,
): boolean {
  return (
    row.visibility === "PUBLIC" &&
    row.status === "OPEN" &&
    row.publicIndexable &&
    row.publishedAt != null &&
    (row.bidsOpenAt == null || row.bidsOpenAt.getTime() <= now.getTime()) &&
    row.company.publicListingsEnabled &&
    row.company.isActive &&
    !row.company.isBlocked
  );
}

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

  /**
   * BYPASS istemcisi (yayın denetimi 2026-09-28): çağıranların çoğu firma
   * bağlamı OLMADAN koşar — admin ürün onayı/reddi, çeviri süpürücüsü (cron),
   * admin backfill. RLS açıkken kısıtlı istemci `company_items`i bağlamsız
   * göremez, satır null döner ve bildirim sessizce gitmezdi: onaylanan ürün
   * IndexNow'a ve web tazelemesine hiç girmiyordu. Okumalar yalnız kimlikle,
   * sonuç kullanıcıya dönmez.
   */
  constructor(
    private readonly prisma: PrismaBypassService,
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
          company: { select: { slug: true, cityId: true, country: true, publicEnabled: true } },
        },
      });
      if (!row?.company.slug) return;
      const visible = row.isPublic && row.isActive && row.company.publicEnabled;
      const change = await this.productChange(row.company.slug, row.slug, row.categoryId, row.company.cityId, row.company.country, visible);
      this.enqueue(change);
    });
  }

  /**
   * Firma profili açıldı/kapandı/değişti; askıya alındı.
   * `removed`: satır SERT SİLİNDİ (KVKK) — okuma artık boş döner, bu yüzden
   * çağıran silmeden önce okuduğu slug/şehir/ülkeyi verir; görünmez sayılır.
   */
  companyChanged(
    companyId: string,
    removed?: { slug: string | null; cityId: number | null; country: string | null },
  ): void {
    void this.safely("firma", async () => {
      const row = removed
        ? { ...removed, publicEnabled: false, isActive: false, isBlocked: true }
        : await this.prisma.company.findUnique({
            where: { id: companyId },
            select: { slug: true, cityId: true, country: true, publicEnabled: true, isActive: true, isBlocked: true },
          });
      if (!row?.slug) return;
      const visible = row.publicEnabled && row.isActive && !row.isBlocked;
      // Şehir sayfası dünya şehir listesinden (2026-09-27); firma şehir sayfası
      // (`/firmalar/sehir`) 2026-09-22'de kalktı — 308 döner, bildirilmez.
      const city = geoIndex().byId(row.cityId);
      // Şehir/ülke açılış sayfaları firmanın ürünlerini listeler: firma
      // açılınca/kapanınca/taşınınca o sayfaların içeriği değişir → IndexNow'a
      // da gider (2026-09-27 SEO denetimi; eskiden yalnız tazeleniyordu).
      const geoPaths = [
        ...(city ? [cityProductPath(city.slug)] : []),
        ...(row.country ? [countryProductPath(row.country)] : []),
      ];
      const paths = [
        companyPath(row.slug),
        PUBLIC_PATHS.companies,
        ...geoPaths,
        SITEMAP_PATHS.index,
        SITEMAP_PATHS.companies,
        SITEMAP_PATHS.products, // ürün sayfaları firma adı/şehri taşır
        SITEMAP_PATHS.cities,
        SITEMAP_PATHS.countries,
      ];
      this.enqueue({
        paths,
        // `company:<slug>` etiketi firmanın ÜRÜN sayfalarını da yeniler
        // (web `fetchProduct` bu etiketi taşır) — ad/şehir/logo değişince
        // ürün sayfasındaki satıcı bloğu bayat kalmasın.
        tags: [SEO_TAGS.company(row.slug), SEO_TAGS.companies, SEO_TAGS.facets, SEO_TAGS.sitemap],
        indexNow: visible ? [companyPath(row.slug), ...geoPaths] : [],
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
          publishedAt: true,
          bidsOpenAt: true,
          company: {
            select: { publicListingsEnabled: true, isActive: true, isBlocked: true, city: true },
          },
        },
      });
      if (!row?.number) return;
      const path = listingPath(row.number, row.title);
      // IndexNow kapısı = `marketplaceIndexableWhere` (sitemap ile aynı kural).
      // Derin denetim LU-19: yalnız PUBLIC ∧ firma izinli bakılıyordu →
      // embargolu (bidsOpenAt gelecekte), indekse kapatılmış (publicIndexable
      // =false) ya da kapanmış talebin başlık slug'lı adresi motorlara gidiyor,
      // başlık açılıştan önce üçüncü tarafa sızıyordu. Tazeleme koşulsuz kalır.
      const visible = isListingIndexable(row, new Date());
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
    cityId: number | null,
    country: string | null,
    visible: boolean,
  ): Promise<SeoChange> {
    // Gizli segmentin kategori sayfası YOK (web 404): gizli segmentteki eski
    // ürün yayımlanınca / güncellenince o adres ne tazelenir ne de IndexNow'a
    // gider (2026-10-09 — eskiden gizli segmentin `/urunler/kategori/…` adresi
    // üç dilde Bing/Yandex'e bildiriliyordu). Ürünün ve firmanın kendi sayfası
    // gider. Süzme segmente yuvarlamadan ÖNCE, ürünün KENDİ koduyla
    // (2026-10-10): görünür segmentin gizli dalındaki ürün (`4610…`) o
    // segmentin sayfasında listelenmez → o sayfa da tazelenmez / bildirilmez.
    const segment = segmentCodeOf(visibleCategoryId(categoryId));
    const cat = segment
      ? await this.prisma.category.findUnique({ where: { id: segment }, select: { nameTr: true } })
      : null;
    const city = geoIndex().byId(cityId);
    const own = productSlug ? productPath(companySlug, productSlug) : null;
    const catPath = segment && cat ? categoryPath(segment, cat.nameTr) : null;
    // Şehir/ülke açılış sayfaları (dünya geneli, 2026-09-27) kategori sayfası
    // gibi ürün listesidir → yayında IndexNow'a da gider (üç dilde).
    const geoPaths = [
      ...(city ? [cityProductPath(city.slug)] : []),
      ...(country ? [countryProductPath(country)] : []),
    ];
    const paths = [
      ...(own ? [own] : []),
      companyPath(companySlug),
      PUBLIC_PATHS.products,
      "/",
      ...(catPath ? [catPath] : []),
      ...geoPaths,
      SITEMAP_PATHS.index,
      SITEMAP_PATHS.products,
      SITEMAP_PATHS.categories,
      SITEMAP_PATHS.cities,
      SITEMAP_PATHS.countries,
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
      indexNow: visible && own ? [own, companyPath(companySlug), ...(catPath ? [catPath] : []), ...geoPaths] : [],
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
    /**
     * YALNIZ CANLI ALAN ADI BİLDİRİR (2026-09-13).
     *
     * Staging'in Render ortamında da `INDEXNOW_KEY` tanımlıydı: demo ortamı
     * Bing/Yandex'e "staging.rothern.com/... adresini tara" diyordu (staging 2026-09-15'te staging.supkeys.com'a taşındı; kapı alan adından bağımsız). Bu hem
     * canlıyla yinelenen içerik üretir hem de yayınlanmamış veriyi dış motora
     * duyurur. Kapı ENV DİSİPLİNİNE bırakılmaz — adresten anlaşılır.
     */
    if (!isCanonicalWebHost(base)) {
      this.warnOnce(
        "INDEXNOW_HOST",
        `IndexNow atlandı — ${new URL(base).host} canlı alan adı değil (yalnız ${CANONICAL_WEB_HOST} bildirir)`,
      );
      return;
    }
    const host = new URL(base).host;
    const urlList = localizedIndexNowUrls(base, paths);
    for (let i = 0; i < urlList.length; i += INDEXNOW_BATCH) {
      const batch = urlList.slice(i, i + INDEXNOW_BATCH);
      try {
        const res = await fetch(INDEXNOW_ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify({
            host,
            key,
            // KÖK konum ŞART: IndexNow anahtar dosyasının bulunduğu DİZİN,
            // bildirilebilecek adreslerin kapsamını sınırlar. `/indexnow/`
            // altını gösterirken canlı 422 döndürüyordu ("URLs are not
            // related to your site"); kökten gösterince tüm site kapsama
            // girer. Web tarafı aynı dosyayı `next.config.ts` rewrite'ıyla
            // hem kökten hem `/indexnow/<key>.txt`ten servis eder.
            // kök dizine statik dosya koymak yerine env'den doğrulanır.
            keyLocation: `${base}/${key}.txt`,
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
