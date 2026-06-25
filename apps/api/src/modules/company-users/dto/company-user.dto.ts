import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export enum CompanyRoleDto {
  YONETICI = "YONETICI",
  SATIN_ALMACI = "SATIN_ALMACI",
  SATISCI = "SATISCI",
  ONAYLAYICI = "ONAYLAYICI",
}

export class InviteCompanyUserDto {
  @IsEmail({}, { message: "Geçerli e-posta girin" })
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  firstName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  lastName!: string;

  // Boş bırakılırsa kullanıcıya e-posta daveti (parola belirleme linki) gider.
  @IsOptional()
  @IsString()
  @MinLength(8, { message: "Parola en az 8 karakter" })
  @MaxLength(72)
  @Matches(/[a-zA-Z]/, { message: "En az bir harf" })
  @Matches(/[0-9]/, { message: "En az bir rakam" })
  password?: string;

  @IsArray()
  @ArrayMinSize(1, { message: "En az bir rol seçin" })
  @IsEnum(CompanyRoleDto, { each: true, message: "Geçersiz rol" })
  roles!: CompanyRoleDto[];
}

export class UpdateUserRolesDto {
  @IsArray()
  @ArrayMinSize(1, { message: "En az bir rol seçin" })
  @IsEnum(CompanyRoleDto, { each: true, message: "Geçersiz rol" })
  roles!: CompanyRoleDto[];
}
