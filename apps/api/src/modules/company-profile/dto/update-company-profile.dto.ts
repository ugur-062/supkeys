import { COMPANY_ACTIVITY_CODES, MAX_COMPANY_ACTIVITIES } from "@rothern/shared";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
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

  /**
   * Faaliyet tipi (çoklu). Tavan tek kaynak @rothern/shared'de —
   * hepsini işaretleyen firma hiçbir şey söylememiş olur ve her aramada
   * çıkarak eşleştirmeyi bozar.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_COMPANY_ACTIVITIES)
  @IsIn(COMPANY_ACTIVITY_CODES as unknown as string[], { each: true })
  activities?: string[];

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

  /** Ziyaretlerim karşı tarafa görünsün (Ziyaret Edenler) — varsayılan açık. */
  @IsOptional()
  @IsBoolean()
  visitsVisible?: boolean;

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

  /**
   * ALT kategoriler (level 2-4). Ana kategori (segment) tek başına çok geniş:
   * "İmalat Makineleri" 88 başlık taşıyor, o segmenti seçen firma o segmentteki
   * HER talebin bildirimini alıyor. Alt kategori, firmanın gerçekten ilgilendiği
   * dalı işaretlemesini sağlar.
   *
   * Eşleştirme zaten hazırdı (`deriveCategoryMatchCandidates` ilanın kodundan
   * TÜM üst seviyeleri türetir, `buyerSubCategoryIds`/`sellerSubCategoryIds`
   * kolonları şemada duruyordu) — eksik olan yalnız bu alanları KABUL eden bir
   * uçtu; profil DTO'su hiç taşımıyordu.
   *
   * Tavan 50: ana kategoriyle aynı. Sınırsız seçim, segment seçmekle aynı
   * kapıya çıkar ve eşleştirmenin anlamını yok eder.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  buyerSubCategoryIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  sellerSubCategoryIds?: string[];
}
