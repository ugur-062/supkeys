import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

/**
 * Boş string'i undefined'a çevirir — `@IsOptional + @IsUrl` boş input'u
 * "yanlış format" diye reddetmesin (kullanıcı alanı temizlerken).
 */
const EmptyToUndefined = () =>
  Transform(({ value }) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  );

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
  @EmptyToUndefined()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  website?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  linkedinUrl?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  instagramUrl?: string;

  /**
   * Firma kuruluş yılı (1800–şu an). Null = silindi.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1800)
  @Max(new Date().getFullYear())
  foundedYear?: number | null;

  /**
   * Çalışan sayısı bandı — serbest kısa metin (örn. "50-100", "100+").
   */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  employeeCount?: string;

  /**
   * Sertifika etiketleri (örn. ["ISO 9001", "OEKO-TEX"]). Max 20.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  certifications?: string[];

  /**
   * V2-TRUST — MERSİS numarası (10 haneli rakam). Boş = silindi.
   */
  @IsOptional()
  @EmptyToUndefined()
  @Matches(/^[0-9]{10}$/u, {
    message: "MERSİS numarası 10 haneli rakam olmalı",
  })
  mersisNo?: string;

  /**
   * V2-TRUST — Vergi no + vergi dairesini public profilde göster.
   * Service seviyesinde SOLE_PROPRIETOR için reddedilir.
   */
  @IsOptional()
  @IsBoolean()
  publicShowTaxInfo?: boolean;

  /**
   * V2-TRUST — MERSİS no'yu public profilde göster.
   */
  @IsOptional()
  @IsBoolean()
  publicShowMersis?: boolean;
}
