import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from "class-validator";
import { CompanyRole } from "@supkeys/db";

export enum CompanyTypeDto {
  JOINT_STOCK = "JOINT_STOCK",
  LIMITED = "LIMITED",
  SOLE_PROPRIETOR = "SOLE_PROPRIETOR",
}

/**
 * Faz 2 — Firma Doğrulama sihirbazı (3 adım) tamamlama. Kurumsal kimlik +
 * fatura/teslimat adresi + yetkili + faaliyet sektörü + beyan.
 */
export class CompleteOnboardingDto {
  // ── Adım 1: Şirket ──
  @IsString()
  @Length(2, 150)
  legalName!: string;

  @IsEnum(CompanyTypeDto)
  companyType!: CompanyTypeDto;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  country?: string;

  @IsString()
  @Length(4, 30)
  taxNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  taxOffice?: string;

  // Fatura adresi
  @IsString()
  @Length(2, 80)
  city!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  district?: string;

  // Yabancı adreslerde eyalet/bölge (US state, DE Bundesland vb.).
  @IsOptional()
  @IsString()
  @MaxLength(100)
  stateRegion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  neighborhood?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @IsString()
  @Length(5, 500)
  addressLine!: string;

  // Teslimat adresi — fatura ile aynıysa true (alanlar boş bırakılabilir).
  @IsOptional()
  @IsBoolean()
  deliverySameAsBilling?: boolean;

  @IsOptional()
  @IsString()
  @Length(2, 80)
  deliveryCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  deliveryDistrict?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  deliveryNeighborhood?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  deliveryPostalCode?: string;

  @IsOptional()
  @IsString()
  @Length(5, 500)
  deliveryAddressLine?: string;

  // ── Adım 2: Kişisel ──
  // Yetkili T.C. (TR'de zorunlu — serviste kontrol).
  @IsOptional()
  @IsString()
  @Length(11, 11)
  authorizedTckn?: string;

  // Ünvan/Rol — bizim CompanyRole enum'umuz.
  @IsEnum(CompanyRole)
  role!: CompanyRole;

  // Faaliyet sektörü: 1-3 ana kategori (+ opsiyonel alt).
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsString({ each: true })
  mainCategoryIds!: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  subCategoryIds?: string[];

  // ── Adım 3: Beyan ──
  @IsBoolean()
  @Equals(true, { message: "Beyanı onaylamalısınız" })
  declarationAccepted!: boolean;
}

/** VIES (AB VAT) doğrulama isteği. */
export class ViesCheckDto {
  @IsString()
  @Length(2, 2)
  countryCode!: string;

  @IsString()
  @Length(4, 20)
  vatNumber!: string;
}
