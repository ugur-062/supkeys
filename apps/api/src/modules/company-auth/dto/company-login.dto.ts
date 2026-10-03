import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";

import { tApi } from "../../../common/i18n/i18n.service";

export class CompanyLoginDto {
  @IsEmail({}, { message: () => tApi("api.dto.companyLogin.gecerliBirEpostaAdresiGiriniz") })
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  // 2FA açık hesaplarda zorunlu — authenticator kodu.
  @IsOptional()
  @IsString()
  code?: string;

  // "Beni hatırla" — false ise oturum cookie'si (tarayıcı kapanınca çıkış).
  // Varsayılan (undefined) kalıcı (30 gün).
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
