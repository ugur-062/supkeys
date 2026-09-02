import { COMPANY_ACTIVITY_CODES } from "@rothern/shared";
import { Transform } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";

/** Firma dizini sorgusu — giriş gerektirir; her alan dar ve doğrulanmış. */
export class DirectoryQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  city?: string;

  @IsOptional()
  @Matches(/^\d{8}$/, { message: "Kategori kodu 8 haneli olmalı" })
  category?: string;

  @IsOptional()
  // Faaliyet tipleri TEK KAYNAK: @rothern/shared company-activities.ts.
  // Buraya elle kopyalansaydı yeni bir tip eklendiğinde dizin süzgeci onu
  // sessizce reddederdi.
  @IsIn(COMPANY_ACTIVITY_CODES as readonly string[])
  activity?: string;

  @IsOptional()
  @Transform(({ value }) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : value;
  })
  @IsInt()
  @Min(1)
  @Max(200)
  page?: number;
}
