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
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import {
  PermissionsGuard,
  RequirePermissions,
} from "../../auth/permissions/permissions.guard";
import {
  AwardFullDto,
  AwardItemByItemDto,
  CloseNoAwardDto,
} from "../dto/award.dto";
import { AddInvitationsDto } from "../dto/add-invitations.dto";
import { CancelTenderDto } from "../dto/cancel-tender.dto";
import { ChangeClosingTimeDto } from "../dto/change-closing-time.dto";
import { CreateNextRoundDto } from "../dto/create-next-round.dto";
import { CreateTenderDto } from "../dto/create-tender.dto";
import { EliminateBidDto } from "../dto/eliminate-bid.dto";
import { ListTendersDto } from "../dto/list-tenders.dto";
import { UpdateTenderDto } from "../dto/update-tender.dto";
import { TenantTendersService } from "../services/tenant-tenders.service";

@Controller("tenants/me/tenders")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantTendersController {
  constructor(private readonly service: TenantTendersService) {}

  // ---------- READ ----------

  @Get()
  @RequirePermissions("tender:view")
  list(
    @Query() query: ListTendersDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.list(user.tenantId, query);
  }

  @Get("filters/buyers")
  @RequirePermissions("tender:view")
  distinctBuyers(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.service.distinctBuyers(user.tenantId);
  }

  @Get("filters/categories")
  @RequirePermissions("tender:view")
  distinctCategories(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.distinctCategories(user.tenantId);
  }

  @Get("stats")
  @RequirePermissions("tender:view")
  stats(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.service.stats(user.tenantId);
  }

  @Get(":id")
  @RequirePermissions("tender:view")
  findOne(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.findOne(user.tenantId, id);
  }

  @Get(":id/bids/comparison")
  @RequirePermissions("bid:compare")
  getBidComparison(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.getBidComparison(user.tenantId, id);
  }

  @Get(":id/bids/:bidId")
  @RequirePermissions("bid:compare")
  getBidDetail(
    @Param("id") id: string,
    @Param("bidId") bidId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.getBidDetail(user.tenantId, id, bidId);
  }

  @Get(":id/bids")
  @RequirePermissions("bid:compare")
  getBids(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.getBids(user.tenantId, id);
  }

  // ---------- WRITE — V2-6.5 RBAC permission-based ----------

  @Post()
  @RequirePermissions("tender:create")
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTenderDto,
  ): Promise<unknown> {
    return this.service.createDraft(user.tenantId, user.id, dto);
  }

  @Patch(":id")
  @RequirePermissions("tender:edit")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateTenderDto,
  ): Promise<unknown> {
    return this.service.updateDraft(user.tenantId, id, user.id, user.role, dto);
  }

  /**
   * V2-7+ — Mevcut ihaleye sonradan tedarikçi davet ekleme.
   * DRAFT veya OPEN_FOR_BIDS durumunda; İngiliz Usulü'nde son 2dk hariç.
   */
  @Post(":id/invitations")
  @RequirePermissions("tender:edit")
  addInvitations(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: AddInvitationsDto,
  ): Promise<unknown> {
    return this.service.addInvitations(
      user.tenantId,
      id,
      user.id,
      user.role,
      dto.supplierIds,
    );
  }

  @Post(":id/publish")
  @RequirePermissions("tender:publish")
  publish(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<unknown> {
    return this.service.publish(user.tenantId, id, user.id, user.role);
  }

  @Post(":id/cancel")
  @RequirePermissions("tender:cancel")
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: CancelTenderDto,
  ): Promise<unknown> {
    return this.service.cancel(user.tenantId, id, user.id, user.role, dto);
  }

  @Delete(":id")
  @RequirePermissions("tender:delete")
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<unknown> {
    return this.service.deleteDraft(user.tenantId, id, user.id, user.role);
  }

  // ---------- E.5 — Eleme + Kazandırma ----------

  @Post(":id/bids/:bidId/eliminate")
  @RequirePermissions("bid:eliminate")
  eliminateBid(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Param("bidId") bidId: string,
    @Body() dto: EliminateBidDto,
  ): Promise<unknown> {
    return this.service.eliminateBid(
      user.tenantId,
      id,
      bidId,
      dto.reason,
      user.id,
      user.role,
    );
  }

  @Post(":id/award/full")
  @RequirePermissions("tender:award")
  awardFull(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: AwardFullDto,
  ): Promise<unknown> {
    return this.service.awardFull(
      user.tenantId,
      id,
      dto.bidId,
      user.id,
      user.role,
    );
  }

  @Post(":id/award/item-by-item")
  @RequirePermissions("tender:award")
  awardItemByItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: AwardItemByItemDto,
  ): Promise<unknown> {
    return this.service.awardItemByItem(
      user.tenantId,
      id,
      dto.decisions,
      user.id,
      user.role,
    );
  }

  @Post(":id/award/finalize")
  @RequirePermissions("tender:award")
  finalizeAward(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<unknown> {
    return this.service.finalizeAward(user.tenantId, id, user.id, user.role);
  }

  @Post(":id/close-no-award")
  @RequirePermissions("tender:cancel")
  closeNoAward(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: CloseNoAwardDto,
  ): Promise<unknown> {
    return this.service.closeNoAward(
      user.tenantId,
      id,
      user.id,
      user.role,
      dto,
    );
  }

  @Post(":id/close-bidding")
  @RequirePermissions("tender:award")
  closeBiddingEarly(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<unknown> {
    return this.service.closeBiddingEarly(
      user.tenantId,
      id,
      user.id,
      user.role,
    );
  }

  /**
   * V2-7 — Kapanış zamanını değiştir (modal: yeni zaman VEYA hemen kapat).
   * Davetli tedarikçilere alıcı notu ile e-posta gönderir.
   */
  @Patch(":id/closing-time")
  @RequirePermissions("tender:edit")
  changeClosingTime(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: ChangeClosingTimeDto,
  ): Promise<unknown> {
    return this.service.changeClosingTime(
      user.tenantId,
      id,
      user.id,
      user.role,
      dto,
    );
  }

  /**
   * V2-7 — Yeni Tur Oluştur. Önceki tender'dan items + invitations + ayarları
   * kopyalayıp yeni tender üretir; opsiyonel bid carry.
   */
  @Post(":id/next-round")
  @RequirePermissions("tender:edit")
  createNextRound(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: CreateNextRoundDto,
  ): Promise<unknown> {
    return this.service.createNextRound(
      user.tenantId,
      id,
      user.id,
      user.role,
      dto,
    );
  }
}
