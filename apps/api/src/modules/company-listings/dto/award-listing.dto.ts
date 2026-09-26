import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { tApi } from "../../../common/i18n/i18n.service";

export class AwardListingDto {
  @IsString()
  @MinLength(1, { message: () => tApi("api.dto.awardListing.teklifSecilmedi") })
  bidId!: string;

  // Onay akışı devredeyse onaycılara iletilen başlatıcı notu.
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  approvalNote?: string;
}
