import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export enum CompanyRoleDto {
  // SAHIP yalnız DEVİR (updateRoles/updateUser) için geçerli; davet servis
  // katmanında ayrıca engellenir ("sahiplik davetle verilemez").
  SAHIP = "SAHIP",
  YONETICI = "YONETICI",
  SATIN_ALMACI = "SATIN_ALMACI",
  SATISCI = "SATISCI",
  ONAYLAYICI = "ONAYLAYICI",
}

/**
 * Token'lı davet — hesap DAVETLE değil KABULLE açılır: kullanıcı adını ve
 * parolasını kendisi belirler (KVKK/consent). Admin yalnızca e-posta + rol girer.
 */
export class InviteCompanyUserDto {
  @IsEmail({}, { message: "Geçerli e-posta girin" })
  email!: string;

  /** Rol hazır setleri (eski istemci). `permissions` verilirse yok sayılır. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsEnum(CompanyRoleDto, { each: true, message: "Geçersiz rol" })
  roles?: CompanyRoleDto[];

  /** Yetki tablosu (Faz 4): davetle verilen AÇIK izin listesi. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  permissions?: string[];
}

/** Yetki tablosu (Faz 4): kişinin AÇIK izin listesini olduğu gibi yazar. */
export class SetUserPermissionsDto {
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  permissions!: string[];
}

/** Davet kabulü (public) — signup ile aynı kişi/parola/sözleşme kuralları. */
export class AcceptCompanyInvitationDto {
  @IsString()
  @MinLength(2, { message: "Ad en az 2 karakter olmalı" })
  @MaxLength(80)
  firstName!: string;

  @IsString()
  @MinLength(2, { message: "Soyad en az 2 karakter olmalı" })
  @MaxLength(80)
  lastName!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9+\s()]{10,20}$/, { message: "Geçerli bir telefon giriniz" })
  phone?: string;

  @IsString()
  @MinLength(10, { message: "Parola en az 10 karakter olmalı" })
  @MaxLength(72, { message: "Parola en fazla 72 karakter" })
  @Matches(/[a-z]/, { message: "Parola en az bir küçük harf içermeli" })
  @Matches(/[A-Z]/, { message: "Parola en az bir büyük harf içermeli" })
  @Matches(/[0-9]/, { message: "Parola en az bir rakam içermeli" })
  @Matches(/[^a-zA-Z0-9]/, { message: "Parola en az bir özel karakter içermeli" })
  password!: string;

  @IsBoolean()
  @Equals(true, { message: "Kullanıcı sözleşmesini kabul etmelisiniz" })
  termsAccepted!: boolean;

  @IsBoolean()
  @Equals(true, { message: "Aracılık ve kullanım sözleşmesini kabul etmelisiniz" })
  mediationAccepted!: boolean;

  @IsBoolean()
  @Equals(true, { message: "KVKK aydınlatma metnini onaylamalısınız" })
  kvkkAccepted!: boolean;

  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;

  @IsOptional()
  @IsBoolean()
  profileImprovementConsent?: boolean;
}

/** Faz K — kurucu koltuk seçimi: kalacak SA/ST sahipleri. */
export class SeatSelectionDto {
  @IsArray()
  @IsString({ each: true })
  keepUserIds!: string[];
}

export class UpdateUserRolesDto {
  @IsArray()
  @ArrayMinSize(1, { message: "En az bir rol seçin" })
  @ArrayMaxSize(5)
  @IsEnum(CompanyRoleDto, { each: true, message: "Geçersiz rol" })
  roles!: CompanyRoleDto[];
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: "En az bir rol seçin" })
  @ArrayMaxSize(5)
  @IsEnum(CompanyRoleDto, { each: true, message: "Geçersiz rol" })
  roles?: CompanyRoleDto[];

  // Kuruculuk devrinde eski Kurucu'nun yeni rolü (kişiye sorulur).
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsEnum(CompanyRoleDto, { each: true, message: "Geçersiz rol" })
  previousOwnerRoles?: CompanyRoleDto[];
}

export class SetUserActiveDto {
  @IsBoolean()
  active!: boolean;
}

export class UpdateUserPermissionsDto {
  // Rol-varsayılanı üstüne EKLENEN izin anahtarları.
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  added!: string[];

  // Rol-varsayılanından ÇIKARILAN izin anahtarları.
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  removed!: string[];
}
