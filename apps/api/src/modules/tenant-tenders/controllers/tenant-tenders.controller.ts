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
import {
  AwardFullDto,
  AwardItemByItemDto,
  CloseNoAwardDto,
} from "../dto/award.dto";
import { CancelTenderDto } from "../dto/cancel-tender.dto";
import { CreateTenderDto } from "../dto/create-tender.dto";
import { EliminateBidDto } from "../dto/eliminate-bid.dto";
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

  // ---------- E.5 — Eleme + Kazandırma ----------

  @Post(":id/bids/:bidId/eliminate")
  @UseGuards(RolesGuard)
  @Roles("COMPANY_ADMIN")
  eliminateBid(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Param("bidId") bidId: string,
    @Body() dto: EliminateBidDto,
  ): Promise<unknown> {
    return this.service.eliminateBid(user.tenantId, id, bidId, dto.reason);
  }

  @Post(":id/award/full")
  @UseGuards(RolesGuard)
  @Roles("COMPANY_ADMIN")
  awardFull(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: AwardFullDto,
  ): Promise<unknown> {
    return this.service.awardFull(user.tenantId, id, dto.bidId);
  }

  @Post(":id/award/item-by-item")
  @UseGuards(RolesGuard)
  @Roles("COMPANY_ADMIN")
  awardItemByItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: AwardItemByItemDto,
  ): Promise<unknown> {
    return this.service.awardItemByItem(user.tenantId, id, dto.decisions);
  }

  @Post(":id/award/finalize")
  @UseGuards(RolesGuard)
  @Roles("COMPANY_ADMIN")
  finalizeAward(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<unknown> {
    return this.service.finalizeAward(user.tenantId, id);
  }

  @Post(":id/close-no-award")
  @UseGuards(RolesGuard)
  @Roles("COMPANY_ADMIN")
  closeNoAward(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: CloseNoAwardDto,
  ): Promise<unknown> {
    return this.service.closeNoAward(user.tenantId, id, dto);
  }
}
