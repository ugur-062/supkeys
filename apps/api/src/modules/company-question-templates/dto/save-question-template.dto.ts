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
import { QUESTION_TEMPLATE_MAX_ITEMS, TEMPLATE_NAME_MAX_LENGTH } from "@rothern/shared";
import { tApi } from "../../../common/i18n/i18n.service";

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
  @MaxLength(TEMPLATE_NAME_MAX_LENGTH, {
    message: () => tApi("api.companyQuestionTemplates.adEnFazla", { max: TEMPLATE_NAME_MAX_LENGTH }),
  })
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  // Soru setine özgü metin (arayüz testi D-261): genel "en fazla N öğe
  // seçilebilir" soru ekleyen kullanıcıya konu dışıydı.
  @ArrayMaxSize(QUESTION_TEMPLATE_MAX_ITEMS, {
    message: () => tApi("api.companyQuestionTemplates.enFazlaSoru", { max: QUESTION_TEMPLATE_MAX_ITEMS }),
  })
  @ValidateNested({ each: true })
  @Type(() => QuestionItemDto)
  items!: QuestionItemDto[];
}
