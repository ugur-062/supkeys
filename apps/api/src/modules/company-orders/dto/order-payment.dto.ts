import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";

/** Çek ödemesi için method değeri — UI ve DTO bu sabiti paylaşır. */
export const CHEQUE_METHOD = "Çek";

export class RecordPaymentDto {
  // Decimal(18,2) sütununa yazılır — 2 ondalıktan fazlası kap kontrolüyle
  // saklanan değer arasında yuvarlama sapması yaratmasın.
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: "Tutar 0'dan büyük olmalı" })
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  method?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  // Çek alanları — method "Çek" ise çek no + vade zorunlu.
  @ValidateIf((o) => o.method === CHEQUE_METHOD)
  @IsString()
  @IsNotEmpty({ message: "Çek numarası zorunludur" })
  @MaxLength(100)
  chequeNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  chequeBank?: string;

  @ValidateIf((o) => o.method === CHEQUE_METHOD)
  @IsDateString({}, { message: "Geçersiz vade tarihi" })
  chequeDueDate?: string;
}

/** Sipariş reddi/iptali — gerekçe zorunlu (eski sistemle aynı, min 10 karakter). */
export class OrderReasonDto {
  @IsString()
  @IsNotEmpty({ message: "Gerekçe zorunludur" })
  @MinLength(10, { message: "Gerekçe en az 10 karakter olmalı" })
  @MaxLength(1000)
  reason!: string;
}

/** Ödeme reddi — gerekçe zorunlu (eski sistemle aynı). */
export class RejectPaymentReasonDto {
  @IsString()
  @IsNotEmpty({ message: "Red sebebi zorunludur" })
  @MaxLength(1000)
  reason!: string;
}
