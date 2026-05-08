import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";
import {
  ApprovalFlowStatusDto,
  ApprovalFlowStepInputDto,
  ApprovalFlowTypeDto,
} from "./create-approval-flow.dto";

/**
 * UpdateApprovalFlowDto — `flowNumber` ve `createdById` değiştirilemez.
 * Diğer alanlar opsiyonel; ama `initiatorUserIds` veya `steps` gönderilirse
 * boş olamaz (ArrayMinSize 1).
 */
export class UpdateApprovalFlowDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsEnum(ApprovalFlowTypeDto)
  type?: ApprovalFlowTypeDto;

  @IsOptional()
  @IsEnum(ApprovalFlowStatusDto)
  status?: ApprovalFlowStatusDto;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: "En az 1 süreç başlatıcı seçin" })
  @ArrayMaxSize(50)
  @IsString({ each: true })
  initiatorUserIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: "En az 1 onay adımı ekleyin" })
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ApprovalFlowStepInputDto)
  steps?: ApprovalFlowStepInputDto[];
}

export class ChangeApprovalFlowStatusDto {
  @IsEnum(ApprovalFlowStatusDto)
  status!: ApprovalFlowStatusDto;
}
