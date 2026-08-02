import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
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
import {
  BID_DELIVERY_TIMES,
  type BidDeliveryTime,
} from "@rothern/shared";
import { MAX_MONEY } from "../../../common/constants/money";

export enum BidCurrencyDto {
  TRY = "TRY",
  USD = "USD",
  EUR = "EUR",
  GBP = "GBP",
  CHF = "CHF",
  JPY = "JPY",
  AED = "AED",
  CNY = "CNY",
  RUB = "RUB",
}

export class PlaceBidAnswerDto {
  @IsString()
  questionId!: string;

  @IsString()
  @MaxLength(500)
  value!: string;
}

export class PlaceBidItemDto {
  @IsString()
  itemId!: string;

  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: "Geçerli bir birim fiyat girin" },
  )
  @Min(0)
  // Tekil birim fiyat tavanı — çarpım (× miktar) taşması AYRICA serviste
  // subtotal ≤ MAX_MONEY ile denetlenir (asıl koruma orada).
  @Max(MAX_MONEY, { message: "Birim fiyat çok büyük" })
  unitPrice!: number;

  // Kalem-özel teslim tarihi — LEGACY (yeni teklifler süre gönderir).
  @IsOptional()
  @IsISO8601({}, { message: "Geçersiz kalem teslim tarihi" })
  deliveryDate?: string;

  // Kalem-özel teslim SÜRESİ (2026-08-02; boşsa genel süre geçerli).
  @IsOptional()
  @IsIn(BID_DELIVERY_TIMES as readonly string[], {
    message: "Geçersiz kalem teslim süresi",
  })
  deliveryTime?: BidDeliveryTime;

  // Kalem para birimi (madde 9; boşsa teklifin ana birimi). İlanın izin verdiği
  // birimlerden; yalnız kapalı zarf ALIM ihalesinde — servis doğrular.
  @IsOptional()
  @IsEnum(BidCurrencyDto, { message: "Geçersiz kalem para birimi" })
  currency?: BidCurrencyDto;

  // Kalemin sorularına cevaplar (gönderimde zorunlu sorular denetlenir).
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlaceBidAnswerDto)
  @ArrayMaxSize(20)
  answers?: PlaceBidAnswerDto[];
}

export class PlaceBidDto {
  // Tek-tutar teklif (kalemsiz ihale/ilan). Kalem-bazlı ihalede `items` kullanılır.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "Geçerli bir tutar girin" })
  @Min(0.01, { message: "Tutar 0'dan büyük olmalı" })
  @Max(MAX_MONEY, { message: "Tutar çok büyük" })
  amount?: number;

  // Kalem-bazlı teklif: her kaleme birim fiyat. Tavan ilan kalem tavanıyla
  // (500) eşit — requireAllItems'ta teklifçi TÜM kalemleri fiyatlayabilmeli.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlaceBidItemDto)
  @ArrayMaxSize(500)
  items?: PlaceBidItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  // true → taslak teklif (gönderilmez). false/undefined → gönder (SUBMITTED).
  @IsOptional()
  @IsBoolean()
  asDraft?: boolean;

  // Teslim tarihi — LEGACY (yeni teklifler süre gönderir; API geriye-uyumlu).
  @IsOptional()
  @IsISO8601({}, { message: "Geçersiz teslim tarihi" })
  deliveryDate?: string;

  // Gönderimde zorunlu: teslim SÜRESİ (ALIM: satıcının taahhüdü, SATIS:
  // alıcının istediği süre) — kalemlerin tamamı kendi süresini taşımıyorsa.
  @IsOptional()
  @IsIn(BID_DELIVERY_TIMES as readonly string[], {
    message: "Geçersiz teslim süresi",
  })
  deliveryTime?: BidDeliveryTime;

  // SATIS: alıcının teslimat adresi (kendi adres defterinden). Adrese-teslim
  // şartlı ilanlarda gönderimde zorunlu.
  @IsOptional()
  @IsString()
  deliveryAddressId?: string;

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

/** Hemen Al — placeBid ile aynı validasyon sınırları (eskiden DTO yoktu). */
export class BuyNowDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsOptional()
  @IsISO8601({}, { message: "Geçersiz teslim tarihi" })
  deliveryDate?: string;

  @IsOptional()
  @IsIn(BID_DELIVERY_TIMES as readonly string[], {
    message: "Geçersiz teslim süresi",
  })
  deliveryTime?: BidDeliveryTime;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  validityDays?: number;

  @IsOptional()
  @IsString()
  deliveryAddressId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(500) // ilan kalem tavanıyla (500) birebir
  itemIds?: string[];
}
