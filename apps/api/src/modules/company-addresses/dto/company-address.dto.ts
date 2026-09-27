import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  IsInt,
} from "class-validator";
import { tApi } from "../../../common/i18n/i18n.service";

export enum CompanyAddressTypeDto {
  FATURA = "FATURA",
  ILETISIM = "ILETISIM",
  TESLIMAT = "TESLIMAT",
}

export class UpsertAddressDto {
  @IsEnum(CompanyAddressTypeDto, {
    message: () => tApi("api.dto.companyAddress.gecersizAdresTipi"),
  })
  type!: CompanyAddressTypeDto;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;

  /** Eyalet/bölge (TR dışı adres; 2026-09-27). */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  stateRegion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  /** Dünya şehir listesi kaydı (2026-09-27) — seçiciden; yoksa metinden eşlenir. */
  @IsOptional()
  @IsInt()
  cityId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  district?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  addressLine!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  taxOffice?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  taxNumber?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
