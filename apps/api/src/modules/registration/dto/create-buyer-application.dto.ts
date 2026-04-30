import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { PASSWORD_REGEX } from "../helpers/token.helper";

export enum CompanyTypeDto {
  JOINT_STOCK = "JOINT_STOCK",
  LIMITED = "LIMITED",
  SOLE_PROPRIETOR = "SOLE_PROPRIETOR",
}

export class CreateBuyerApplicationDto {
  // Firma
  @IsString()
  @Length(2, 150)
  companyName!: string;

  @IsEnum(CompanyTypeDto)
  companyType!: CompanyTypeDto;

  @IsString()
  @Matches(/^[0-9]{10,11}$/, {
    message: "Vergi numarası 10 veya 11 haneli rakamlardan oluşmalıdır",
  })
  taxNumber!: string;

  @IsString()
  @Length(2, 50)
  taxOffice!: string;

  @IsString()
  @Length(5, 1000)
  taxCertUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  industry?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(200)
  website?: string;

  // Adres
  @IsString()
  @Length(2, 50)
  city!: string;

  @IsString()
  @Length(2, 50)
  district!: string;

  @IsString()
  @Length(5, 500)
  addressLine!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  // Yetkili
  @IsString()
  @Length(2, 100)
  adminFirstName!: string;

  @IsString()
  @Length(2, 100)
  adminLastName!: string;

  @IsEmail({}, { message: "Geçerli bir e-posta adresi giriniz" })
  @MaxLength(200)
  adminEmail!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  adminPhone?: string;

  @IsString()
  @MinLength(8, { message: "Şifre en az 8 karakter olmalı" })
  @MaxLength(72, { message: "Şifre 72 karakteri aşamaz" })
  @Matches(PASSWORD_REGEX, {
    message: "Şifre en az 1 büyük harf, 1 küçük harf ve 1 rakam içermeli",
  })
  password!: string;

  // KVKK / şartlar — boolean true zorunlu
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  @IsNotEmpty()
  acceptTerms!: boolean;

  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  @IsNotEmpty()
  acceptKvkk!: boolean;
}
