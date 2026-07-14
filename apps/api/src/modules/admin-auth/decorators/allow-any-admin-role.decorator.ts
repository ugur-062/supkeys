import { SetMetadata } from "@nestjs/common";

export const ADMIN_ANY_ROLE_KEY = "admin_any_role";

/**
 * "Kimliği doğrulanmış herhangi bir admin (rol farketmez) geçebilir" işareti.
 * AdminRolesGuard fail-CLOSED çalışır: rol dekoratörü YOKSA reddeder. Bilinçli
 * olarak tüm admin rollerine (SUPPORT dahil) açık salt-okuma/zararsız uçlar bu
 * dekoratörle muaf tutulur — böylece fail-closed onları kırmaz.
 *
 * DİKKAT: bu "public" DEĞİLDİR — AdminJwtAuthGuard yine çalışır, yani en az bir
 * geçerli admin oturumu şarttır. Yalnız ROL kısıtı yoktur.
 *
 *   @UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
 *   @AllowAnyAdminRole()
 *   @Get("companies/stats")
 */
export const AllowAnyAdminRole = () => SetMetadata(ADMIN_ANY_ROLE_KEY, true);
