import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
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
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ItemAwardDto)
  itemAwards!: ItemAwardDto[];
}
