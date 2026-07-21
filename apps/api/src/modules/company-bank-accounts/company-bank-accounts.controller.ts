import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../company-auth/decorators/current-company-user.decorator";
import { RequireCompanyPermission } from "../company-auth/decorators/require-company-permission.decorator";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import { CompanyPermissionsGuard } from "../company-auth/guards/company-permissions.guard";
import { hasCompanyPermission } from "../company-auth/permissions/company-permissions.constants";
import { CompanyBankAccountsService } from "./company-bank-accounts.service";
import { UpsertBankAccountDto } from "./dto/company-bank-account.dto";

@Controller("company/bank-accounts")
@UseGuards(CompanyJwtAuthGuard, CompanyPermissionsGuard)
export class CompanyBankAccountsController {
  constructor(private readonly service: CompanyBankAccountsService) {}

  @Get()
  list(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    // Tam IBAN yalnız billing:manage'e (OWNER_ONLY → fiilen SAHIP) döner;
    // diğer üyeler maskeli görür (profildeki canSeeSensitive deseniyle aynı).
    // Sipariş-accept seçimi id ile gider, snapshot DB'den okunur → maske bozmaz.
    const canSeeFullIban = hasCompanyPermission(
      user.roles,
      user.isOwner,
      "billing:manage",
      user.permissionsOverride,
    );
    return this.service.list(user.companyId, canSeeFullIban);
  }

  @Post()
  @RequireCompanyPermission("billing:manage")
  create(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: UpsertBankAccountDto,
  ) {
    return this.service.create(user, dto);
  }

  @Patch(":id")
  @RequireCompanyPermission("billing:manage")
  update(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: UpsertBankAccountDto,
  ) {
    return this.service.update(user, id, dto);
  }

  @Delete(":id")
  @RequireCompanyPermission("billing:manage")
  remove(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.remove(user, id);
  }
}
