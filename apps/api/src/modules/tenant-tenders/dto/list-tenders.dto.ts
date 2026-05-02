import { Transform } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export enum TenderStatusDto {
  DRAFT = "DRAFT",
  OPEN_FOR_BIDS = "OPEN_FOR_BIDS",
  IN_AWARD = "IN_AWARD",
  AWARDED = "AWARDED",
  CANCELLED = "CANCELLED",
  CLOSED_NO_AWARD = "CLOSED_NO_AWARD",
}

export class ListTendersDto {
  @IsOptional()
  @IsEnum(TenderStatusDto)
  status?: TenderStatusDto;

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
