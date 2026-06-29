import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from "class-validator";

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

/** RFQ → İngiliz Usulü dönüşüm parametreleri (in-place, yeni tur). */
export class ConvertToAuctionDto {
  @IsEnum(DecrementTypeDto, { message: "Geçersiz fiyat azaltma tipi" })
  priceDecrementType!: DecrementTypeDto;

  @IsNumber({ maxDecimalPlaces: 4 }, { message: "Geçersiz azaltma değeri" })
  @Min(0)
  priceDecrementValue!: number;

  @IsEnum(DecrementBasisDto, { message: "Geçersiz azaltma bazı" })
  priceDecrementBasis!: DecrementBasisDto;

  @IsEnum(BidVisibilityDto, { message: "Geçersiz görünürlük modu" })
  bidVisibility!: BidVisibilityDto;

  @IsOptional()
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

  @IsDateString({}, { message: "Geçerli bir kapanış tarihi girin" })
  closesAt!: string;
}
