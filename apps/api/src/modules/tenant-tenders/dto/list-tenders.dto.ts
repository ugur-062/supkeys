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
