import { Controller, Get, Param } from "@nestjs/common";
import { TenantPublicProfileService } from "../services/tenant-public-profile.service";

/**
 * Herkese açık alıcı profili — auth gerekmez.
 * publicEnabled + isActive değilse 404.
 */
@Controller("public/tenants")
export class PublicTenantProfileController {
  constructor(private readonly service: TenantPublicProfileService) {}

  @Get(":slug")
  getBySlug(@Param("slug") slug: string) {
    return this.service.getPublicBySlug(slug);
  }
}
