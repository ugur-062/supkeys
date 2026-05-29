import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

/**
 * V2-REVIEWS — Sipariş-sonu alıcı değerlendirmesi DTO'su.
 * rating zorunlu (1-5); reviewText opsiyonel; isPublic varsayılan true.
 */
export class UpsertSupplierReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reviewText?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}
