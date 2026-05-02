import { Transform } from "class-transformer";
import {
  IsEnum,
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

export class ListSupplierTendersDto {
  @IsOptional()
  @IsEnum(SupplierTenderFilter)
  filter?: SupplierTenderFilter = SupplierTenderFilter.ALL;

  @IsOptional()
  @IsString()
  search?: string;

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
