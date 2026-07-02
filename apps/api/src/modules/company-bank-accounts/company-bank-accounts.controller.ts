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
import { CompanyBankAccountsService } from "./company-bank-accounts.service";
import { UpsertBankAccountDto } from "./dto/company-bank-account.dto";

@Controller("company/bank-accounts")
@UseGuards(CompanyJwtAuthGuard, CompanyPermissionsGuard)
export class CompanyBankAccountsController {
  constructor(private readonly service: CompanyBankAccountsService) {}

  @Get()
  list(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.list(user.companyId);
  }

  @Post()
  @RequireCompanyPermission("company:manage")
  create(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: UpsertBankAccountDto,
  ) {
    return this.service.create(user, dto);
  }

  @Patch(":id")
  @RequireCompanyPermission("company:manage")
  update(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: UpsertBankAccountDto,
  ) {
    return this.service.update(user, id, dto);
  }

  @Delete(":id")
  @RequireCompanyPermission("company:manage")
  remove(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.remove(user, id);
  }
}
