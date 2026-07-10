import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentAdmin,
  type AuthenticatedAdmin,
} from "../../common/decorators/current-admin.decorator";
import { RequireAdminRole } from "../admin-auth/decorators/require-admin-role.decorator";
import { AdminJwtAuthGuard } from "../admin-auth/guards/admin-jwt-auth.guard";
import { AdminRolesGuard } from "../admin-auth/guards/admin-roles.guard";
import { AdminEmailLogsService } from "./admin-email-logs.service";
import { ListEmailLogsDto } from "./dto/list-email-logs.dto";

@Controller("admin/email-logs")
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
export class AdminEmailLogsController {
  constructor(private readonly service: AdminEmailLogsService) {}

  @Get()
  async list(@Query() query: ListEmailLogsDto): Promise<unknown> {
    return this.service.list(query);
  }

  @Get(":id")
  async findOne(@Param("id") id: string): Promise<unknown> {
    return this.service.findOne(id);
  }

  // YAZMA işlemi (dış dünyaya e-posta gönderir) — salt-okuma SUPPORT rolüne
  // kapalı. Eskiden roles guard hiç yoktu → her admin resend edebiliyordu.
  @Post(":id/resend")
  @RequireAdminRole("SUPER_ADMIN", "SALES")
  @HttpCode(HttpStatus.OK)
  async resend(
    @Param("id") id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<unknown> {
    // Eski kod `req.user?.sub` okuyordu — admin strategy `id` döndürür, yani
    // audit kaydına hep "" yazılıyordu. CurrentAdmin ile gerçek kimlik.
    return this.service.resend(id, admin.id);
  }
}
