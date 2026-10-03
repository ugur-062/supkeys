import { IsString, MaxLength, MinLength } from "class-validator";
import { tApi } from "../../../common/i18n/i18n.service";

export class InviteConnectionDto {
  @IsString()
  @MinLength(4, { message: () => tApi("api.dto.inviteConnection.firmaKoduGerekli") })
  @MaxLength(20)
  rothernId!: string;
}
