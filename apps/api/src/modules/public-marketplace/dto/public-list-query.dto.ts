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

  /** Şehir — virgüllü çoklu (PROMPT 4, 2026-09-06; tek değer geriye uyumlu). */
  @IsOptional()
  @IsString()
  @MaxLength(400)
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

  /** Kalan süre: 3, 7 ya da 30 gün içinde kapanacaklar. */
  @IsOptional()
  @IsIn(["3", "7", "30"])
  closesWithin?: "3" | "7" | "30";

  /** Kapsam: yurtiçi / uluslararası (`isInternational`). */
  @IsOptional()
  @IsIn(["domestic", "international"])
  scope?: "domestic" | "international";

  /** Sıralama: `newest` (varsayılan, yayın tarihi) | `closing` (süresi yaklaşan). */
  @IsOptional()
  @IsIn(["newest", "closing"])
  sort?: "newest" | "closing";

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

/**
 * Facet sorgusu — BAĞLAMSAL sayaçlar (PROMPT 4): her boyut, diğer seçimler
 * uygulanmış hâlde sayılır. Liste DTO'su yeniden kullanılmadı: `page`/`sort`
 * gibi sayımı etkilemeyen alanlar kenar önbelleği anahtarını çoğaltmasın.
 */
export class PublicListFacetQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  q?: string;

  @IsOptional()
  @Matches(/^\d{8}$/, { message: "Kategori kodu 8 haneli olmalı" })
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  city?: string;

  @IsOptional()
  @IsIn(["domestic", "international"])
  scope?: "domestic" | "international";

  @IsOptional()
  @IsIn(["3", "7", "30"])
  closesWithin?: "3" | "7" | "30";
}
