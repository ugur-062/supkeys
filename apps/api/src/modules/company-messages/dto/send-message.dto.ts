import { IsString, MaxLength, MinLength } from "class-validator";

export class SendMessageDto {
  @IsString()
  @MinLength(1, { message: "Mesaj boş olamaz" })
  @MaxLength(5000, { message: "Mesaj çok uzun (en fazla 5000 karakter)" })
  body!: string;
}
