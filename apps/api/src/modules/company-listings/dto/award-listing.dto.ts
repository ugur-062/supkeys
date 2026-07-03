import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class AwardListingDto {
  @IsString()
  @MinLength(1, { message: "Teklif seçilmedi" })
  bidId!: string;

  // Onay akışı devredeyse onaycılara iletilen başlatıcı notu.
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  approvalNote?: string;
}
