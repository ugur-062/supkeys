import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../../company-auth/decorators/current-company-user.decorator";
import { CompanyJwtAuthGuard } from "../../company-auth/guards/company-jwt-auth.guard";
import { AwardByItemDto } from "../dto/award-by-item.dto";
import { AwardListingDto } from "../dto/award-listing.dto";
import { CreateListingDto } from "../dto/create-listing.dto";
import { NextRoundDto } from "../dto/next-round.dto";
import {
  AddInvitationsDto,
  ChangeClosingDto,
  InternalNotesDto,
  ListingReasonDto,
} from "../dto/owner-action.dto";
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

  /** Firmanın başka ilanlara verdiği tüm teklifler (Tekliflerim ekranı). */
  @Get("my-bids")
  listMyBids(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.listMyBids(user.companyId);
  }

  /** İhalelerim/İlanlarım listesi — zengin (type: ALIM varsayılan, SATIS). */
  @Get("tenders")
  listTenders(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Query("type") type?: string,
  ) {
    return this.service.listTenders(
      user.companyId,
      type === "SATIS" ? "SATIS" : "ALIM",
    );
  }

  /** Teklifçi liste — açık + geçmiş, teklif/davet/kategori zengin.
   *  type=ALIM: satıcının Açık İhaleler'i; type=SATIS: alıcının Satın Al'ı. */
  @Get("seller-tenders")
  sellerTenders(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Query("type") type?: string,
  ) {
    return this.service.sellerTenders(
      user,
      type === "SATIS" ? "SATIS" : "ALIM",
    );
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

  /** İlanı düzenle — sahip, açık ve teklif gelmemişken. Tür değişmez. */
  @Patch(":id")
  update(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: CreateListingDto,
  ) {
    return this.service.updateListing(user, id, dto);
  }

  /** Taslağı yayınla (DRAFT → OPEN; onay akışı varsa IN_APPROVAL). */
  @Post(":id/publish")
  publish(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.publishListing(user, id);
  }

  /** Taslak ilanı sil. */
  @Delete(":id")
  remove(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.deleteListing(user, id);
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
    @Body()
    body?: {
      note?: string;
      deliveryDate?: string;
      validityDays?: number;
      deliveryAddressId?: string;
      itemIds?: string[];
    },
  ) {
    return this.service.buyNow(user, id, body);
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
    @Body() dto: NextRoundDto,
  ) {
    return this.service.createNextRound(user, id, dto);
  }

  @Post(":id/invitations")
  addInvitations(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: AddInvitationsDto,
  ) {
    return this.service.addInvitations(user, id, dto.supkeysIds ?? []);
  }

  @Post(":id/bids/:bidId/eliminate")
  eliminate(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Param("bidId") bidId: string,
    @Body() dto: ListingReasonDto,
  ) {
    return this.service.eliminate(user, id, bidId, dto.reason);
  }

  @Post(":id/cancel")
  cancel(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: ListingReasonDto,
  ) {
    return this.service.cancel(user, id, dto.reason);
  }

  @Post(":id/withdraw-bid")
  withdrawBid(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.withdrawBid(user, id);
  }

  // ── Sahip karar aksiyonları (üç-nokta menü) ──

  @Post(":id/close-early")
  closeEarly(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.closeBiddingEarly(user, id);
  }

  @Post(":id/change-closing")
  changeClosing(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: ChangeClosingDto,
  ) {
    return this.service.changeClosingTime(user, id, dto.closesAt);
  }

  @Post(":id/internal-notes")
  internalNotes(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: InternalNotesDto,
  ) {
    return this.service.updateInternalNotes(user, id, dto.notes ?? "");
  }

  @Post(":id/close-no-award")
  closeNoAward(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: ListingReasonDto,
  ) {
    return this.service.closeNoAward(user, id, dto.reason);
  }

  @Get(":id/rounds")
  rounds(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.roundHistory(user, id);
  }
}
