import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from "class-validator";
import { Type } from "class-transformer";

export enum VerificationStatusFilter {
  PENDING = "PENDING",
  VERIFIED = "VERIFIED",
  REJECTED = "REJECTED",
  ALL = "ALL",
}

export class ListCompanyVerificationsDto {
  @IsOptional()
  @IsEnum(VerificationStatusFilter)
  status?: VerificationStatusFilter;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class RejectVerificationDto {
  @IsString()
  @Length(5, 500, { message: "Gerekçe 5-500 karakter olmalıdır" })
  reason!: string;
}
