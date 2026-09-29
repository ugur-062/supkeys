import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { ListingFormat, ListingStatus } from "@rothern/db";
import { CURRENCY_ENUM, type CurrencyCode } from "@rothern/shared";
import type {
  BidComparisonInput,
  GeneralReportInput,
  SavingsReportInput,
} from "../company-reports.service";

/**
 * Rapor gövdeleri SINIF olmalı: servis arayüzleri (interface) global
 * ValidationPipe'a `Object` metatype'ı olarak görünüyor, doğrulama ve
 * whitelist hiç çalışmıyordu → `{"listingId":123}` TypeError, geçersiz
 * tarih/enum Prisma hatası olarak 500 dönüyordu (derin denetim LU-17).
 */

/** Web istemcisinin gönderdiği rapor türü (yalnız ALIM). */
const REPORT_TYPES = ["ALIM"] as const;
/** Talep numarası (ROT-…) ya da id — ikisi de kısa. */
const LISTING_REF_MAX = 64;

export class GeneralReportDto implements GeneralReportInput {
  @IsOptional()
  @IsIn(REPORT_TYPES)
  type?: (typeof REPORT_TYPES)[number];

  @IsIn(["SINGLE", "RANGE"])
  mode!: "SINGLE" | "RANGE";

  @IsOptional()
  @IsString()
  @MaxLength(LISTING_REF_MAX)
  listingId?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  rangeStart?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  rangeEnd?: string;

  @IsOptional()
  @IsEnum(ListingFormat)
  format?: string;

  @IsOptional()
  @IsEnum(ListingStatus)
  status?: string;

  @IsOptional()
  @IsEnum(CURRENCY_ENUM)
  currency?: CurrencyCode;
}

export class SavingsReportDto implements SavingsReportInput {
  @IsOptional()
  @IsIn(REPORT_TYPES)
  type?: (typeof REPORT_TYPES)[number];

  @IsISO8601({ strict: true })
  rangeStart!: string;

  @IsISO8601({ strict: true })
  rangeEnd!: string;

  @IsOptional()
  @IsEnum(CURRENCY_ENUM)
  currency?: CurrencyCode;
}

export class BidComparisonDto implements BidComparisonInput {
  @IsOptional()
  @IsIn(REPORT_TYPES)
  type?: (typeof REPORT_TYPES)[number];

  @IsString()
  @MinLength(1)
  @MaxLength(LISTING_REF_MAX)
  listingId!: string;

  @IsIn(["PRICE", "ANSWERS", "BOTH"])
  criteria!: "PRICE" | "ANSWERS" | "BOTH";

  @IsOptional()
  @IsBoolean()
  includeNonBidders?: boolean;

  @IsOptional()
  @IsBoolean()
  showBidCurrencies?: boolean;

  @IsOptional()
  @IsBoolean()
  includeRoundHistory?: boolean;
}
