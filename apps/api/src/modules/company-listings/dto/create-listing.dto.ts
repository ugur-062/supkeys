import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export enum ListingTypeDto {
  ALIM = "ALIM",
  SATIS = "SATIS",
}

export enum ListingVisibilityDto {
  PUBLIC = "PUBLIC",
  CONNECTIONS = "CONNECTIONS",
  PRIVATE = "PRIVATE",
}

export enum ListingFormatDto {
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

export enum PaymentTimingDto {
  BEFORE_DELIVERY = "BEFORE_DELIVERY",
  AFTER_DELIVERY = "AFTER_DELIVERY",
}

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

export class ItemQuestionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  text!: string;

  @IsEnum(AnswerTypeDto)
  answerType!: AnswerTypeDto;

  @IsOptional()
  @IsBoolean()
  required?: boolean;
}

export class ListingItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  unit!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  targetPrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  materialCode?: string;

  @IsOptional()
  @IsISO8601()
  requiredByDate?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemQuestionDto)
  @ArrayMaxSize(20)
  questions?: ItemQuestionDto[];
}

/** Lojistik ihalesi alanları — serbest yapılı; JSON olarak saklanır. */
export class LogisticsDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  transportMode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  originCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  originAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  destinationCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  destinationAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  cargoType?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  weightKg?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  volumeM3?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  packageCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  vehicleType?: string;

  @IsOptional()
  @IsBoolean()
  hazardous?: boolean;

  @IsOptional()
  @IsBoolean()
  refrigerated?: boolean;

  @IsOptional()
  @IsBoolean()
  fragile?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CreateListingDto {
  @IsEnum(ListingTypeDto, { message: "Geçersiz ilan tipi" })
  type!: ListingTypeDto;

  // true → taslak olarak kaydet (yayınlama); false/undefined → yayınla.
  @IsOptional()
  @IsBoolean()
  asDraft?: boolean;

  @IsOptional()
  @IsBoolean()
  isInternational?: boolean;

  // Sınır ötesi hedef ülkeler (ISO 3166-1 alpha-2). Boş = tüm yabancı ülkeler.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Length(2, 2, { each: true })
  @ArrayMaxSize(200)
  targetCountries?: string[];

  // Teslimat / fatura adresi (CompanyAddress id).
  @IsOptional()
  @IsString()
  deliveryAddressId?: string;

  @IsOptional()
  @IsString()
  billingAddressId?: string;

  @IsOptional()
  @IsEnum(ListingFormatDto, { message: "Geçersiz format" })
  format?: ListingFormatDto;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  minPrice?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  buyNowPrice?: number;

  @IsOptional()
  @IsEnum(ListingVisibilityDto, { message: "Geçersiz görünürlük" })
  visibility?: ListingVisibilityDto;

  @IsString()
  @MinLength(3, { message: "Başlık en az 3 karakter olmalı" })
  @MaxLength(200, { message: "Başlık en fazla 200 karakter" })
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsISO8601({}, { message: "Geçersiz tarih" })
  closesAt?: string;

  @IsOptional()
  @IsISO8601({}, { message: "Geçersiz tarih" })
  bidsOpenAt?: string;

  // ── Kalemler / davet / kategori ──
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ListingItemDto)
  @ArrayMaxSize(200)
  items?: ListingItemDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(200)
  invitations?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  categoryIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  @ArrayMaxSize(10)
  keywords?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  terms?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  internalNotes?: string;

  @IsOptional()
  @IsBoolean()
  requireAllItems?: boolean;

  @IsOptional()
  @IsBoolean()
  requireBidDocument?: boolean;

  @IsOptional()
  @IsBoolean()
  isSealedBid?: boolean;

  @IsOptional()
  @IsEnum(CurrencyDto)
  primaryCurrency?: CurrencyDto;

  @IsOptional()
  @IsArray()
  @IsEnum(CurrencyDto, { each: true })
  @ArrayMaxSize(8)
  allowedCurrencies?: CurrencyDto[];

  // ── Teslim / ödeme ──
  @IsOptional()
  @IsEnum(DeliveryTermDto)
  deliveryTerm?: DeliveryTermDto;

  @IsOptional()
  @IsEnum(PaymentTermDto)
  paymentTerm?: PaymentTermDto;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  paymentDays?: number;

  @IsOptional()
  @IsEnum(PaymentTimingDto)
  paymentTiming?: PaymentTimingDto;

  // ── Lojistik ──
  @IsOptional()
  @IsBoolean()
  isLogistics?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => LogisticsDto)
  logistics?: LogisticsDto;

  // ── İngiliz Usulü açık eksiltme ──
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

  // Kapanış hatırlatması artık her ilanda otomatik — client kontrol etmez.

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
}
