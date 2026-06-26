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

enum AnswerTypeDto {
  TEXT = "TEXT",
  NUMBER = "NUMBER",
  YES_NO = "YES_NO",
  DATE = "DATE",
}

class QuestionItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  text!: string;

  @IsEnum(AnswerTypeDto)
  answerType!: AnswerTypeDto;

  @IsOptional()
  @IsBoolean()
  required?: boolean;
}

export class SaveQuestionTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => QuestionItemDto)
  items!: QuestionItemDto[];
}
