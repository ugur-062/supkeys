import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class StartDeliveryDto {
  // G5 madde 12/14 — gönderim için fatura no zorunlu (kargo no değil).
  @IsString()
  @IsNotEmpty({ message: "Fatura numarası zorunludur" })
  @MaxLength(100)
  invoiceNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  deliveryNote?: string;
}
