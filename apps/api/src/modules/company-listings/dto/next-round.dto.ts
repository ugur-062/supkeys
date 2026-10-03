import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateIf,
} from "class-validator";
import { tApi } from "../../../common/i18n/i18n.service";

export enum NextRoundTypeDto {
  RFQ = "RFQ",
  ENGLISH_AUCTION = "ENGLISH_AUCTION",
}
export enum CarryBidsDto {
  AUTO = "AUTO",
  LAZY = "LAZY",
  NONE = "NONE",
}
export enum BidVisibilityDto {
  OWN_ONLY = "OWN_ONLY",
  BEST_PRICE = "BEST_PRICE",
  OWN_RANK = "OWN_RANK",
  BEST_AND_OWN_RANK = "BEST_AND_OWN_RANK",
  ALL = "ALL",
}

/**
 * Yeni tur — tek akış (eski "Yeni Tur Oluştur" ile birebir). Tip seçimi RFQ ↔
 * İngiliz Usulü geçişini de kapsar (RFQ→İngiliz "aktarma" budur).
 */
export class NextRoundDto {
  @IsEnum(NextRoundTypeDto, {
    message: () => tApi("api.dto.nextRound.gecersizSatinAlmaTalebiTipi"),
  })
  type!: NextRoundTypeDto;

  @IsEnum(CarryBidsDto, {
    message: () => tApi("api.dto.nextRound.gecersizTeklifTasimaModu"),
  })
  carryBids!: CarryBidsDto;

  @IsOptional()
  @IsBoolean()
  eliminateNonBidders?: boolean;

  @IsDateString(
    {},
    { message: () => tApi("api.dto.nextRound.gecerliBirKapanisTarihiGirin") },
  )
  closesAt!: string;

  @IsOptional()
  @IsDateString(
    {},
    { message: () => tApi("api.dto.nextRound.gecerliBirAcilisTarihiGirin") },
  )
  bidsOpenAt?: string;

  // ── İngiliz Usulü parametreleri (type=ENGLISH_AUCTION ise) ──
  // Minimum azaltma payı KALDIRILDI (2026-07-13): pazarlıkta tek kural
  // "kendi öncekinden kesin iyi" + turda tek aktif gönderim.
  @ValidateIf((o) => o.type === NextRoundTypeDto.ENGLISH_AUCTION)
  @IsEnum(BidVisibilityDto, {
    message: () => tApi("api.dto.nextRound.gecersizGorunurlukModu"),
  })
  bidVisibility?: BidVisibilityDto;

  @IsOptional()
  @IsBoolean()
  autoExtendOnLateBid?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  autoExtendThresholdMin?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  autoExtendByMinutes?: number;
}
