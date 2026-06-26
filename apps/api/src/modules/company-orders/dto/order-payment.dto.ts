import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from "class-validator";

export class RecordPaymentDto {
  @IsNumber()
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
}

export class RejectReasonDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
