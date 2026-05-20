import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
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

  /** V2-4.2 — Hangi tender/order kapsamında gönderildiği (opsiyonel). */
  @IsOptional()
  @IsEnum(["TENDER", "ORDER", "DIRECT"], {
    message: "context TENDER | ORDER | DIRECT olabilir",
  })
  context?: "TENDER" | "ORDER" | "DIRECT";

  @IsOptional()
  @IsString()
  contextRefId?: string;
}
