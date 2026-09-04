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

/**
 * Pazar yeri liste sorgusu — TAMAMEN anonim, hiçbir alan kimliğe bağlı değil.
 *
 * Her alan dar: sorgu dizesi kullanıcıdan gelir ve doğrudan Prisma `contains`
 * içine iner. Uzunluk/biçim sınırı olmadan bırakmak, tek bir istekle çok
 * pahalı bir tarama tetiklemeye (ve önbelleği zehirlemeye) açık kapı bırakır.
 */
export class PublicListQueryDto {
  /** Yalnız ALIM (satış ilanı kaldırıldı); parametre geriye uyum için kalır. */
  @IsOptional()
  @IsIn(["ALIM"])
  type?: "ALIM";

  /** Serbest arama. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  q?: string;

  /** Tam 8 haneli kategori kodu (Category.id). */
  @IsOptional()
  @Matches(/^\d{8}$/, { message: "Kategori kodu 8 haneli olmalı" })
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  city?: string;

  /**
   * `open` (varsayılan) yalnız teklife açık olanlar; `all` kapanmışları da
   * katar (arşiv). Serbest metin kabul edilmez — üçüncü bir değer sessizce
   * "hepsi" anlamına gelmesin.
   */
  @IsOptional()
  @IsIn(["open", "all"])
  state?: "open" | "all";

  /** Kalan süre: 7 ya da 30 gün içinde kapanacaklar. */
  @IsOptional()
  @IsIn(["7", "30"])
  closesWithin?: "7" | "30";

  /** Kapsam: yurtiçi / uluslararası (`isInternational`). */
  @IsOptional()
  @IsIn(["domestic", "international"])
  scope?: "domestic" | "international";

  @IsOptional()
  @Transform(({ value }) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : value;
  })
  @IsInt()
  @Min(1)
  // Derin sayfalama hem pahalı (OFFSET) hem anlamsız: 200. sayfayı ne
  // ziyaretçi ne de tarayıcı okur. Long-tail'i sayfalamayla değil kategori/
  // şehir kırılımlarıyla açıyoruz.
  @Max(200)
  page?: number;
}
