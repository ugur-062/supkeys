import { Transform } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export const SUPPLIER_SORT_OPTIONS = [
  "createdAt:desc",
  "createdAt:asc",
  "companyName:asc",
  "companyName:desc",
] as const;
export type SupplierSortOption = (typeof SUPPLIER_SORT_OPTIONS)[number];

export class ListAdminSuppliersDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  @IsIn(["STANDARD", "PREMIUM"])
  membership?: "STANDARD" | "PREMIUM";

  @IsOptional()
  @IsIn(SUPPLIER_SORT_OPTIONS)
  sort?: SupplierSortOption;

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
