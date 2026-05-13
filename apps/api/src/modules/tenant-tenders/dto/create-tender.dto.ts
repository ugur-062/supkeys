import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export enum TenderTypeDto {
  RFQ = "RFQ",
  ENGLISH_AUCTION = "ENGLISH_AUCTION",
}

export enum CurrencyDto {
  TRY = "TRY",
  USD = "USD",
  EUR = "EUR",
  GBP = "GBP",
  CHF = "CHF",
  JPY = "JPY",
  AED = "AED",
  CNY = "CNY",
}

export enum DeliveryTermDto {
  EXW = "EXW",
  FCA = "FCA",
  CPT = "CPT",
  CIP = "CIP",
  DAP = "DAP",
  DPU = "DPU",
  DDP = "DDP",
  FAS = "FAS",
  FOB = "FOB",
  CFR = "CFR",
  CIF = "CIF",
}

export enum PaymentTermDto {
  CASH = "CASH",
  DEFERRED = "DEFERRED",
}

export class TenderItemInputDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  unit!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  materialCode?: string;

  @IsOptional()
  @IsDateString()
  requiredByDate?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  targetUnitPrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  customQuestion?: string;
}

export class TenderAttachmentInputDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName!: string;

  @IsInt()
  @Min(1)
  @Max(5 * 1024 * 1024) // tek dosya 5MB
  fileSize!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  mimeType!: string;

  @IsString()
  @IsNotEmpty()
  /** base64 data URL veya MinIO URL (V2) */
  fileUrl!: string;
}

export class CreateTenderDto {
  // ---------- Adım 1: Genel Bilgiler ----------
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsEnum(TenderTypeDto)
  type!: TenderTypeDto;

  // İhale Kuralları
  @IsBoolean()
  isSealedBid!: boolean;

  @IsBoolean()
  requireAllItems!: boolean;

  @IsBoolean()
  requireBidDocument!: boolean;

  // V2-6 — Birden fazla para birimi kabul (1-8). primaryCurrency listenin başı,
  // TRY equivalent karşılaştırma bazıdır. Backend `primaryCurrency ∈ allowedCurrencies` enforce eder.
  @IsArray()
  @ArrayMinSize(1, { message: "En az 1 para birimi zorunludur" })
  @ArrayMaxSize(8, { message: "En fazla 8 para birimi seçebilirsiniz" })
  @IsEnum(CurrencyDto, { each: true })
  allowedCurrencies!: CurrencyDto[];

  @IsEnum(CurrencyDto)
  primaryCurrency!: CurrencyDto;

  // Teslimat
  @IsOptional()
  @IsEnum(DeliveryTermDto)
  deliveryTerm?: DeliveryTermDto;

  // E.7.B — adresler artık dropdown'dan seçilen TenantAddress kayıtlarının ID'si.
  // Backend snapshot oluşturup `Tender.{billing,delivery}AddressSnapshot`'a yazar.
  @IsString()
  @IsNotEmpty()
  billingAddressId!: string;

  @IsString()
  @IsNotEmpty()
  deliveryAddressId!: string;

  // V2-6 — UNSPSC kategorileri (Class veya Commodity). Alıcı 1-10 arası kategori
  // seçebilir; tedarikçi havuzu filtreleme + raporlama için kullanılır. V1
  // backward-compat: legacy tender'larda junction'da satır yok (empty array).
  @IsArray()
  @ArrayMinSize(1, { message: "En az 1 kategori zorunludur" })
  @ArrayMaxSize(10, { message: "En fazla 10 kategori seçebilirsiniz" })
  @IsString({ each: true })
  categoryIds!: string[];

  // Ödeme
  @IsEnum(PaymentTermDto)
  paymentTerm!: PaymentTermDto;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  paymentDays?: number;

  // Hüküm-koşul, notlar
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  termsAndConditions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  internalNotes?: string;

  // Zaman
  @IsDateString()
  bidsCloseAt!: string;

  @IsOptional()
  @IsDateString()
  bidsOpenAt?: string;

  // ---------- Adım 2: Kalemler ----------
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TenderItemInputDto)
  items!: TenderItemInputDto[];

  // ---------- Adım 3: Davetli Tedarikçiler ----------
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  invitedSupplierIds!: string[];

  // ---------- Dosyalar ----------
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => TenderAttachmentInputDto)
  attachments?: TenderAttachmentInputDto[];
}
