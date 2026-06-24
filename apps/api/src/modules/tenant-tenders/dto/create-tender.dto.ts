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
import { LogisticsDetailsDto } from "./logistics-details.dto";

export enum TenderTypeDto {
  RFQ = "RFQ",
  ENGLISH_AUCTION = "ENGLISH_AUCTION",
}

// Açık İhale — görünürlük.
export enum TenderVisibilityDto {
  PRIVATE = "PRIVATE",
  PUBLIC = "PUBLIC",
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
  DOMESTIC_DELIVERED = "DOMESTIC_DELIVERED",
  DOMESTIC_PICKUP = "DOMESTIC_PICKUP",
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

// Faz 3 madde 16 — Ödemenin teslime göre zamanı.
export enum PaymentTimingDto {
  BEFORE_DELIVERY = "BEFORE_DELIVERY",
  AFTER_DELIVERY = "AFTER_DELIVERY",
}

// V2-7 — İngiliz Usulü açık eksiltme enum'ları.
export enum BidVisibilityDto {
  OWN_ONLY = "OWN_ONLY",
  BEST_PRICE = "BEST_PRICE",
  OWN_RANK = "OWN_RANK",
  BEST_AND_OWN_RANK = "BEST_AND_OWN_RANK",
  ALL = "ALL",
}

export enum DecrementTypeDto {
  AMOUNT = "AMOUNT",
  PERCENT = "PERCENT",
}

export enum DecrementBasisDto {
  OWN_LAST_BID = "OWN_LAST_BID",
  BEST_BID = "BEST_BID",
}

export enum AnswerTypeDto {
  TEXT = "TEXT",
  NUMBER = "NUMBER",
  YES_NO = "YES_NO",
  DATE = "DATE",
}

// V2-7+ — Kalem başına çoklu + tipli soru
export class TenderItemQuestionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  text!: string;

  @IsEnum(AnswerTypeDto)
  answerType!: AnswerTypeDto;

  @IsBoolean()
  required!: boolean;
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

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => TenderItemQuestionDto)
  questions?: TenderItemQuestionDto[];
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

  // V2-7 — Anahtar kelimeler (0-10 adet, her biri ≤50 karakter)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10, { message: "En fazla 10 anahtar kelime" })
  @IsString({ each: true })
  @MaxLength(50, { each: true, message: "Her anahtar kelime en fazla 50 karakter" })
  keywords?: string[];

  @IsEnum(TenderTypeDto)
  type!: TenderTypeDto;

  // Açık İhale — görünürlük (varsayılan PRIVATE = davetli).
  @IsOptional()
  @IsEnum(TenderVisibilityDto)
  visibility?: TenderVisibilityDto;

  // ---------- Lojistik İhalesi ----------
  // type=RFQ üstüne yapılandırılmış lojistik katmanı. isLogistics=true ise
  // logistics dolu olmalı (service enforce eder).
  @IsOptional()
  @IsBoolean()
  isLogistics?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => LogisticsDetailsDto)
  logistics?: LogisticsDetailsDto;

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

  // Yurtiçi (false) / Uluslararası (true) ihale — görünürlük + teslim + belge.
  @IsOptional()
  @IsBoolean()
  isInternational?: boolean;

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

  // Faz 3 madde 16 — Ödeme teslim öncesi mi sonrası mı (varsayılan: sonrası).
  @IsOptional()
  @IsEnum(PaymentTimingDto)
  paymentTiming?: PaymentTimingDto;

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

  // ---------- V2-7: İngiliz Usulü Açık Eksiltme Ayarları ----------
  // Tüm alanlar her tender'da DTO'da gelir; service ENGLISH_AUCTION değilse
  // decrement* alanlarını null'lar ve bidVisibility'yi OWN_ONLY'ye sabitler.
  @IsOptional()
  @IsEnum(BidVisibilityDto)
  bidVisibility?: BidVisibilityDto;

  @IsOptional()
  @IsEnum(DecrementTypeDto)
  priceDecrementType?: DecrementTypeDto;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  priceDecrementValue?: number;

  @IsOptional()
  @IsEnum(DecrementBasisDto)
  priceDecrementBasis?: DecrementBasisDto;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4)
  decimalPlaces?: number;

  @IsOptional()
  @IsBoolean()
  sendClosingReminder?: boolean;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(720)
  reminderMinutesBefore?: number;

  @IsOptional()
  @IsBoolean()
  autoExtendOnLateBid?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  autoExtendThresholdMin?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  autoExtendByMinutes?: number;

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
