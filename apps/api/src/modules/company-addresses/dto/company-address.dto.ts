import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export enum CompanyAddressTypeDto {
  FATURA = "FATURA",
  ILETISIM = "ILETISIM",
  TESLIMAT = "TESLIMAT",
}

export class UpsertAddressDto {
  @IsEnum(CompanyAddressTypeDto, { message: "Geçersiz adres tipi" })
  type!: CompanyAddressTypeDto;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  district?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  addressLine!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  taxOffice?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  taxNumber?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
