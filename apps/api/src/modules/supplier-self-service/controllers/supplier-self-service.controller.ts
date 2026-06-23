import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentSupplierUser,
  type AuthenticatedSupplierUser,
} from "../../supplier-auth/decorators/current-supplier-user.decorator";
import { SupplierJwtAuthGuard } from "../../supplier-auth/guards/supplier-jwt-auth.guard";
import { AcceptInvitationDto } from "../dto/accept-invitation.dto";
import {
  ConnectBySupkeysIdDto,
  ConnectToBuyerDto,
} from "../dto/connect-buyer.dto";
import { CompleteOnboardingDto } from "../dto/complete-onboarding.dto";
import { UpdateCorporateIdentityDto } from "../dto/update-corporate-identity.dto";
import { SupplierSelfServiceService } from "../services/supplier-self-service.service";
import { CompanyDocsService } from "../../company-docs/company-docs.service";
import {
  CompanyDocUploadUrlDto,
  SaveCompanyDocDto,
} from "../../company-docs/dto/company-docs.dto";

@Controller("supplier-self-service")
@UseGuards(SupplierJwtAuthGuard)
export class SupplierSelfServiceController {
  constructor(
    private readonly service: SupplierSelfServiceService,
    private readonly companyDocs: CompanyDocsService,
  ) {}

  // Madde 29 — FAZ 3.2 doğrulama belgeleri.
  @Get("company-docs")
  getCompanyDocs(@CurrentSupplierUser() user: AuthenticatedSupplierUser) {
    return this.companyDocs.getStatus({
      type: "supplier",
      id: user.supplierId,
    });
  }

  @Post("company-docs/upload-url")
  @HttpCode(HttpStatus.OK)
  companyDocUploadUrl(
    @Body() dto: CompanyDocUploadUrlDto,
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
  ) {
    return this.companyDocs.createUploadUrl(
      { type: "supplier", id: user.supplierId },
      dto.docType,
      dto.filename,
      dto.mimeType,
    );
  }

  @Put("company-docs")
  @HttpCode(HttpStatus.OK)
  saveCompanyDoc(
    @Body() dto: SaveCompanyDocDto,
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
  ) {
    return this.companyDocs.saveDoc(
      { type: "supplier", id: user.supplierId },
      dto.docType,
      dto.key,
    );
  }

  // Madde 29 — FAZ 2 onboarding tamamlama.
  @Put("onboarding")
  @HttpCode(HttpStatus.OK)
  completeOnboarding(
    @Body() dto: CompleteOnboardingDto,
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
  ) {
    return this.service.completeOnboarding(
      user.supplierId,
      user.supplierUserId,
      dto,
    );
  }

  // Madde 29 — FAZ 3.1 kurumsal kimlik güncelleme.
  @Put("corporate-identity")
  @HttpCode(HttpStatus.OK)
  updateCorporateIdentity(
    @Body() dto: UpdateCorporateIdentityDto,
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
  ) {
    return this.service.updateCorporateIdentity(user.supplierId, dto);
  }

  @Post("accept-invitation")
  @HttpCode(HttpStatus.OK)
  acceptInvitation(
    @Body() dto: AcceptInvitationDto,
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
  ) {
    return this.service.acceptInvitation(
      user.supplierUserId,
      user.supplierId,
      user.email,
      dto,
    );
  }

  // Faz 3 madde 6 — Alıcı havuzu (premium) + Supkeys ID ile bağlanma.

  @Get("buyer-pool")
  getBuyerPool(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Query("search") search?: string,
  ) {
    return this.service.getBuyerPool(user.supplierId, search);
  }

  @Post("buyer-pool/connect")
  @HttpCode(HttpStatus.OK)
  connectToBuyer(
    @Body() dto: ConnectToBuyerDto,
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
  ) {
    return this.service.requestConnectToBuyer(
      user.supplierId,
      user.supplierUserId,
      dto.tenantId,
    );
  }

  @Post("connect-by-supkeys-id")
  @HttpCode(HttpStatus.OK)
  connectBySupkeysId(
    @Body() dto: ConnectBySupkeysIdDto,
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
  ) {
    return this.service.connectToBuyerBySupkeysId(
      user.supplierId,
      user.supplierUserId,
      dto.supkeysId,
    );
  }
}
