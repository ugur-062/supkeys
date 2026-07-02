import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

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

  /** Ayarlar → Banka Hesapları'ndan seçilen hesabın id'si (opsiyonel). */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  bankAccountId?: string;
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
