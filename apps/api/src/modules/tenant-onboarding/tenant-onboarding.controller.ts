import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentUser,
  type AuthenticatedUser,
} from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CompanyDocsService } from "../company-docs/company-docs.service";
import {
  CompanyDocUploadUrlDto,
  SaveCompanyDocDto,
} from "../company-docs/dto/company-docs.dto";
import { CompleteTenantOnboardingDto } from "./dto/complete-tenant-onboarding.dto";
import { UpdateTenantCorporateIdentityDto } from "./dto/update-corporate-identity.dto";
import { TenantOnboardingService } from "./tenant-onboarding.service";

@Controller("tenant-onboarding")
@UseGuards(JwtAuthGuard)
export class TenantOnboardingController {
  constructor(
    private readonly service: TenantOnboardingService,
    private readonly companyDocs: CompanyDocsService,
  ) {}

  // Madde 29 — FAZ 3.2 doğrulama belgeleri.
  @Get("company-docs")
  getCompanyDocs(@CurrentUser() user: AuthenticatedUser) {
    return this.companyDocs.getStatus({ type: "tenant", id: user.tenantId });
  }

  @Post("company-docs/upload-url")
  @HttpCode(HttpStatus.OK)
  companyDocUploadUrl(
    @Body() dto: CompanyDocUploadUrlDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companyDocs.createUploadUrl(
      { type: "tenant", id: user.tenantId },
      dto.docType,
      dto.filename,
      dto.mimeType,
    );
  }

  @Put("company-docs")
  @HttpCode(HttpStatus.OK)
  saveCompanyDoc(
    @Body() dto: SaveCompanyDocDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companyDocs.saveDoc(
      { type: "tenant", id: user.tenantId },
      dto.docType,
      dto.key,
    );
  }

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
