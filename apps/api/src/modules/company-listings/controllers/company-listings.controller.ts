import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../../company-auth/decorators/current-company-user.decorator";
import { CompanyJwtAuthGuard } from "../../company-auth/guards/company-jwt-auth.guard";
import { CreateListingDto } from "../dto/create-listing.dto";
import { CompanyListingsService } from "../services/company-listings.service";

@Controller("company/listings")
@UseGuards(CompanyJwtAuthGuard)
export class CompanyListingsController {
  constructor(private readonly service: CompanyListingsService) {}

  @Get()
  listMine(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.listMine(user.companyId);
  }

  @Post()
  create(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: CreateListingDto,
  ) {
    return this.service.create(user, dto);
  }
}
