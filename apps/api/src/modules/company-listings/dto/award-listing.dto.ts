import { IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
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

  // Onay penceresinde gösterilen teklif tutarı (teklifin kendi biriminde, ham
  // ondalık). Verilirse sunucu kazandırma anındaki teklif tutarıyla karşılaştırır;
  // farklıysa 409 döner ve hiçbir şey yazılmaz (kullanıcı kararı 2026-10-07:
  // pencere tutarı söylüyor, sipariş başka tutarla oluşmasın). İsteğe bağlı —
  // alanı göndermeyen eski istemci eskisi gibi çalışır.
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,15}(\.\d{1,6})?$/)
  expectedAmount?: string;
}
