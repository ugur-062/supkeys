import { Transform } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";

/**
 * Ürün dizini sorgusu — `PublicListQueryDto` ile aynı disiplin: her alan dar,
 * çünkü değerler doğrudan Prisma `contains` içine iniyor ve bu uçlar kenar
 * önbelleğine yazılıyor (sınırsız varyant = önbellek zehirlenmesi).
 *
 * `state` YOK: ürünün "açık/kapalı"sı yoktur — yayımlanmış ya da değil.
 */
export class PublicProductQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  q?: string;

  /** Tam 8 haneli kategori kodu; ata zinciri sunucuda genişletilir. */
  @IsOptional()
  @Matches(/^\d{8}$/, { message: "Kategori kodu 8 haneli olmalı" })
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  city?: string;

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
