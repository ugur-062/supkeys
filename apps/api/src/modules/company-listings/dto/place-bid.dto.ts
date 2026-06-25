import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

export class PlaceBidItemDto {
  @IsString()
  itemId!: string;

  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: "Geçerli bir birim fiyat girin" },
  )
  @Min(0)
  unitPrice!: number;
}

export class PlaceBidDto {
  // Tek-tutar teklif (kalemsiz ihale/ilan). Kalem-bazlı ihalede `items` kullanılır.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "Geçerli bir tutar girin" })
  @Min(0.01, { message: "Tutar 0'dan büyük olmalı" })
  amount?: number;

  // Kalem-bazlı teklif: her kaleme birim fiyat.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlaceBidItemDto)
  @ArrayMaxSize(200)
  items?: PlaceBidItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
