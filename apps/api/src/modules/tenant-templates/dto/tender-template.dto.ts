import { IsNotEmpty, IsObject, IsString, MaxLength, MinLength } from "class-validator";

/**
 * Madde 34 — İhale şablonu. `data` = wizard form verisinin JSON blob'u
 * (kalemler + sorular + kategoriler + ayarlar). Şekli backend'de derin
 * doğrulanmaz; yükleme anında wizard'ın zod şeması yeniden doğrular.
 */
export class CreateTenderTemplateDto {
  @IsString()
  @IsNotEmpty({ message: "Şablon adı zorunludur" })
  @MinLength(2, { message: "Şablon adı en az 2 karakter olmalı" })
  @MaxLength(100, { message: "Şablon adı en fazla 100 karakter" })
  name!: string;

  @IsObject({ message: "Şablon verisi geçersiz" })
  data!: Record<string, unknown>;
}
