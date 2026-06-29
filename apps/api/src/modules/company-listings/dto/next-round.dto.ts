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
export enum DecrementTypeDto {
  AMOUNT = "AMOUNT",
  PERCENT = "PERCENT",
}
export enum DecrementBasisDto {
  OWN_LAST_BID = "OWN_LAST_BID",
  BEST_BID = "BEST_BID",
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

  // ── İngiliz Usulü parametreleri (type=ENGLISH_AUCTION ise zorunlu) ──
  @ValidateIf((o) => o.type === NextRoundTypeDto.ENGLISH_AUCTION)
  @IsEnum(DecrementTypeDto, { message: "Geçersiz fiyat azaltma tipi" })
  priceDecrementType?: DecrementTypeDto;

  @ValidateIf((o) => o.type === NextRoundTypeDto.ENGLISH_AUCTION)
  @IsNumber({ maxDecimalPlaces: 4 }, { message: "Geçersiz azaltma değeri" })
  @Min(0)
  priceDecrementValue?: number;

  @ValidateIf((o) => o.type === NextRoundTypeDto.ENGLISH_AUCTION)
  @IsEnum(DecrementBasisDto, { message: "Geçersiz azaltma bazı" })
  priceDecrementBasis?: DecrementBasisDto;

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
