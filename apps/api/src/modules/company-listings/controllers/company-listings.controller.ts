import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../../company-auth/decorators/current-company-user.decorator";
import { CompanyJwtAuthGuard } from "../../company-auth/guards/company-jwt-auth.guard";
import { CreateListingDto } from "../dto/create-listing.dto";
import { PlaceBidDto } from "../dto/place-bid.dto";
import { CompanyListingsService } from "../services/company-listings.service";

@Controller("company/listings")
@UseGuards(CompanyJwtAuthGuard)
export class CompanyListingsController {
  constructor(private readonly service: CompanyListingsService) {}

  @Get()
  listMine(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.listMine(user.companyId);
  }

  @Get("browse")
  browse(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.browse(user);
  }

  @Get(":id")
  getOne(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.getOne(user, id);
  }

  @Post()
  create(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: CreateListingDto,
  ) {
    return this.service.create(user, dto);
  }

  @Post(":id/bids")
  placeBid(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: PlaceBidDto,
  ) {
    return this.service.placeBid(user, id, dto);
  }
}
