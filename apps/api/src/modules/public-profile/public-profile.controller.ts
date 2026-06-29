import { Controller, Get, Param } from "@nestjs/common";
import { PublicProfileService } from "./public-profile.service";

/** Auth gerektirmeyen herkese açık profil — SEO sayfası + sitemap. */
@Controller("public/companies")
export class PublicProfileController {
  constructor(private readonly service: PublicProfileService) {}

  // ":slug"den ÖNCE tanımlı olmalı (statik rota önceliği).
  @Get("sitemap")
  sitemap() {
    return this.service.listPublicSlugs();
  }

  @Get(":slug")
  bySlug(@Param("slug") slug: string) {
    return this.service.getBySlug(slug);
  }
}
