import { Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
} from "class-validator";

const CURRENCIES = ["TRY", "USD", "EUR", "GBP"] as const;

/**
 * Tasarruf Raporu DTO — verilen tarih aralığında AWARDED ihalelerde
 * en yüksek teklif ile en düşük teklif arasındaki tasarrufu hesaplar (madde 28).
 * Opsiyonel currency filter.
 */
export class SavingsReportDto {
  @IsDateString()
  rangeStart!: string;

  @IsDateString()
  rangeEnd!: string;

  @IsOptional()
  @IsEnum(CURRENCIES)
  currency?: (typeof CURRENCIES)[number];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Type(() => String)
  supplierIds?: string[];
}
