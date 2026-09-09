import { Controller, Get, Header, Query, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { MarketplaceLiveGuard } from "../../common/http/marketplace-live.guard";
import { SitemapPageDto } from "./dto/sitemap-page.dto";
import { PublicSitemapService } from "./public-sitemap.service";

/**
 * Sitemap kaynağı (SEO Parça 5) — yalnız Next.js sunucusu çağırır.
 * Anahtara tabi: kapalıyken 404 → web boş sitemap üretir.
 *
 * Önbellek kısa (5 dk): yayın anı bildirimi web'in ISR önbelleğini anında
 * tazeler ama web bu ucu yeniden çağırdığında CDN bayat yanıt verirse
 * tazeleme boşa gider; `s-maxage` bu yüzden sitemap'in kendi süresinden kısa.
 */
@Controller("public/sitemap")
@UseGuards(MarketplaceLiveGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class PublicSitemapController {
  constructor(private readonly service: PublicSitemapService) {}

  @Get("summary")
  @Header("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=900")
  summary() {
    return this.service.summary();
  }

  @Get("products")
  @Header("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=900")
  products(@Query() q: SitemapPageDto) {
    return this.service.products(q.page);
  }

  @Get("companies")
  @Header("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=900")
  companies(@Query() q: SitemapPageDto) {
    return this.service.companies(q.page);
  }

  @Get("listings")
  @Header("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=900")
  listings(@Query() q: SitemapPageDto) {
    return this.service.listings(q.page);
  }
}
