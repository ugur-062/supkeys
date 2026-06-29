import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

export enum BidCurrencyDto {
  TRY = "TRY",
  USD = "USD",
  EUR = "EUR",
  GBP = "GBP",
  CHF = "CHF",
  JPY = "JPY",
  AED = "AED",
  CNY = "CNY",
}

export class PlaceBidItemDto {
  @IsString()
  itemId!: string;

  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: "Geçerli bir birim fiyat girin" },
  )
  @Min(0)
  unitPrice!: number;
}

export class PlaceBidDto {
  // Tek-tutar teklif (kalemsiz ihale/ilan). Kalem-bazlı ihalede `items` kullanılır.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "Geçerli bir tutar girin" })
  @Min(0.01, { message: "Tutar 0'dan büyük olmalı" })
  amount?: number;

  // Kalem-bazlı teklif: her kaleme birim fiyat.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlaceBidItemDto)
  @ArrayMaxSize(200)
  items?: PlaceBidItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  // true → taslak teklif (gönderilmez). false/undefined → gönder (SUBMITTED).
  @IsOptional()
  @IsBoolean()
  asDraft?: boolean;

  // Gönderimde zorunlu: teklif edilen teslim tarihi + geçerlilik süresi.
  @IsOptional()
  @IsISO8601({}, { message: "Geçersiz teslim tarihi" })
  deliveryDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  validityDays?: number;

  // Teklif para birimi (ilanın izin verdiği birimlerden). Varsayılan TRY.
  @IsOptional()
  @IsEnum(BidCurrencyDto)
  currency?: BidCurrencyDto;
}
