import { IsString, MaxLength, MinLength } from "class-validator";
import { tApi } from "../../../common/i18n/i18n.service";

export class SendMessageDto {
  @IsString()
  @MinLength(1, { message: () => tApi("api.dto.sendMessage.mesajBosOlamaz") })
  @MaxLength(5000, { message: () => tApi("api.dto.sendMessage.mesajCokUzunEnFazla5000Karakter") })
  body!: string;
}
