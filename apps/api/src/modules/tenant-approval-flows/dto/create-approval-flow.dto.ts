import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export enum ApprovalFlowTypeDto {
  TENDER_PUBLISH = "TENDER_PUBLISH",
  TENDER_AWARD = "TENDER_AWARD",
}

export enum ApprovalFlowStatusDto {
  DRAFT = "DRAFT",
  ACTIVE = "ACTIVE",
  PASSIVE = "PASSIVE",
}

export class ApprovalFlowStepInputDto {
  @IsInt()
  @Min(1)
  orderIndex!: number;

  @IsString()
  @IsNotEmpty()
  approverUserId!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  conditionMinAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  conditionCurrency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayLabel?: string;
}

export class CreateApprovalFlowDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsEnum(ApprovalFlowTypeDto)
  type!: ApprovalFlowTypeDto;

  @IsOptional()
  @IsEnum(ApprovalFlowStatusDto)
  status?: ApprovalFlowStatusDto;

  @IsArray()
  @ArrayMinSize(1, { message: "En az 1 süreç başlatıcı seçin" })
  @ArrayMaxSize(50)
  @IsString({ each: true })
  initiatorUserIds!: string[];

  @IsArray()
  @ArrayMinSize(1, { message: "En az 1 onay adımı ekleyin" })
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ApprovalFlowStepInputDto)
  steps!: ApprovalFlowStepInputDto[];
}
