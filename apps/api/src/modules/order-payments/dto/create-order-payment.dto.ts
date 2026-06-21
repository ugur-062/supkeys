import { Currency, PaymentMethod } from "@supkeys/db";
import { Type } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";

/**
 * Faz 3 madde 16 — Alıcı bir ödeme kaydı oluşturur ("ödedim").
 * Çek seçilirse çek no + vade tarihi zorunlu.
 */
export class CreateOrderPaymentDto {
  @IsEnum(PaymentMethod, { message: "Geçersiz ödeme şekli" })
  method!: PaymentMethod;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 }, { message: "Geçersiz tutar" })
  @Min(0.0001, { message: "Tutar 0'dan büyük olmalıdır" })
  amount!: number;

  @IsEnum(Currency, { message: "Geçersiz para birimi" })
  currency!: Currency;

  @ValidateIf((o) => o.method === PaymentMethod.CHEQUE)
  @IsString()
  @IsNotEmpty({ message: "Çek numarası zorunludur" })
  @MaxLength(100)
  chequeNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  chequeBank?: string;

  @ValidateIf((o) => o.method === PaymentMethod.CHEQUE)
  @IsDateString({}, { message: "Geçersiz vade tarihi" })
  chequeDueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
