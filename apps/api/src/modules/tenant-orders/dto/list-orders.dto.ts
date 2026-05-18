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

/**
 * Polish-1 — Whitelist sıralama opsiyonları (SQL injection korunması).
 * "field:dir" formatında.
 */
export const ORDER_SORT_OPTIONS = [
  "createdAt:desc",
  "createdAt:asc",
  "totalAmount:desc",
  "totalAmount:asc",
] as const;
export type OrderSortOption = (typeof ORDER_SORT_OPTIONS)[number];

/**
 * Sipariş oluşturma tarihine göre aralık filtresi.
 * Varsayılan = "all" (tender list'inden farkımız: sipariş hacmi düşük,
 * varsayılanı kısıtlamıyoruz).
 */
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

  @IsOptional()
  @IsString()
  supplierId?: string;

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
