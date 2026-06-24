import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from "class-validator";
import { CompanyTypeDto } from "../../registration/dto/company-type.dto";

/**
 * Madde 29 — FAZ 2 onboarding verisi (alıcı/tenant). Tedarikçi muadiliyle
 * birebir aynı alanlar; anlamsal kontroller serviste shared validator'larla.
 */
export class CompleteTenantOnboardingDto {
  @IsString()
  @Length(2, 150)
  legalName!: string;

  @IsEnum(CompanyTypeDto)
  companyType!: CompanyTypeDto;

  // Ülke — ISO 3166-1 alpha-2 (TR varsayılan). Doğruluk + vergi-no kuralı
  // serviste ülke-farkında kontrol edilir.
  @IsOptional()
  @IsString()
  @Length(2, 2)
  country?: string;

  // Vergi/sicil no — gevşek uzunluk (TR strict kontrolü serviste).
  @IsString()
  @Length(4, 30)
  taxNumber!: string;

  // Vergi dairesi — TR'ye özgü; yabancıda boş olabilir.
  @IsOptional()
  @IsString()
  @MaxLength(50)
  taxOffice?: string;

  @IsString()
  @Length(2, 80)
  city!: string;

  // İlçe — TR'ye özgü (yabancıda eyalet/bölge kullanılır).
  @IsOptional()
  @IsString()
  @MaxLength(80)
  district?: string;

  // Eyalet/bölge — yabancı firmalarda (TR'de boş).
  @IsOptional()
  @IsString()
  @MaxLength(80)
  stateRegion?: string;

  // Mahalle — TR'ye özgü; yabancıda boş olabilir.
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

  // Yetkili kimlik no — TR'de 11 hane TCKN (serviste strict); yabancıda boş/gevşek.
  @IsOptional()
  @IsString()
  @MaxLength(40)
  authorizedTckn?: string;

  @IsString()
  @Length(2, 100)
  authorizedTitle!: string;

  // UNSPSC kategoriler. 1-3 ANA (segment) + sınırsız ALT.
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
