import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class UpdateCompanyProfileDto {
  @IsOptional()
  @IsString()
  @Length(2, 200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  industry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  district?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  addressLine?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  aboutText?: string;

  @IsOptional()
  @IsBoolean()
  publicEnabled?: boolean;

  // Herkese açık profil — zengin alanlar
  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  coverImageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  linkedinUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  instagramUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  employeeCount?: string;

  @IsOptional()
  @IsInt()
  @Min(1800)
  @Max(2100)
  foundedYear?: number;

  // Kurumsal kimlik — düzenlenebilir kalemler (Faz 4). IBAN/KEP geçerliliği
  // serviste doğrulanır (boş string = temizle).
  @IsOptional()
  @IsString()
  @Matches(/^$|^\d{16}$/, { message: "MERSİS No 16 haneli olmalı" })
  mersisNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  tradeRegistryNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  kepAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(34)
  iban?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  ibanHolder?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  services?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  certifications?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(600, { each: true })
  photos?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(600, { each: true })
  certificateImages?: string[];

  // Ne ALIRIM (UNSPSC kategori id'leri).
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  buyerCategoryIds?: string[];

  // Ne SATARIM.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  sellerCategoryIds?: string[];
}
