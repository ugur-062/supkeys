import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";

export class AwardFullDto {
  @IsString()
  @IsNotEmpty()
  bidId!: string;
}

export class AwardItemDecisionDto {
  @IsString()
  @IsNotEmpty()
  tenderItemId!: string;

  @IsString()
  @IsNotEmpty()
  bidId!: string;
}

export class AwardItemByItemDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AwardItemDecisionDto)
  decisions!: AwardItemDecisionDto[];
}

export class CloseNoAwardDto {
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason?: string;
}
