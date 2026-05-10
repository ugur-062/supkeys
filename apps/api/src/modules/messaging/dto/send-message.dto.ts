import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class SendMessageDto {
  @IsString()
  @MaxLength(5000, { message: "Mesaj 5000 karakteri aşamaz" })
  content!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5, { message: "En fazla 5 dosya eklenebilir" })
  @IsString({ each: true })
  attachmentIds?: string[];
}
