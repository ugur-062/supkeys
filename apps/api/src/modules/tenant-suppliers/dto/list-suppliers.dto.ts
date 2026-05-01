import { Transform } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export enum RelationStatusDto {
  ACTIVE = "ACTIVE",
  PENDING_TENANT_APPROVAL = "PENDING_TENANT_APPROVAL",
  BLOCKED = "BLOCKED",
}

export class ListSuppliersDto {
  @IsOptional()
  @IsEnum(RelationStatusDto)
  status?: RelationStatusDto;

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
