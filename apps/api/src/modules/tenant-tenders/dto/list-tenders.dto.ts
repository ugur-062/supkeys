import { Transform } from "class-transformer";
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";
import { Currency } from "@supkeys/db";

export enum TenderStatusDto {
  DRAFT = "DRAFT",
  IN_APPROVAL = "IN_APPROVAL",
  OPEN_FOR_BIDS = "OPEN_FOR_BIDS",
  IN_AWARD = "IN_AWARD",
  IN_AWARD_APPROVAL = "IN_AWARD_APPROVAL",
  AWARDED = "AWARDED",
  CANCELLED = "CANCELLED",
  CLOSED_NO_AWARD = "CLOSED_NO_AWARD",
}

/**
 * Polish-1 — sort whitelist (createdAt: yeni→eski, bidsCloseAt: yakın→uzak).
 */
export const TENDER_SORT_OPTIONS = [
  "createdAt:desc",
  "createdAt:asc",
  "bidsCloseAt:asc",
  "bidsCloseAt:desc",
] as const;
export type TenderSortOption = (typeof TENDER_SORT_OPTIONS)[number];

/**
 * V2-6 — Liste için tarih aralığı filtresi. Varsayılan "3m" (son 3 ay).
 * "all" filtreyi kaldırır.
 */
export const TENDER_DATE_RANGE_OPTIONS = [
  "7d",
  "30d",
  "3m",
  "6m",
  "12m",
  "all",
] as const;
export type TenderDateRangeOption = (typeof TENDER_DATE_RANGE_OPTIONS)[number];

export class ListTendersDto {
  @IsOptional()
  @IsEnum(TenderStatusDto)
  status?: TenderStatusDto;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(TENDER_SORT_OPTIONS)
  sort?: TenderSortOption;

  @IsOptional()
  @IsIn(TENDER_DATE_RANGE_OPTIONS)
  range?: TenderDateRangeOption;

  /** UNSPSC kategori filtresi — Tender.categories içinde ≥1 eşleşme. */
  @IsOptional()
  @IsString()
  categoryId?: string;

  /** İhaleyi açan satın almacı (user) — User.id. */
  @IsOptional()
  @IsString()
  createdById?: string;

  /** Para birimi — Tender.primaryCurrency eşleşmesi. */
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  /** Tahmini tutar aralığı — Tender.estimatedTotal'a karşı. */
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsNumber()
  @Min(0)
  amountMin?: number;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsNumber()
  @Min(0)
  amountMax?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}
