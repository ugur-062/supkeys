import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";

export type QuestionAnswerType = "TEXT" | "NUMBER" | "YES_NO" | "DATE";

export class QuestionTemplateItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  text!: string;

  @IsBoolean()
  required!: boolean;

  @IsEnum(["TEXT", "NUMBER", "YES_NO", "DATE"])
  answerType!: QuestionAnswerType;
}

export class CreateQuestionTemplateDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsBoolean()
  isPublic!: boolean;

  @IsBoolean()
  autoApply!: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => QuestionTemplateItemDto)
  items!: QuestionTemplateItemDto[];
}

export class UpdateQuestionTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsBoolean()
  autoApply?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => QuestionTemplateItemDto)
  items?: QuestionTemplateItemDto[];
}
