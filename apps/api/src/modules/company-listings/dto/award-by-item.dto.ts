import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

export class ItemAwardDto {
  @IsString()
  itemId!: string;

  @IsString()
  bidId!: string;

  // Kısmi kazandırma: bu kalemden verilen miktar (boşsa tam kalem miktarı).
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  awardedQuantity?: number;
}

export class AwardByItemDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500) // ilan kalem tavanıyla (500) birebir
  @ValidateNested({ each: true })
  @Type(() => ItemAwardDto)
  itemAwards!: ItemAwardDto[];

  // Onay akışı devredeyse onaycılara iletilen başlatıcı notu.
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  approvalNote?: string;
}
