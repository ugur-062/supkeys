import { IsOptional, IsString, Length, MaxLength } from "class-validator";

/**
 * Tedarikçi kullanıcısının kendi hesap bilgisi (ad/soyad/telefon) güncelleme.
 * E-posta değiştirilemez (Supabase Auth kimlik anahtarı).
 */
export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @Length(2, 50)
  firstName?: string;

  @IsOptional()
  @IsString()
  @Length(2, 50)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;
}
