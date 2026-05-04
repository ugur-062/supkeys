import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentUser,
  type AuthenticatedUser,
} from "../../../common/decorators/current-user.decorator";
import { Roles } from "../../../common/decorators/roles.decorator";
import { RolesGuard } from "../../../common/guards/roles.guard";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { CancelTenderDto } from "../dto/cancel-tender.dto";
import { CreateTenderDto } from "../dto/create-tender.dto";
import { ListTendersDto } from "../dto/list-tenders.dto";
import { UpdateTenderDto } from "../dto/update-tender.dto";
import { TenantTendersService } from "../services/tenant-tenders.service";

@Controller("tenants/me/tenders")
@UseGuards(JwtAuthGuard)
export class TenantTendersController {
  constructor(private readonly service: TenantTendersService) {}

  // ---------- READ ----------

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

  @Get(":id/bids/comparison")
  getBidComparison(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.getBidComparison(user.tenantId, id);
  }

  @Get(":id/bids/:bidId")
  getBidDetail(
    @Param("id") id: string,
    @Param("bidId") bidId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.getBidDetail(user.tenantId, id, bidId);
  }

  @Get(":id/bids")
  getBids(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.getBids(user.tenantId, id);
  }

  // ---------- WRITE (COMPANY_ADMIN-only) ----------

  @Post()
  @UseGuards(RolesGuard)
  @Roles("COMPANY_ADMIN")
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTenderDto,
  ): Promise<unknown> {
    return this.service.createDraft(user.tenantId, user.id, dto);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("COMPANY_ADMIN")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateTenderDto,
  ): Promise<unknown> {
    return this.service.updateDraft(user.tenantId, id, dto);
  }

  @Post(":id/publish")
  @UseGuards(RolesGuard)
  @Roles("COMPANY_ADMIN")
  publish(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<unknown> {
    return this.service.publish(user.tenantId, id);
  }

  @Post(":id/cancel")
  @UseGuards(RolesGuard)
  @Roles("COMPANY_ADMIN")
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: CancelTenderDto,
  ): Promise<unknown> {
    return this.service.cancel(user.tenantId, id, dto);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("COMPANY_ADMIN")
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<unknown> {
    return this.service.deleteDraft(user.tenantId, id);
  }
}
