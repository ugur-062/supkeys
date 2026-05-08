import { Transform } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export const TENANT_SORT_OPTIONS = [
  "createdAt:desc",
  "createdAt:asc",
  "name:asc",
  "name:desc",
] as const;
export type TenantSortOption = (typeof TENANT_SORT_OPTIONS)[number];

export class ListAdminTenantsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(TENANT_SORT_OPTIONS)
  sort?: TenantSortOption;

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
