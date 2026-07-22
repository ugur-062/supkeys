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
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../company-auth/decorators/current-company-user.decorator";
import { RequireCompanyPermission } from "../company-auth/decorators/require-company-permission.decorator";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import { CompanyPaidTierGuard } from "../company-auth/guards/company-paid-tier.guard";
import { CompanyPermissionsGuard } from "../company-auth/guards/company-permissions.guard";
import { CompanyApprovalsService } from "./company-approvals.service";
import {
  CreateApprovalFlowDto,
  DecideApprovalDto,
  UpdateApprovalFlowStatusDto,
} from "./dto/approval.dto";

@Controller("company/approvals")
@UseGuards(CompanyJwtAuthGuard, CompanyPermissionsGuard)
export class CompanyApprovalsController {
  constructor(private readonly service: CompanyApprovalsService) {}

  // ── Akış yönetimi (Ayarlar) — company:manage ──

  @Get("flows")
  @RequireCompanyPermission("approvals:manage")
  listFlows(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.listFlows(user.companyId);
  }

  @Post("flows")
  // Faz T: YENİ akış kurma Silver+ (mevcut akışları yönetme/karar tier'sız —
  // pakete düşen firma açık süreçlerini tamamlayabilir, yenisini kuramaz).
  @UseGuards(CompanyPaidTierGuard)
  @RequireCompanyPermission("approvals:manage")
  createFlow(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: CreateApprovalFlowDto,
  ) {
    return this.service.createFlow(user, dto);
  }

  @Patch("flows/:id")
  @RequireCompanyPermission("approvals:manage")
  updateFlow(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: CreateApprovalFlowDto,
  ) {
    return this.service.updateFlow(user, id, dto);
  }

  @Patch("flows/:id/status")
  @RequireCompanyPermission("approvals:manage")
  setStatus(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: UpdateApprovalFlowStatusDto,
  ) {
    return this.service.setStatus(user, id, dto);
  }

  @Post("flows/:id/duplicate")
  @UseGuards(CompanyPaidTierGuard)
  @RequireCompanyPermission("approvals:manage")
  duplicateFlow(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.duplicateFlow(user, id);
  }

  @Delete("flows/:id")
  @RequireCompanyPermission("approvals:manage")
  deleteFlow(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.deleteFlow(user, id);
  }

  // ── Onaycı (Onaylar sayfası) — approval:act ──

  @Get("pending")
  @RequireCompanyPermission("approval:act")
  listPending(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.listPending(user);
  }

  @Get("pending/count")
  @RequireCompanyPermission("approval:act")
  pendingCount(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.pendingCount(user);
  }

  /**
   * Geçmiş + taleplerim — izin gerektirmez: kullanıcı yalnızca PARÇASI olduğu
   * istekleri görür (başlattıkları + onaycısı olduğu sonuçlanmışlar).
   */
  @Get("history")
  listHistory(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.listHistory(user);
  }

  /**
   * Tüm Süreçler — firma genelindeki onay istekleri (eski sistem paritesi:
   * ekipteki herkes süreçleri izleyebilir; karar yetkisi ayrı — approval:act).
   */
  @Get("all")
  listAll(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Query("status") status?: string,
    @Query("type") type?: string,
    @Query("search") search?: string,
  ) {
    return this.service.listAll(user, { status, type, search });
  }

  @Post(":id/approve")
  @RequireCompanyPermission("approval:act")
  approve(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: DecideApprovalDto,
  ) {
    return this.service.decide(user, id, "approve", dto);
  }

  @Post(":id/reject")
  @RequireCompanyPermission("approval:act")
  reject(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: DecideApprovalDto,
  ) {
    return this.service.decide(user, id, "reject", dto);
  }

  /** İsteği başlatan (veya sahip) bekleyen onay isteğini iptal eder. */
  @Post(":id/cancel")
  cancel(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.cancelRequest(user, id);
  }
}
