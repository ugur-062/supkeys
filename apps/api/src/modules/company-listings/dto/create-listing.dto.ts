import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
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
}
