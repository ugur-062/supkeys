import { IsOptional, IsString, MaxLength } from "class-validator";

/**
 * Madde 29 — FAZ 3.1 kurumsal kimlik (panel-içi editlenebilir alanlar).
 * Hepsi opsiyonel; format kontrolleri serviste shared validator'larla
 * (MERSİS boş|16, IBAN TR mod-97, KEP e-posta).
 */
export class UpdateCorporateIdentityDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  mersisNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  tradeRegistryNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  kepAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  iban?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  ibanHolder?: string;
}
