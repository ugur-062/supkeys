import { Transform } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

const ORDER_STATUSES = [
  "PENDING",
  "ACCEPTED",
  "IN_DELIVERY",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
  "IN_PROGRESS",
  "DELIVERED",
] as const;

export const ORDER_SORT_OPTIONS = [
  "createdAt:desc",
  "createdAt:asc",
  "totalAmount:desc",
  "totalAmount:asc",
] as const;
export type OrderSortOption = (typeof ORDER_SORT_OPTIONS)[number];

export const ORDER_DATE_RANGE_OPTIONS = [
  "7d",
  "30d",
  "3m",
  "6m",
  "12m",
  "all",
] as const;
export type OrderDateRangeOption = (typeof ORDER_DATE_RANGE_OPTIONS)[number];

export class ListOrdersDto {
  @IsOptional()
  @IsIn(ORDER_STATUSES)
  status?: (typeof ORDER_STATUSES)[number];

  /** Tedarikçinin sipariş aldığı tenant (alıcı) filtresi. */
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(ORDER_SORT_OPTIONS)
  sort?: OrderSortOption;

  @IsOptional()
  @IsIn(ORDER_DATE_RANGE_OPTIONS)
  range?: OrderDateRangeOption;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
