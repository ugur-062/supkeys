import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { MAX_MONEY, MAX_QUANTITY } from "../../../common/constants/money";

/**
 * Sipariş akış adımı DTO'ları (eski sistemle birebir).
 * Kabul: tahmini teslim tarihi zorunlu; banka hesabı KAYITLI hesaplardan
 * seçilir (Ayarlar → Banka Hesapları) — elle IBAN girilmez. Gönder: fatura no.
 */
export class AcceptOrderDto {
  @IsDateString({}, { message: "Geçerli bir teslim tarihi girin" })
  expectedDeliveryDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  acceptedNote?: string;

  /** Ayarlar → Banka Hesapları'ndan seçilen hesabın id'si — ZORUNLU: satıcı
   *  ödeme alabilmek için kayıtlı bir hesap seçmeli (alıcının ödeyeceği hesap). */
  @IsString({ message: "Ödeme için banka hesabı seçilmelidir" })
  @MaxLength(60)
  bankAccountId!: string;
}

export class ShipOrderDto {
  @IsString()
  @IsNotEmpty({ message: "Fatura numarası zorunludur" })
  @MaxLength(100)
  invoiceNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  deliveryNote?: string;
}

/** Teslim alma / tamamlama notu (opsiyonel). */
export class OrderNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** Revizyon kalem satırı — satıcının önerdiği yeni değerler (ad + miktar + birim
 *  + birim fiyat, opsiyonel kalem teslim tarihi/notu). Tutar bunlardan hesaplanır. */
export class ReviseOrderItemDto {
  @IsString()
  @IsNotEmpty({ message: "Kalem adı zorunlu" })
  @MaxLength(200)
  name!: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive({ message: "Miktar 0'dan büyük olmalı" })
  @Max(MAX_QUANTITY, { message: "Miktar çok büyük" })
  quantity!: number;

  @IsString()
  @IsNotEmpty({ message: "Birim zorunlu" })
  @MaxLength(20)
  unit!: string;

  // Tekil tavan — satır çarpımı (× miktar) ve genel toplam taşması AYRICA
  // serviste MAX_MONEY ile denetlenir.
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: "Birim fiyat negatif olamaz" })
  @Max(MAX_MONEY, { message: "Birim fiyat çok büyük" })
  unitPrice!: number;

  @IsOptional()
  @IsDateString({}, { message: "Geçersiz teslim tarihi" })
  deliveryDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** Satıcı sipariş revizyonu önerir — yeni kalem satırları + opsiyonel order-level
 *  teslim tarihi ve açıklama notu. Alıcı onaylar/reddeder. */
export class ProposeRevisionDto {
  @IsArray()
  @ArrayMinSize(1, { message: "En az 1 kalem gerekli" })
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ReviseOrderItemDto)
  items!: ReviseOrderItemDto[];

  @IsOptional()
  @IsDateString({}, { message: "Geçerli bir teslim tarihi girin" })
  expectedDeliveryDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
