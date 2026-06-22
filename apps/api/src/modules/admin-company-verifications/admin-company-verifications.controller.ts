import {
  Body,
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
import { AdminJwtAuthGuard } from "../admin-auth/guards/admin-jwt-auth.guard";
import { AdminCompanyVerificationsService } from "./admin-company-verifications.service";
import {
  ListCompanyVerificationsDto,
  RejectVerificationDto,
} from "./dto/company-verifications.dto";

type OwnerType = "tenant" | "supplier";

@Controller("admin/company-verifications")
@UseGuards(AdminJwtAuthGuard)
export class AdminCompanyVerificationsController {
  constructor(
    private readonly service: AdminCompanyVerificationsService,
  ) {}

  @Get()
  list(@Query() query: ListCompanyVerificationsDto) {
    return this.service.list(query);
  }

  @Get("stats")
  stats() {
    return this.service.stats();
  }

  @Get(":ownerType/:id")
  detail(@Param("ownerType") ownerType: OwnerType, @Param("id") id: string) {
    return this.service.detail(ownerType, id);
  }

  @Post(":ownerType/:id/approve")
  @HttpCode(HttpStatus.OK)
  approve(
    @Param("ownerType") ownerType: OwnerType,
    @Param("id") id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.service.approve(ownerType, id, admin.id);
  }

  @Post(":ownerType/:id/reject")
  @HttpCode(HttpStatus.OK)
  reject(
    @Param("ownerType") ownerType: OwnerType,
    @Param("id") id: string,
    @Body() dto: RejectVerificationDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.service.reject(ownerType, id, admin.id, dto.reason);
  }
}
