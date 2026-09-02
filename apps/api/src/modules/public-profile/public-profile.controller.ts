import { Controller, Get, Header, Param } from "@nestjs/common";
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

  @Get(":slug")
  @Header("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=900")
  bySlug(@Param("slug") slug: string) {
    return this.service.getBySlug(slug);
  }
}
