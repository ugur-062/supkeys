import { Transform } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

const ORDER_STATUSES = [
  "PENDING",
  "ACCEPTED",
  "IN_PROGRESS",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
] as const;

export class ListOrdersDto {
  @IsOptional()
  @IsIn(ORDER_STATUSES)
  status?: (typeof ORDER_STATUSES)[number];

  @IsOptional()
  @IsString()
  search?: string;

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
