import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";

import { tApi } from "../../../common/i18n/i18n.service";

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
  @IsEmail({}, { message: () => tApi("api.dto.companyUser.gecerliEpostaGirin") })
  email!: string;

  /** Rol hazır setleri (eski istemci). `permissions` verilirse yok sayılır. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsEnum(CompanyRoleDto, { each: true, message: () => tApi("api.dto.companyUser.gecersizRol") })
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
  @MinLength(2, { message: () => tApi("api.dto.companyUser.adEnAz2KarakterOlmali") })
  @MaxLength(80)
  firstName!: string;

  @IsString()
  @MinLength(2, { message: () => tApi("api.dto.companyUser.soyadEnAz2KarakterOlmali") })
  @MaxLength(80)
  lastName!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9+\s()]{10,20}$/, { message: () => tApi("api.dto.companyUser.gecerliBirTelefonGiriniz") })
  phone?: string;

  @IsString()
  @MinLength(10, { message: () => tApi("api.dto.companyUser.parolaEnAz10KarakterOlmali") })
  @MaxLength(72, { message: () => tApi("api.dto.companyUser.parolaEnFazla72Karakter") })
  @Matches(/[a-z]/, { message: () => tApi("api.dto.companyUser.parolaEnAzBirKucukHarfIcermeli") })
  @Matches(/[A-Z]/, { message: () => tApi("api.dto.companyUser.parolaEnAzBirBuyukHarfIcermeli") })
  @Matches(/[0-9]/, { message: () => tApi("api.dto.companyUser.parolaEnAzBirRakamIcermeli") })
  @Matches(/[^a-zA-Z0-9]/, { message: () => tApi("api.dto.companyUser.parolaEnAzBirOzelKarakterIcermeli") })
  password!: string;

  @IsBoolean()
  @Equals(true, { message: () => tApi("api.dto.companyUser.kullaniciSozlesmesiniKabulEtmelisiniz") })
  termsAccepted!: boolean;

  @IsBoolean()
  @Equals(true, { message: () => tApi("api.dto.companyUser.aracilikVeKullanimSozlesmesiniKabulEtmelisiniz") })
  mediationAccepted!: boolean;

  @IsBoolean()
  @Equals(true, { message: () => tApi("api.dto.companyUser.kvkkAydinlatmaMetniniOnaylamalisiniz") })
  kvkkAccepted!: boolean;

  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;

  @IsOptional()
  @IsBoolean()
  profileImprovementConsent?: boolean;
}

/** Koltuk seçiminde (kişi, grup) çifti — Faz 5. */
export class SeatKeepDto {
  @IsString()
  userId!: string;

  @IsIn(["buy", "sell"])
  group!: "buy" | "sell";
}

/**
 * Kurucu koltuk seçimi: kalacak koltuklar. Faz 5: `keep` (kişi, grup)
 * çiftleri; eski istemci `keepUserIds` (kişinin tüm grupları korunur).
 */
export class SeatSelectionDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => SeatKeepDto)
  keep?: SeatKeepDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keepUserIds?: string[];
}

export class UpdateUserRolesDto {
  @IsArray()
  @ArrayMinSize(1, { message: () => tApi("api.dto.companyUser.enAzBirRolSecin") })
  @ArrayMaxSize(5)
  @IsEnum(CompanyRoleDto, { each: true, message: () => tApi("api.dto.companyUser.gecersizRol") })
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
  @ArrayMinSize(1, { message: () => tApi("api.dto.companyUser.enAzBirRolSecin") })
  @ArrayMaxSize(5)
  @IsEnum(CompanyRoleDto, { each: true, message: () => tApi("api.dto.companyUser.gecersizRol") })
  roles?: CompanyRoleDto[];

  // Kuruculuk devrinde eski Kurucu'nun yeni rolü (kişiye sorulur).
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsEnum(CompanyRoleDto, { each: true, message: () => tApi("api.dto.companyUser.gecersizRol") })
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
