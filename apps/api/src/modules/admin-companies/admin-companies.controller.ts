import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import {
  CurrentAdmin,
  type AuthenticatedAdmin,
} from "../../common/decorators/current-admin.decorator";
import { AdminJwtAuthGuard } from "../admin-auth/guards/admin-jwt-auth.guard";
import { AdminCompaniesService } from "./admin-companies.service";

class SuspendDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

class SetTierDto {
  @IsIn(["STANDARD", "PAKET"])
  tier!: "STANDARD" | "PAKET";

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  months?: number;
}

class ResolveComplaintDto {
  @IsIn(["RESOLVED", "DISMISSED"])
  status!: "RESOLVED" | "DISMISSED";

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNote?: string;

  @IsOptional()
  @IsBoolean()
  suspend?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  suspendReason?: string;
}

@Controller("admin")
@UseGuards(AdminJwtAuthGuard)
export class AdminCompaniesController {
  constructor(private readonly service: AdminCompaniesService) {}

  @Get("companies")
  list(
    @Query("status") status?: string,
    @Query("blocked") blocked?: string,
    @Query("q") q?: string,
  ) {
    return this.service.list({ status, blocked, q });
  }

  @Get("companies/:id")
  detail(@Param("id") id: string) {
    return this.service.detail(id);
  }

  @Post("companies/:id/verify")
  verify(@Param("id") id: string, @CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.service.setVerification(id, "VERIFIED", admin.id);
  }

  @Post("companies/:id/reject")
  reject(@Param("id") id: string, @CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.service.setVerification(id, "REJECTED", admin.id);
  }

  @Post("companies/:id/suspend")
  suspend(@Param("id") id: string, @Body() dto: SuspendDto) {
    return this.service.suspend(id, dto.reason ?? "");
  }

  @Post("companies/:id/unsuspend")
  unsuspend(@Param("id") id: string) {
    return this.service.unsuspend(id);
  }

  @Post("companies/:id/tier")
  setTier(@Param("id") id: string, @Body() dto: SetTierDto) {
    return this.service.setTier(id, dto.tier, dto.months);
  }

  @Get("complaints")
  complaints(@Query("status") status?: string) {
    return this.service.listComplaints(status);
  }

  @Post("complaints/:id/resolve")
  resolve(
    @Param("id") id: string,
    @Body() dto: ResolveComplaintDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.service.resolveComplaint(id, dto, admin.id);
  }
}
