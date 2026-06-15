import {
  IsOptional,
  IsString,
  IsUrl,
  Length,
  MaxLength,
  ValidateIf,
} from "class-validator";

/**
 * Tedarikçi çekirdek firma bilgisi (iletişim/adres) güncelleme DTO'su.
 * Tüm alanlar opsiyonel; sadece gönderilen alanlar güncellenir.
 *
 * Yasal kimlik alanları (ünvan, firma tipi, vergi no, vergi dairesi) bilinçli
 * olarak HARİÇ — bunlar self-servis değiştirilemez (support ile değişir).
 */
export class UpdateCompanyInfoDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  industry?: string;

  // Boş/null ise URL validasyonunu atla (kullanıcı alanı temizleyebilsin).
  @IsOptional()
  @ValidateIf(
    (o: UpdateCompanyInfoDto) =>
      o.website !== undefined && o.website !== null && o.website !== "",
  )
  @IsUrl({ require_protocol: true })
  @MaxLength(200)
  website?: string;

  @IsOptional()
  @IsString()
  @Length(2, 50)
  city?: string;

  @IsOptional()
  @IsString()
  @Length(2, 50)
  district?: string;

  @IsOptional()
  @IsString()
  @Length(5, 500)
  addressLine?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;
}
