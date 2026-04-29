import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export enum DemoRequestStatusDto {
  NEW = "NEW",
  CONTACTED = "CONTACTED",
  DEMO_SCHEDULED = "DEMO_SCHEDULED",
  DEMO_DONE = "DEMO_DONE",
  WON = "WON",
  LOST = "LOST",
  SPAM = "SPAM",
}

export class UpdateDemoRequestDto {
  @IsOptional()
  @IsEnum(DemoRequestStatusDto)
  status?: DemoRequestStatusDto;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  closedReason?: string;

  @IsOptional()
  @IsString()
  assignedToId?: string;
}
