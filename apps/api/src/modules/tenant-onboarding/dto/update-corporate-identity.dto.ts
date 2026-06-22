import { IsOptional, IsString, MaxLength } from "class-validator";

/** Madde 29 — FAZ 3.1 kurumsal kimlik (alıcı). Format kontrolü serviste. */
export class UpdateTenantCorporateIdentityDto {
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
