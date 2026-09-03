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
  Headers,
  Res,
} from "@nestjs/common";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../../company-auth/decorators/current-company-user.decorator";
import { CompanyJwtAuthGuard } from "../../company-auth/guards/company-jwt-auth.guard";
import { AwardByItemDto } from "../dto/award-by-item.dto";
import { AwardListingDto } from "../dto/award-listing.dto";
import { CreateListingDto } from "../dto/create-listing.dto";
import { ExtendBidValidityDto } from "../dto/extend-bid-validity.dto";
import { NextRoundDto } from "../dto/next-round.dto";
import {
  AddInvitationsDto,
  ChangeClosingDto,
  InternalNotesDto,
  ListingReasonDto,
} from "../dto/owner-action.dto";
import { BuyNowDto, PlaceBidDto } from "../dto/place-bid.dto";
import { CompanyListingsService } from "../services/company-listings.service";
import type { Response } from "express";

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
    @Query("limit") limit?: string,
    @Query("openOnly") openOnly?: string,
  ) {
    // `limit` SIRALAMADAN SONRA kırpar (serviste) — pano keşif şeridi 6 kart
    // gösterir ama sıralama tüm kümeden çıkar; sorguyu kırpsaydık "en uygun 6"
    // değil "rastgele 6" gösterirdik. Tavan 24: şerit bundan fazlasını çizmez.
    //
    // `openOnly=true` — yalnız TEKLİFE AÇIK ilanlar. Pano keşif şeridi bunu
    // ister: varsayılan yanıt geçmiş katılımlarımı da taşır ve şerit "teklif
    // bekleyen açık talepler" diye başlıklandığı için o kayıtlar orada YALAN
    // söyler. Liste sayfası parametresiz çağırır (Aktif/Geçmiş sekmeleri
    // ikisini de gösterir).
    const n = Number(limit);
    return this.service.sellerTenders(
      user,
      type === "SATIS" ? "SATIS" : "ALIM",
      {
        limit: Number.isFinite(n) && n > 0 ? Math.min(Math.trunc(n), 24) : undefined,
        openOnly: openOnly === "true",
      },
    );
  }

  /**
   * Pano keşif bloğunun sektör kutuları — segment başına açık ilan sayısı.
   * Görünürlük `seller-tenders` ile AYNI fonksiyondan gelir.
   */
  @Get("discover-facets")
  discoverFacets(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Query("type") type?: string,
  ) {
    return this.service.discoverFacets(
      user,
      type === "SATIS" ? "SATIS" : "ALIM",
    );
  }

  /**
   * Perf turu (denetim P10): sahip dalı ETag/304 destekler. İstemci elindeki
   * sürümü `If-None-Match` ile gönderir; hiçbir şey değişmemişse gövde HİÇ
   * kurulmaz (ağır teklif→kalem→cevap ağacı okunmaz) ve 304 döner.
   *
   * Yetki sırası KORUNUR: servis önce sahiplik + Faz O kapısını uygular,
   * parmak izini ondan SONRA hesaplar. Yetkisiz istek 404 alır, 304 değil.
   */
  @Get(":id")
  async getOne(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Headers("if-none-match") ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.service.getOne(user, id, ifNoneMatch);
    if ("notModified" in result && result.notModified) {
      res.setHeader("ETag", result.etag);
      res.status(304);
      return undefined;
    }
    if ("etag" in result && typeof result.etag === "string") {
      res.setHeader("ETag", result.etag);
    }
    return result;
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

  /** Taslağı yayınla (DRAFT → OPEN). Yayın onayı kaldırıldı. */
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

  /** Kendi teklifinin geçerlilik süresini uzatır (fiyat değişmeden);
   *  taşımada süresi dolduğu için taslağa düşmüş teklifi canlandırabilir. */
  @Post(":id/bids/extend-validity")
  extendBidValidity(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: ExtendBidValidityDto,
  ) {
    return this.service.extendBidValidity(user, id, dto.additionalDays);
  }

  @Post(":id/buy-now")
  buyNow(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() body: BuyNowDto,
  ) {
    return this.service.buyNow(user, id, body);
  }

  @Post(":id/award")
  award(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: AwardListingDto,
  ) {
    return this.service.award(user, id, dto.bidId, dto.approvalNote);
  }

  // Ön kontrol: bu teklifi kazandırmak (bu tutarda) onaya takılır mı? Frontend
  // "Onaya Gönder" dialogunu yalnız requiresApproval=true ise gösterir. Salt-okunur.
  @Post(":id/award/preview")
  awardPreview(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: AwardListingDto,
  ) {
    return this.service.awardPreview(user, id, dto.bidId);
  }

  @Post(":id/award-by-item")
  awardByItem(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: AwardByItemDto,
  ) {
    return this.service.awardByItem(user, id, dto.itemAwards, dto.approvalNote);
  }

  // Ön kontrol (kalem-bazlı): seçilen kalem dağılımı bu tutarda onaya takılır mı?
  @Post(":id/award-by-item/preview")
  awardByItemPreview(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: AwardByItemDto,
  ) {
    return this.service.awardByItemPreview(user, id, dto.itemAwards);
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
    return this.service.addInvitations(user, id, dto.rothernIds ?? []);
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

  // NOT: Teklif "Geri Çek" kaldırıldı — gönderilmiş teklif geri çekilemez.
  // Değişiklik yolu: alıcıyla iletişim → alıcı eler (LOST) → yeniden teklif.

  // ── Sahip karar aksiyonları (üç-nokta menü) ──

  /**
   * Değerlendirmeye Al — teklif alımını şimdi durdurur, ihale IN_AWARD olur.
   * Geri alınamaz; yeniden teklif almanın yolu Yeni Tur. (stop-evaluation ve
   * close-early kaldırıldı — kapanan ihale zaten değerlendirmededir.)
   */
  @Post(":id/start-evaluation")
  startEvaluation(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.startEvaluation(user, id);
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
