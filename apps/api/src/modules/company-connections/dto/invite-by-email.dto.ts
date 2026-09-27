import { LOCALES } from "@rothern/i18n";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { tApi } from "../../../common/i18n/i18n.service";

export class InviteByEmailDto {
  @IsEmail({}, { message: () => tApi("api.dto.inviteByEmail.gecerliBirEPostaAdresiGirin") })
  @MaxLength(200)
  email!: string;

  /**
   * Davet e-postasının dili (2026-09-27): alıcı kayıtlı DEĞİL, dili yok —
   * ekranda e-posta uzantısından önceden doldurulur, davet eden değiştirebilir.
   * Verilmezse sunucu `recipientLocale` ile türetir (eski istemci).
   */
  @IsOptional()
  @IsIn(LOCALES)
  locale?: string;
}

/** Toplu davette adres + (isteğe bağlı) dil. */
export class ReferralInviteTargetDto {
  @IsEmail({}, { message: () => tApi("api.dto.inviteByEmail.gecersizEPostaAdresiVar") })
  @MaxLength(200)
  email!: string;

  @IsOptional()
  @IsIn(LOCALES)
  locale?: string;
}

/**
 * Toplu e-posta daveti — eski sistem paritesi (50'ye kadar). Geriye uyumlu:
 * eski istemci `emails` gönderir; yeni istemci adres başına dil taşıyan
 * `invites` gönderir (API ÖNCE dağıtılır — `forbidNonWhitelisted`). İkisinden
 * biri ŞART (`ValidateIf`): boş gövde eskisi gibi doğrulamada 400 alır —
 * rol matrisi e2e'si yetkili rolde 400 bekler, servis kapısına (403) düşmez.
 */
export class InviteByEmailBatchDto {
  @ValidateIf((o: InviteByEmailBatchDto) => o.invites === undefined)
  @IsArray()
  @ArrayMinSize(1, { message: () => tApi("api.dto.inviteByEmail.enAzBirEPostaGirin") })
  @ArrayMaxSize(50, { message: () => tApi("api.dto.inviteByEmail.tekSeferdeEnFazla50EPosta") })
  @IsEmail({}, { each: true, message: () => tApi("api.dto.inviteByEmail.gecersizEPostaAdresiVar") })
  @MaxLength(200, { each: true })
  emails?: string[];

  @ValidateIf((o: InviteByEmailBatchDto) => o.emails === undefined)
  @IsArray()
  @ArrayMinSize(1, { message: () => tApi("api.dto.inviteByEmail.enAzBirEPostaGirin") })
  @ArrayMaxSize(50, { message: () => tApi("api.dto.inviteByEmail.tekSeferdeEnFazla50EPosta") })
  @ValidateNested({ each: true })
  @Type(() => ReferralInviteTargetDto)
  invites?: ReferralInviteTargetDto[];
}

/**
 * Dış talep davetinde alıcı: adres + dil + ülke (AI keşfinden). Adres biçimi
 * burada DOĞRULANMAZ — geçersiz adres sessizce düşmesin, sonuçta INVALID
 * görünsün (serviste; eski `emails` yolu da öyle).
 */
export class ExternalInviteRecipientDto {
  @IsString()
  @MaxLength(200)
  email!: string;

  @IsOptional()
  @IsIn(LOCALES)
  locale?: string;

  /** Firmanın ülkesi (ISO 3166-1 alpha-2; KKTC `XN`) — dil ondan türetilir. */
  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  country?: string;
}

/**
 * Faz C — dış ihale daveti: ihale + en fazla 20 alıcı. Geriye uyumlu: eski
 * istemci `emails`, yeni istemci alıcı başına dil/ülke taşıyan `invites`;
 * ikisinden biri şart.
 */
export class ExternalTenderInviteDto {
  @IsString()
  listingId!: string;

  @ValidateIf((o: ExternalTenderInviteDto) => o.invites === undefined)
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  emails?: string[];

  @ValidateIf((o: ExternalTenderInviteDto) => o.emails === undefined)
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ExternalInviteRecipientDto)
  invites?: ExternalInviteRecipientDto[];
}
