import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsString,
  MaxLength,
} from "class-validator";
import { tApi } from "../../../common/i18n/i18n.service";

export class InviteByEmailDto {
  @IsEmail({}, { message: () => tApi("api.dto.inviteByEmail.gecerliBirEPostaAdresiGirin") })
  @MaxLength(200)
  email!: string;
}

/** Toplu e-posta daveti — eski sistem paritesi (50'ye kadar). */
export class InviteByEmailBatchDto {
  @IsArray()
  @ArrayMinSize(1, { message: () => tApi("api.dto.inviteByEmail.enAzBirEPostaGirin") })
  @ArrayMaxSize(50, { message: () => tApi("api.dto.inviteByEmail.tekSeferdeEnFazla50EPosta") })
  @IsEmail({}, { each: true, message: () => tApi("api.dto.inviteByEmail.gecersizEPostaAdresiVar") })
  @MaxLength(200, { each: true })
  emails!: string[];
}

/** Faz C — dış ihale daveti: ihale + en fazla 20 e-posta. */
export class ExternalTenderInviteDto {
  @IsString()
  listingId!: string;

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  emails!: string[];
}
