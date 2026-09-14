import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
import { CurrentAdmin, type AuthenticatedAdmin } from "../../common/decorators/current-admin.decorator";
import { AllowAnyAdminRole } from "../admin-auth/decorators/allow-any-admin-role.decorator";
import { RequireAdminRole } from "../admin-auth/decorators/require-admin-role.decorator";
import { AdminJwtAuthGuard } from "../admin-auth/guards/admin-jwt-auth.guard";
import { AdminRolesGuard } from "../admin-auth/guards/admin-roles.guard";
import { AdminProductsService } from "./admin-products.service";

class ListProductsDto {
  @IsOptional() @IsIn(["ALL", "PENDING", "APPROVED", "REJECTED"]) status?: "ALL" | "PENDING" | "APPROVED" | "REJECTED";
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional() @IsString() @MaxLength(40) companyId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

class RejectDto {
  @IsString() @MinLength(10) @MaxLength(500) reason!: string;
}

/** Toplu onay — tavan servisle AYNI (`BULK_APPROVE_MAX`); DTO ilk savunma. */
class BulkApproveDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  ids!: string[];
}

/**
 * Ürün moderasyonu. Okuma her role açık (PII yok — ürün zaten vitrine
 * aday). Karar: SUPER_ADMIN + SUPPORT (kullanıcı kararı 2026-09-09 —
 * içerik moderasyonu zararsız, destek ekibi yürütür); SALES dışarıda.
 */
@Controller("admin/products")
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
export class AdminProductsController {
  constructor(private readonly service: AdminProductsService) {}

  @Get()
  @AllowAnyAdminRole()
  list(@Query() q: ListProductsDto) {
    return this.service.list(q);
  }

  // ":id"den ÖNCE — aksi hâlde "stats" bir ürün id'si sanılırdı.
  @Get("stats")
  @AllowAnyAdminRole()
  stats() {
    return this.service.stats();
  }

  @Get(":id")
  @AllowAnyAdminRole()
  detail(@Param("id") id: string) {
    return this.service.detail(id);
  }

  @Post(":id/approve")
  @RequireAdminRole("SUPER_ADMIN", "SUPPORT")
  approve(@Param("id") id: string, @CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.service.approve(id, admin.id);
  }

  /**
   * TOPLU ONAY — otomatik onay DEĞİL: kararı yine admin verir, 50 tıklama
   * 1 tıklamaya iner. (Tek segment olduğu için iki segmentli `:id/approve`
   * ile çakışmaz; `GET stats`'taki sıra tuzağı burada yok.)
   */
  @Post("bulk-approve")
  @RequireAdminRole("SUPER_ADMIN", "SUPPORT")
  bulkApprove(@Body() dto: BulkApproveDto, @CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.service.approveMany(dto.ids, admin.id);
  }

  @Post(":id/reject")
  @RequireAdminRole("SUPER_ADMIN", "SUPPORT")
  reject(@Param("id") id: string, @Body() dto: RejectDto, @CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.service.reject(id, dto.reason, admin.id);
  }
}
