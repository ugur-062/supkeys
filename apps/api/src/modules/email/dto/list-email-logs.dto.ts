import { Transform } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export enum EmailStatusDto {
  QUEUED = "QUEUED",
  SENDING = "SENDING",
  SENT = "SENT",
  FAILED = "FAILED",
}

export class ListEmailLogsDto {
  @IsOptional()
  @IsEnum(EmailStatusDto)
  status?: EmailStatusDto;

  @IsOptional()
  @IsString()
  template?: string;

  @IsOptional()
  @IsString()
  toEmail?: string;

  @IsOptional()
  @IsString()
  contextType?: string;

  @IsOptional()
  @IsString()
  contextId?: string;

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
