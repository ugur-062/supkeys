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

  @IsString()
  @Length(10, 11)
  taxNumber!: string;

  @IsString()
  @Length(2, 50)
  taxOffice!: string;

  // Adım 1 — Fatura Adresi
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

  // Adım 2 — Yetkili Kişi
  @IsString()
  @Length(11, 11, { message: "T.C. Kimlik No 11 haneli olmalıdır" })
  authorizedTckn!: string;

  @IsString()
  @Length(2, 100)
  authorizedTitle!: string;

  // Adım 2 — Faaliyet Sektörü (UNSPSC segment, 1-3, ilk = ana)
  @IsArray()
  @ArrayMinSize(1, { message: "En az 1 faaliyet sektörü seçmelisiniz" })
  @ArrayMaxSize(3, { message: "En fazla 3 faaliyet sektörü seçebilirsiniz" })
  @IsString({ each: true })
  categoryIds!: string[];
}
