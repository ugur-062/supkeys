import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  type AuthenticatedUser,
  CurrentUser,
} from "../../../common/decorators/current-user.decorator";
import { Roles } from "../../../common/decorators/roles.decorator";
import { RolesGuard } from "../../../common/guards/roles.guard";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { ConnectionRequestsService } from "../services/connection-requests.service";

/**
 * Faz 3 — Alıcı "Gelen İstekler" (Tedarikçi Ol başvuruları).
 * Liste tüm tenant kullanıcılarına; onay/red COMPANY_ADMIN'e.
 */
@Controller("tenants/me/connection-requests")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ConnectionRequestsController {
  constructor(private readonly service: ConnectionRequestsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.list(user.tenantId);
  }

  @Get("count")
  count(@CurrentUser() user: AuthenticatedUser) {
    return this.service.count(user.tenantId);
  }

  @Post(":id/approve")
  @Roles("COMPANY_ADMIN")
  @HttpCode(HttpStatus.OK)
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.service.approve(user.tenantId, id, user.id);
  }

  @Post(":id/reject")
  @Roles("COMPANY_ADMIN")
  @HttpCode(HttpStatus.OK)
  reject(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.service.reject(user.tenantId, id);
  }
}
