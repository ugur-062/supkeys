import { Transform } from "class-transformer";
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export enum SupplierTenderFilter {
  ACTIVE = "active",
  PAST = "past",
  ALL = "all",
}

export const SUPPLIER_TENDER_SORT_OPTIONS = [
  "createdAt:desc",
  "createdAt:asc",
  "bidsCloseAt:asc",
  "bidsCloseAt:desc",
] as const;
export type SupplierTenderSortOption =
  (typeof SUPPLIER_TENDER_SORT_OPTIONS)[number];

export const SUPPLIER_TENDER_DATE_RANGE_OPTIONS = [
  "7d",
  "30d",
  "3m",
  "6m",
  "12m",
  "all",
] as const;
export type SupplierTenderDateRangeOption =
  (typeof SUPPLIER_TENDER_DATE_RANGE_OPTIONS)[number];

export class ListSupplierTendersDto {
  @IsOptional()
  @IsEnum(SupplierTenderFilter)
  filter?: SupplierTenderFilter = SupplierTenderFilter.ALL;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(SUPPLIER_TENDER_SORT_OPTIONS)
  sort?: SupplierTenderSortOption;

  @IsOptional()
  @IsIn(SUPPLIER_TENDER_DATE_RANGE_OPTIONS)
  range?: SupplierTenderDateRangeOption;

  /** Alıcı (tenant) filtresi. */
  @IsOptional()
  @IsString()
  tenantId?: string;

  /** UNSPSC kategori filtresi. */
  @IsOptional()
  @IsString()
  categoryId?: string;

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
