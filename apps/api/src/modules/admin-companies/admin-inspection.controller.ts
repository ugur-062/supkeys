import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { IsISO8601, IsString, MaxLength, MinLength } from "class-validator";
import {
  CurrentAdmin,
  type AuthenticatedAdmin,
} from "../../common/decorators/current-admin.decorator";
import { AllowAnyAdminRole } from "../admin-auth/decorators/allow-any-admin-role.decorator";
import { RequireAdminRole } from "../admin-auth/decorators/require-admin-role.decorator";
import { AdminJwtAuthGuard } from "../admin-auth/guards/admin-jwt-auth.guard";
import { AdminRolesGuard } from "../admin-auth/guards/admin-roles.guard";
import { AdminInspectionService } from "./admin-inspection.service";

class ReasonDto {
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

class ClosesAtDto {
  @IsISO8601()
  closesAt!: string;
}

/**
 * İnceleme (okuma) tüm admin rollerine açık — destek çağrısında SUPPORT da
 * bakabilmeli. MÜDAHALELER (kapat/uzat/aç/iptal/davet-iptal) SUPER_ADMIN+SALES.
 */
@Controller("admin")
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
export class AdminInspectionController {
  constructor(private readonly service: AdminInspectionService) {}

  // ── okuma (bilinçli olarak tüm admin rollerine açık — SUPPORT dahil) ──
  @Get("companies/:companyId/listings")
  @AllowAnyAdminRole()
  listListings(@Param("companyId") companyId: string) {
    return this.service.listListings(companyId);
  }

  @Get("listings/:id")
  @AllowAnyAdminRole()
  listingDetail(@Param("id") id: string) {
    return this.service.listingDetail(id);
  }

  @Get("companies/:companyId/orders")
  @AllowAnyAdminRole()
  listOrders(@Param("companyId") companyId: string) {
    return this.service.listOrders(companyId);
  }

  @Get("orders/:id")
  @AllowAnyAdminRole()
  orderDetail(@Param("id") id: string) {
    return this.service.orderDetail(id);
  }

  @Get("companies/:companyId/connections")
  @AllowAnyAdminRole()
  listConnections(@Param("companyId") companyId: string) {
    return this.service.listConnections(companyId);
  }

  // ── müdahale ──
  @Post("listings/:id/close")
  @RequireAdminRole("SUPER_ADMIN", "SALES")
  closeListing(
    @Param("id") id: string,
    @Body() dto: ReasonDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.service.closeListing(id, dto.reason, admin.id);
  }

  @Post("listings/:id/extend")
  @RequireAdminRole("SUPER_ADMIN", "SALES")
  extendListing(
    @Param("id") id: string,
    @Body() dto: ClosesAtDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.service.extendListing(id, dto.closesAt, admin.id);
  }

  @Post("listings/:id/reopen")
  @RequireAdminRole("SUPER_ADMIN", "SALES")
  reopenListing(
    @Param("id") id: string,
    @Body() dto: ClosesAtDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.service.reopenListing(id, dto.closesAt, admin.id);
  }

  @Post("orders/:id/cancel")
  @RequireAdminRole("SUPER_ADMIN", "SALES")
  cancelOrder(
    @Param("id") id: string,
    @Body() dto: ReasonDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.service.cancelOrder(id, dto.reason, admin.id);
  }

  @Delete("connections/:id")
  @RequireAdminRole("SUPER_ADMIN", "SALES")
  revokeConnectionInvite(
    @Param("id") id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.service.revokeConnectionInvite(id, admin.id);
  }

  @Delete("referral-invites/:id")
  @RequireAdminRole("SUPER_ADMIN", "SALES")
  revokeReferralInvite(
    @Param("id") id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.service.revokeReferralInvite(id, admin.id);
  }
}
