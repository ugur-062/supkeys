import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";
import { MAX_MONEY } from "../../../common/constants/money";
import { Trim } from "../../../common/decorators/trim.decorator";

/** Çek ödemesi için method değeri — UI ve DTO bu sabiti paylaşır. */
export const CHEQUE_METHOD = "Çek";

export class RecordPaymentDto {
  // Decimal(18,2) sütununa yazılır — 2 ondalıktan fazlası kap kontrolüyle
  // saklanan değer arasında yuvarlama sapması yaratmasın.
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: "Tutar 0'dan büyük olmalı" })
  @Max(MAX_MONEY, { message: "Tutar çok büyük" })
  amount!: number;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(80)
  method?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  note?: string;

  // Çek alanları — method "Çek" ise çek no + vade zorunlu.
  @ValidateIf((o) => o.method === CHEQUE_METHOD)
  @Trim()
  @IsString()
  @IsNotEmpty({ message: "Çek numarası zorunludur" })
  @MaxLength(100)
  chequeNo?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(160)
  chequeBank?: string;

  @ValidateIf((o) => o.method === CHEQUE_METHOD)
  @IsDateString({}, { message: "Geçersiz vade tarihi" })
  chequeDueDate?: string;
}

/** Sipariş reddi/iptali — gerekçe zorunlu (eski sistemle aynı, min 10 karakter). */
export class OrderReasonDto {
  @Trim()
  @IsString()
  @IsNotEmpty({ message: "Gerekçe zorunludur" })
  @MinLength(10, { message: "Gerekçe en az 10 karakter olmalı" })
  @MaxLength(1000)
  reason!: string;
}

/** Ödeme reddi — gerekçe zorunlu (iptal gerekçesiyle simetri: min 10 karakter). */
export class RejectPaymentReasonDto {
  @Trim()
  @IsString()
  @IsNotEmpty({ message: "Red sebebi zorunludur" })
  @MinLength(10, { message: "Red sebebi en az 10 karakter olmalı" })
  @MaxLength(1000)
  reason!: string;
}
