import { Controller, Get, Header, Param, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { PublicDirectoryQueryDto } from "./dto/public-directory-query.dto";
import { PublicProfileService } from "./public-profile.service";

/**
 * Auth gerektirmeyen herkese açık profil — SEO sayfası + dizin + sitemap.
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

  /** Firma dizini — süzgeçli, sayfalı. */
  @Get("directory")
  @Header("Cache-Control", "public, max-age=0, s-maxage=120, stale-while-revalidate=600")
  directory(@Query() q: PublicDirectoryQueryDto) {
    return this.service.listPublic(q);
  }

  @Get("directory/facets")
  @Header("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=900")
  directoryFacets() {
    return this.service.directoryFacets();
  }

  @Get(":slug")
  @Header("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=900")
  bySlug(@Param("slug") slug: string) {
    return this.service.getBySlug(slug);
  }
}
