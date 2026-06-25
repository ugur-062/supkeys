import { IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class PlaceBidDto {
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "Geçerli bir tutar girin" })
  @Min(0.01, { message: "Tutar 0'dan büyük olmalı" })
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
