import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
} from "class-validator";

export type ComparisonCriterion = "PRICE" | "ANSWERS" | "BOTH";

/**
 * Teklif Karşılaştırma Raporu DTO.
 *  - tenderId zorunlu
 *  - criteria seçilebilir (Fiyat / Yanıtlar / İkisi)
 *  - includeAllRounds → previousTenderId zincirini de dahil et
 *  - includeNonBidders → davetli ama teklif vermemiş tedarikçileri de listele
 *  - showBidCurrencies → tedarikçinin kendi para birimi sütununu ekle
 */
export class BidComparisonReportDto {
  @IsString()
  tenderId!: string;

  @IsArray()
  @IsIn(["PRICE", "ANSWERS", "BOTH"], { each: true })
  @Type(() => String)
  criteria!: ComparisonCriterion[];

  @IsOptional()
  @IsBoolean()
  includeAllRounds?: boolean;

  @IsOptional()
  @IsBoolean()
  includeNonBidders?: boolean;

  @IsOptional()
  @IsBoolean()
  showBidCurrencies?: boolean;
}
