import { Controller, Get, Header, Param, Query, UseGuards } from "@nestjs/common";
import { MarketplaceLiveGuard } from "../../common/http/marketplace-live.guard";
import { PublicProductQueryDto } from "./dto/public-product-query.dto";
import { Throttle } from "@nestjs/throttler";
import { PublicProfileService } from "./public-profile.service";

/**
 * Auth gerektirmeyen herkese açık profil — SEO sayfası + sitemap.
 * (Firma DİZİNİ buradan çıktı: giriş gerektiriyor → `company-directory`.)
 *
 * Hız sınırı ve önbellek gerekçeleri `public-marketplace.controller.ts` ile
 * aynı: çağıran çoğunlukla Next.js sunucusu, yani tüm ziyaretçiler tek IP.
 */
@Controller("public/companies")
@Throttle({
  default: {
    limit: Number(process.env.THROTTLE_PUBLIC_LIMIT ?? 600),
    ttl: 60_000,
  },
})
export class PublicProfileController {
  constructor(private readonly service: PublicProfileService) {}

  // ":slug"den ÖNCE tanımlı olmalı (statik rota önceliği).
  @Get("sitemap")
  @Header("Cache-Control", "public, max-age=0, s-maxage=900, stale-while-revalidate=3600")
  sitemap() {
    return this.service.listPublicSlugs();
  }

  /**
   * ÜRÜN SİTEMAP'İ — pazar yeri anahtarına TABİ.
   *
   * Ayrım (2026-09-03): GÖRÜNÜRLÜK ile İNDEKSLENME farklı sorular.
   * Ürün sayfası firmanın kendi profilinin ALTINDA yaşıyor ve profil zaten
   * herkese açık; sayfayı kapatmak, panelde "vitrinde yayımlandı" diyip
   * bağlantıyı 404 vermek demekti. İndekslenme ise ayrı ve kapalı kalır:
   * sitemap bu anahtara bağlı, sayfa da anahtar kapalıyken `noindex` alıyor.
   *
   * Statik rotalar ":slug"den ÖNCE tanımlı olmalı.
   */
  @Get("products/sitemap")
  @UseGuards(MarketplaceLiveGuard)
  @Header("Cache-Control", "public, max-age=0, s-maxage=900, stale-while-revalidate=3600")
  productSitemap() {
    return this.service.productSitemap();
  }

  /**
   * Anonim dizin özeti — sayı + kategori dağılımı, kimlik yok. Dizinin
   * kendisi `company/directory` (JWT). Statik rota ":slug"den ÖNCE.
   */
  @Get("summary")
  @Header("Cache-Control", "public, max-age=0, s-maxage=600, stale-while-revalidate=3600")
  summary() {
    return this.service.directorySummary();
  }

  /** Firmanın vitrindeki ürünleri — profil kapısıyla aynı görünürlük. */
  @Get(":slug/products")
  @Header("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=900")
  products(
    @Param("slug") slug: string,
    @Query() q: PublicProductQueryDto,
  ) {
    return this.service.listPublicProducts(slug, q);
  }

  @Get(":slug/products/:productSlug")
  @Header("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=900")
  product(
    @Param("slug") slug: string,
    @Param("productSlug") productSlug: string,
  ) {
    return this.service.getPublicProduct(slug, productSlug);
  }

  @Get(":slug")
  @Header("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=900")
  bySlug(@Param("slug") slug: string) {
    return this.service.getBySlug(slug);
  }
}
