import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  ValidateNested,
} from "class-validator";

export class ItemAwardDto {
  @IsString()
  itemId!: string;

  @IsString()
  bidId!: string;
}

export class AwardByItemDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ItemAwardDto)
  itemAwards!: ItemAwardDto[];
}
