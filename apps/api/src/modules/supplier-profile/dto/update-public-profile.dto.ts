import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

/**
 * V2-PUBLIC-PROFILE — Tedarikçi public profil güncelleme DTO'su.
 * Tüm alanlar opsiyonel; verilen alanlar update edilir.
 *
 * Önemli: backend PREMIUM kontrolü yapar; PREMIUM olmayan tedarikçinin
 * isteği 403 ile reddedilir (DTO seviyesinde değil, service seviyesinde).
 */
export class UpdatePublicProfileDto {
  /**
   * URL slug — sadece küçük harf, rakam, tire. /t/[slug] URL'inde görünür.
   * Çakışma varsa 409. Boş string → null (slug kaldırır → public kapanır).
   */
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]*$/u, {
    message: "Slug sadece küçük harf, rakam ve tire içerebilir",
  })
  @MinLength(0)
  @MaxLength(60)
  slug?: string;

  @IsOptional()
  @IsBoolean()
  publicEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  aboutText?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  services?: string[];

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  website?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  linkedinUrl?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  instagramUrl?: string;
}
