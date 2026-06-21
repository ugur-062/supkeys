import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from "class-validator";

// G6 madde 20 — Kayıtlı banka hesabı (tedarikçi). Yalnızca yönetici düzenler.
export class CreateSupplierBankDto {
  @IsString()
  @Length(2, 200)
  accountHolder!: string;

  @IsString()
  @Length(15, 40)
  iban!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  label?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateSupplierBankDto {
  @IsOptional()
  @IsString()
  @Length(2, 200)
  accountHolder?: string;

  @IsOptional()
  @IsString()
  @Length(15, 40)
  iban?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  label?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
