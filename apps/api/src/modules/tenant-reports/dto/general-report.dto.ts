import { Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  ValidateIf,
} from "class-validator";

export type ReportFormat = "json" | "pdf" | "xlsx";

const TENDER_STATUSES = [
  "DRAFT",
  "IN_APPROVAL",
  "OPEN_FOR_BIDS",
  "IN_AWARD",
  "IN_AWARD_APPROVAL",
  "AWARDED",
  "CANCELLED",
  "CLOSED_NO_AWARD",
] as const;

const TENDER_TYPES = ["RFQ", "ENGLISH_AUCTION"] as const;

const CURRENCIES = ["TRY", "USD", "EUR", "GBP"] as const;

/**
 * Genel İhale Raporu DTO — iki mod:
 *  - mode=SINGLE → tek tender (tenderId zorunlu)
 *  - mode=RANGE → tarih aralığı + opsiyonel filtreler
 */
export class GeneralReportDto {
  @IsIn(["SINGLE", "RANGE"])
  mode!: "SINGLE" | "RANGE";

  // SINGLE
  @ValidateIf((o: GeneralReportDto) => o.mode === "SINGLE")
  @IsString()
  tenderId?: string;

  // RANGE
  @ValidateIf((o: GeneralReportDto) => o.mode === "RANGE")
  @IsDateString()
  rangeStart?: string;

  @ValidateIf((o: GeneralReportDto) => o.mode === "RANGE")
  @IsDateString()
  rangeEnd?: string;

  @IsOptional()
  @IsEnum(TENDER_TYPES)
  tenderType?: (typeof TENDER_TYPES)[number];

  @IsOptional()
  @IsEnum(TENDER_STATUSES)
  status?: (typeof TENDER_STATUSES)[number];

  @IsOptional()
  @IsEnum(CURRENCIES)
  currency?: (typeof CURRENCIES)[number];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Type(() => String)
  supplierIds?: string[];
}
