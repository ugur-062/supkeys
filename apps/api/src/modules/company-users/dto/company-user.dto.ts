import { Type } from "class-transformer";
import { LOCALES } from "@rothern/i18n";
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
  ValidateNested,
} from "class-validator";

import { PasswordPolicy } from "../../../common/auth/password-policy";
import { tApi } from "../../../common/i18n/i18n.service";
import { IsIntlPhone, NormalizePhone } from "../../company-auth/dto/phone.validator";

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

  /**
   * Davet dili (2026-09-27): e-posta, kabul sayfası ve (sayfada değiştirilmezse)
   * açılacak hesabın dili. Verilmezse davet edenin kayıtlı dili.
   */
  @IsOptional()
  @IsIn(LOCALES)
  locale?: string;
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
  // Tek harfli ad meşru: yalnız boş olamaz (kayıtla aynı kural).
  @Matches(/\S/, { message: () => tApi("api.dto.companyUser.adBosOlamaz") })
  @MaxLength(80)
  firstName!: string;

  @IsString()
  @Matches(/\S/, { message: () => tApi("api.dto.companyUser.soyadBosOlamaz") })
  @MaxLength(80)
  lastName!: string;

  // Kayıt ve hesap bilgileriyle AYNI kural (arayüz testi O-121): ülke koduna
  // göre ulusal uzunluk, tek kaynak `isValidPhoneNumber`. Eski "10-20
  // karakter" düzenli ifadesi "+90 532123" gibi eksik numarayı kabul ediyordu.
  // Web davet kabul formu 2026-10-08'den beri telefonu SORMAZ (sahip kararı);
  // alan eski web paketi için isteğe bağlı kalır, yoksa null yazılır.
  @IsOptional()
  @NormalizePhone()
  @IsString()
  @MaxLength(30)
  @IsIntlPhone({ allowEmpty: true }, { message: () => tApi("api.dto.companyUser.gecerliBirTelefonGiriniz") })
  phone?: string;

  // Kayıt, şifre değiştirme ve sıfırlamayla AYNI kural — tek kaynak
  // `common/auth/password-policy.ts`.
  @PasswordPolicy()
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
  @Matches(/\S/) // tek harfli ad meşru; yalnız boş olamaz
  @MaxLength(80)
  firstName?: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/)
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
