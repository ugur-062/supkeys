import { IsString, MinLength } from "class-validator";

export class AwardListingDto {
  @IsString()
  @MinLength(1, { message: "Teklif seçilmedi" })
  bidId!: string;
}
