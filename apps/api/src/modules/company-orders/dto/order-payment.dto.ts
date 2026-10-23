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
import { tApi } from "../../../common/i18n/i18n.service";

/** Çek ödemesi için method değeri — UI ve DTO bu sabiti paylaşır. */
export const CHEQUE_METHOD = "Çek";

export class RecordPaymentDto {
  // Decimal(18,2) sütununa yazılır — 2 ondalıktan fazlası kap kontrolüyle
  // saklanan değer arasında yuvarlama sapması yaratmasın.
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: () => tApi("api.dto.orderPayment.tutar0danBuyukOlmali") })
  @Max(MAX_MONEY, { message: () => tApi("api.dto.orderPayment.tutarCokBuyuk") })
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
  @IsNotEmpty({ message: () => tApi("api.dto.orderPayment.cekNumarasiZorunludur") })
  @MaxLength(100)
  chequeNo?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(160)
  chequeBank?: string;

  @ValidateIf((o) => o.method === CHEQUE_METHOD)
  @IsDateString({}, { message: () => tApi("api.dto.orderPayment.gecersizVadeTarihi") })
  chequeDueDate?: string;
}

/** Sipariş reddi/iptali — gerekçe zorunlu (eski sistemle aynı, min 10 karakter). */
export class OrderReasonDto {
  @Trim()
  @IsString()
  @IsNotEmpty({ message: () => tApi("api.dto.orderPayment.gerekceZorunludur") })
  @MinLength(10, { message: () => tApi("api.dto.orderPayment.gerekceEnAz10KarakterOlmali") })
  @MaxLength(1000)
  reason!: string;
}

/** Ödeme reddi — gerekçe zorunlu (iptal gerekçesiyle simetri: min 10 karakter). */
export class RejectPaymentReasonDto {
  @Trim()
  @IsString()
  @IsNotEmpty({ message: () => tApi("api.dto.orderPayment.redSebebiZorunludur") })
  @MinLength(10, { message: () => tApi("api.dto.orderPayment.redSebebiEnAz10KarakterOlmali") })
  @MaxLength(1000)
  reason!: string;
}
