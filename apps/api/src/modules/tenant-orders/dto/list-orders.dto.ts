import { Transform } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

const ORDER_STATUSES = [
  "PENDING",
  "IN_DELIVERY",
  "ACCEPTED",
  "IN_PROGRESS",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
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
