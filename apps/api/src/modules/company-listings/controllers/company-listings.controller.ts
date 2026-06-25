import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../../company-auth/decorators/current-company-user.decorator";
import { CompanyJwtAuthGuard } from "../../company-auth/guards/company-jwt-auth.guard";
import { AwardByItemDto } from "../dto/award-by-item.dto";
import { AwardListingDto } from "../dto/award-listing.dto";
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

  @Post(":id/buy-now")
  buyNow(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.buyNow(user, id);
  }

  @Post(":id/award")
  award(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: AwardListingDto,
  ) {
    return this.service.award(user, id, dto.bidId);
  }

  @Post(":id/award-by-item")
  awardByItem(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: AwardByItemDto,
  ) {
    return this.service.awardByItem(user, id, dto.itemAwards);
  }

  @Post(":id/new-round")
  newRound(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.startNewRound(user, id);
  }

  @Post(":id/bids/:bidId/eliminate")
  eliminate(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Param("bidId") bidId: string,
  ) {
    return this.service.eliminate(user, id, bidId);
  }

  @Post(":id/cancel")
  cancel(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.cancel(user, id);
  }

  @Post(":id/withdraw-bid")
  withdrawBid(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.withdrawBid(user, id);
  }
}
