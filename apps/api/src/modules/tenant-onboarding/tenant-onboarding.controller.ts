import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Put,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentUser,
  type AuthenticatedUser,
} from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CompleteTenantOnboardingDto } from "./dto/complete-tenant-onboarding.dto";
import { UpdateTenantCorporateIdentityDto } from "./dto/update-corporate-identity.dto";
import { TenantOnboardingService } from "./tenant-onboarding.service";

@Controller("tenant-onboarding")
@UseGuards(JwtAuthGuard)
export class TenantOnboardingController {
  constructor(private readonly service: TenantOnboardingService) {}

  // Madde 29 — FAZ 2 onboarding tamamlama (alıcı).
  @Put()
  @HttpCode(HttpStatus.OK)
  completeOnboarding(
    @Body() dto: CompleteTenantOnboardingDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.completeOnboarding(user.tenantId, dto);
  }

  // Madde 29 — FAZ 3.1 kurumsal kimlik güncelleme (alıcı).
  @Put("corporate-identity")
  @HttpCode(HttpStatus.OK)
  updateCorporateIdentity(
    @Body() dto: UpdateTenantCorporateIdentityDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.updateCorporateIdentity(user.tenantId, dto);
  }
}
