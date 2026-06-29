import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

/**
 * Sipariş akış adımı DTO'ları (eski sistemle birebir).
 * Kabul: tahmini teslim tarihi zorunlu; banka/not opsiyonel.
 * Gönder: fatura no zorunlu.
 */
export class AcceptOrderDto {
  @IsDateString({}, { message: "Geçerli bir teslim tarihi girin" })
  expectedDeliveryDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  acceptedNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  bankAccountHolder?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  bankIban?: string;
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
