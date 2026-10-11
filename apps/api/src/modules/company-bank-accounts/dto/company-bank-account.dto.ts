import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from "class-validator";

/**
 * Banka hesabı (2026-09-27, kayıt tüm ülkelere açıldı): IBAN ülkesinde `iban`;
 * IBAN kullanmayan ülkede `accountNumber` + `swiftBic` + `bankName`. Kural
 * serviste (`assertBankDetails`); DTO yalnız biçim sınırlarını taşır.
 */
export class UpsertBankAccountDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(140)
  accountHolder!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  iban?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  accountNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(15)
  swiftBic?: string;

  /** Bankanın ülkesi (ISO). Yoksa firmanın ülkesi. */
  @IsOptional()
  @IsString()
  @Length(2, 2)
  bankCountry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankName?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
