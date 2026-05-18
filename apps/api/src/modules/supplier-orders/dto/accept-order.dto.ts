import {
  IsDateString,
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

  // Banka bilgileri (alıcının ödeme yapacağı hesap)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankAccountHolder?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  bankIban?: string;

  // Fatura kesim tarihi
  @IsOptional()
  @IsDateString()
  invoiceDate?: string;
}
