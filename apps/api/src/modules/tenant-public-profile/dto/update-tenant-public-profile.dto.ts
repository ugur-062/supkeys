import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";

const emptyToUndefinedUrl = () =>
  ValidateIf(
    (o: Record<string, unknown>, v: unknown) =>
      v !== undefined && v !== null && v !== "",
  );

/**
 * Alıcı public profili — tenant'ın herkese açık sayfasını (/firma/[slug]) düzenler.
 * Tüm alanlar opsiyonel; sadece gönderilenler güncellenir.
 */
export class UpdateTenantPublicProfileDto {
  @IsOptional()
  @IsBoolean()
  publicEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  aboutText?: string;

  @IsOptional()
  @emptyToUndefinedUrl()
  @IsUrl({ require_protocol: true })
  @MaxLength(200)
  website?: string;

  @IsOptional()
  @emptyToUndefinedUrl()
  @IsUrl({ require_protocol: true })
  @MaxLength(300)
  linkedinUrl?: string;

  @IsOptional()
  @emptyToUndefinedUrl()
  @IsUrl({ require_protocol: true })
  @MaxLength(300)
  instagramUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  @ArrayMaxSize(20)
  services?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1800)
  @Max(new Date().getFullYear())
  foundedYear?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  employeeCount?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  @ArrayMaxSize(20)
  certifications?: string[];
}
