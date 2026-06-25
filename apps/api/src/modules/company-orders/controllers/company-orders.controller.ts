import { Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../../company-auth/decorators/current-company-user.decorator";
import { CompanyJwtAuthGuard } from "../../company-auth/guards/company-jwt-auth.guard";
import { CompanyOrdersService } from "../services/company-orders.service";

@Controller("company/orders")
@UseGuards(CompanyJwtAuthGuard)
export class CompanyOrdersController {
  constructor(private readonly service: CompanyOrdersService) {}

  @Get()
  list(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.list(user.companyId);
  }

  @Get(":id")
  getOne(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.getOne(user, id);
  }

  @Post(":id/ship")
  ship(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.ship(user, id);
  }

  @Post(":id/receive")
  receive(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.receive(user, id);
  }

  @Post(":id/complete")
  complete(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.complete(user, id);
  }
}
