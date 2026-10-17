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
 *
 * Koşul "alan GÖNDERİLDİYSE (null dahil) ya da öteki yoksa doğrula"dır —
 * yayın denetimi 2026-09-28 Bölüm 5: eski koşullar birbirine `=== undefined`
 * ile bakıyordu; `{ emails: [...], invites: null }` iki alanın da TÜM
 * doğrulamasını atlatıyor, 50 tavanı ve adres biçimi hiç çalışmıyordu.
 */
export class InviteByEmailBatchDto {
  @ValidateIf((o: InviteByEmailBatchDto) => o.emails !== undefined || o.invites == null)
  @IsArray()
  @ArrayMinSize(1, { message: () => tApi("api.dto.inviteByEmail.enAzBirEPostaGirin") })
  @ArrayMaxSize(50, { message: () => tApi("api.dto.inviteByEmail.tekSeferdeEnFazla50EPosta") })
  @IsEmail({}, { each: true, message: () => tApi("api.dto.inviteByEmail.gecersizEPostaAdresiVar") })
  @MaxLength(200, { each: true })
  emails?: string[];

  @ValidateIf((o: InviteByEmailBatchDto) => o.invites !== undefined || o.emails == null)
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
 * Faz C — dış talep daveti: talep + en fazla 60 alıcı (firma günlük tavanı).
 * Geriye uyumlu: eski istemci `emails`, yeni istemci alıcı başına dil/ülke
 * taşıyan `invites`; ikisinden biri şart. `source`: adres elle mi yazıldı
 * (hemen gider) yoksa AI keşfinden mi seçildi (alıcının mesai saatinde,
 * sıklık freniyle) — verilmezse MANUAL. `ValidateIf` koşulu toplu davetteki
 * gibi (null dahil gönderilen alan her zaman doğrulanır).
 */
export class ExternalTenderInviteDto {
  @IsString()
  @MaxLength(40)
  listingId!: string;

  @ValidateIf((o: ExternalTenderInviteDto) => o.emails !== undefined || o.invites == null)
  @IsArray()
  @ArrayMaxSize(60)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  emails?: string[];

  @ValidateIf((o: ExternalTenderInviteDto) => o.invites !== undefined || o.emails == null)
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => ExternalInviteRecipientDto)
  invites?: ExternalInviteRecipientDto[];

  @IsOptional()
  @IsIn(["MANUAL", "AI_FORM", "AI_AUTO"])
  source?: "MANUAL" | "AI_FORM" | "AI_AUTO";
}
