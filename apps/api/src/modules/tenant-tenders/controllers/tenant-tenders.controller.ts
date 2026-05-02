import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentUser,
  type AuthenticatedUser,
} from "../../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { ListTendersDto } from "../dto/list-tenders.dto";
import { TenantTendersService } from "../services/tenant-tenders.service";

@Controller("tenants/me/tenders")
@UseGuards(JwtAuthGuard)
export class TenantTendersController {
  constructor(private readonly service: TenantTendersService) {}

  @Get()
  list(
    @Query() query: ListTendersDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.list(user.tenantId, query);
  }

  @Get("stats")
  stats(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.service.stats(user.tenantId);
  }

  @Get(":id")
  findOne(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.findOne(user.tenantId, id);
  }
}
