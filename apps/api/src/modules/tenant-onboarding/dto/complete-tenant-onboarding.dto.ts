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
import { CompanyTypeDto } from "../../registration/dto/create-buyer-application.dto";

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

  @IsString()
  @Length(10, 11)
  taxNumber!: string;

  @IsString()
  @Length(2, 50)
  taxOffice!: string;

  @IsString()
  @Length(2, 50)
  city!: string;

  @IsString()
  @Length(2, 50)
  district!: string;

  @IsString()
  @Length(2, 100)
  neighborhood!: string;

  @IsString()
  @Length(2, 20)
  postalCode!: string;

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

  @IsString()
  @Length(11, 11, { message: "T.C. Kimlik No 11 haneli olmalıdır" })
  authorizedTckn!: string;

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
