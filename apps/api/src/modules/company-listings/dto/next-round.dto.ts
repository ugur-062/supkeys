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
  @IsEnum(NextRoundTypeDto, { message: "Geçersiz ihale tipi" })
  type!: NextRoundTypeDto;

  @IsEnum(CarryBidsDto, { message: "Geçersiz teklif taşıma modu" })
  carryBids!: CarryBidsDto;

  @IsOptional()
  @IsBoolean()
  eliminateNonBidders?: boolean;

  @IsDateString({}, { message: "Geçerli bir kapanış tarihi girin" })
  closesAt!: string;

  @IsOptional()
  @IsDateString({}, { message: "Geçerli bir açılış tarihi girin" })
  bidsOpenAt?: string;

  // ── İngiliz Usulü parametreleri (type=ENGLISH_AUCTION ise) ──
  // Minimum azaltma payı KALDIRILDI (2026-07-13): pazarlıkta tek kural
  // "kendi öncekinden kesin iyi" + turda tek aktif gönderim.
  @ValidateIf((o) => o.type === NextRoundTypeDto.ENGLISH_AUCTION)
  @IsEnum(BidVisibilityDto, { message: "Geçersiz görünürlük modu" })
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
