import { Transform } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from "class-validator";

/** Herkese açık firma dizini sorgusu — her alan dar (önbellek anahtarı + contains). */
export class PublicDirectoryQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  q?: string;

  /** Şehir — virgüllü çoklu (PROMPT 4, 2026-09-06; tek değer geriye uyumlu). */
  @IsOptional()
  @IsString()
  @MaxLength(400)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  city?: string;

  /** Kategori — 8 haneli kod, virgüllü çoklu (en çok 10). */
  @IsOptional()
  @Matches(/^\d{8}(,\d{8}){0,9}$/, { message: "Kategori kodu 8 haneli olmalı" })
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  activity?: string;

  @IsOptional()
  @IsIn(["1"])
  verified?: string;

  @IsOptional()
  @IsIn(["1"])
  hasProducts?: string;

  /** Yalnız Gold Üye firmalar (efektif kademe). */
  @IsOptional()
  @IsIn(["1"])
  gold?: string;

  /** Sıralama: relevance (paketli önce) | name (A-Z) | products (en çok ürün) | newest. */
  @IsOptional()
  @IsIn(["relevance", "name", "products", "newest"])
  sort?: "relevance" | "name" | "products" | "newest";

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
