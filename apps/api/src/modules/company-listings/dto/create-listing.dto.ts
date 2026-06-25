import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
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

export class CreateListingDto {
  @IsEnum(ListingTypeDto, { message: "Geçersiz ilan tipi" })
  type!: ListingTypeDto;

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
