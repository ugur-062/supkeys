import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
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
}

export class ListingItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
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
}

export class CreateListingDto {
  @IsEnum(ListingTypeDto, { message: "Geçersiz ilan tipi" })
  type!: ListingTypeDto;

  @IsOptional()
  @IsBoolean()
  isInternational?: boolean;

  // ALIM için: RFQ / İngiliz Usulü.
  @IsOptional()
  @IsEnum(ListingFormatDto, { message: "Geçersiz format" })
  format?: ListingFormatDto;

  // SATIS için: taban + hemen-al.
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

  // ── İhale (ALIM) zenginleştirme ──────────────────────────────────────────
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ListingItemDto)
  @ArrayMaxSize(200)
  items?: ListingItemDto[];

  /** Davet edilecek bağlı tedarikçilerin supkeysId'leri. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(200)
  invitations?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  @ArrayMaxSize(10)
  keywords?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(5000)
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
  @IsEnum(CurrencyDto)
  primaryCurrency?: CurrencyDto;

  @IsOptional()
  @IsArray()
  @IsEnum(CurrencyDto, { each: true })
  @ArrayMaxSize(8)
  allowedCurrencies?: CurrencyDto[];
}
