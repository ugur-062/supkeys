import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from "class-validator";
import { CompanyTypeDto } from "../../registration/dto/company-type.dto";

/** Tedarikçi yetkilisinin rolü → SupplierUser.isManager. */
export enum SupplierRoleDto {
  MANAGER = "MANAGER", // Yönetici (isManager = true)
  PURCHASER = "PURCHASER", // Satın Almacı (isManager = false)
}

/**
 * Madde 29 — FAZ 2 onboarding wizard verisi (tedarikçi).
 * Tip/uzunluk kontrolü burada; anlamsal kontroller (VKN/TC/TCKN format,
 * sektör 1-3, kategori seviyesi) serviste shared validator'larla yapılır.
 */
export class CompleteOnboardingDto {
  // Adım 1 — Firma Kimliği
  @IsString()
  @Length(2, 150)
  legalName!: string;

  @IsEnum(CompanyTypeDto)
  companyType!: CompanyTypeDto;

  // Ülke — ISO 3166-1 alpha-2 (TR varsayılan); vergi-no kuralı serviste.
  @IsOptional()
  @IsString()
  @Length(2, 2)
  country?: string;

  @IsString()
  @Length(4, 30)
  taxNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  taxOffice?: string;

  // Adım 1 — Fatura Adresi
  @IsString()
  @Length(2, 80)
  city!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  district?: string;

  // Eyalet/bölge — yabancı firmalarda (TR'de boş).
  @IsOptional()
  @IsString()
  @MaxLength(80)
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

  @IsOptional()
  @IsString()
  @MaxLength(150)
  billingTitle?: string;

  @IsOptional()
  @IsEmail({}, { message: "Geçerli bir fatura e-postası giriniz" })
  @MaxLength(200)
  billingEmail?: string;

  // Adım 1 — Teslimat Adresi ("fatura adresimle aynı" tiki ile kopyalanır)
  @IsBoolean()
  deliveryUseBilling!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  deliveryCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
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
  @MaxLength(500)
  deliveryAddressLine?: string;

  // Adım 2 — Yetkili Kişi (rol → isManager). TR'de 11 hane TCKN (serviste
  // strict); yabancıda boş/gevşek.
  @IsOptional()
  @IsString()
  @MaxLength(40)
  authorizedTckn?: string;

  @IsEnum(SupplierRoleDto, { message: "Geçerli bir rol seçiniz" })
  role!: SupplierRoleDto;

  // Adım 2 — Faaliyet kategorileri (UNSPSC). 1-3 ANA (segment) + sınırsız ALT.
  @IsArray()
  @ArrayMinSize(1, { message: "En az 1 ana kategori seçmelisiniz" })
  @ArrayMaxSize(3, { message: "En fazla 3 ana kategori seçebilirsiniz" })
  @IsString({ each: true })
  mainCategoryIds!: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  subCategoryIds?: string[];
}
