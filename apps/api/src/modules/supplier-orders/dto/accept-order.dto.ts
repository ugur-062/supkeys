import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class AcceptOrderDto {
  // Zorunlu — tedarikçi onaylarken tahmini teslim tarihi vermek zorundadır.
  @IsDateString()
  expectedDeliveryDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  acceptedNote?: string;

  // G6 madde 20 — alıcının ödeme yapacağı hesap, kayıtlı bankalardan seçilir.
  // Serbest IBAN/hesap sahibi girişi kaldırıldı; hesap bankId'den çözülür.
  @IsString()
  @IsNotEmpty({ message: "Bir banka hesabı seçmelisiniz" })
  bankId!: string;
}
