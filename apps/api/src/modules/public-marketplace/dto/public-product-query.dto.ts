import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  IsIn,
  IsArray,
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

  /** Sıralama — `relevance` (tamamlanma + yeni), `newest`, `price` (artan; fiyatsızlar sonda). */
  @IsOptional()
  @IsIn(["relevance", "newest", "price"])
  sort?: "relevance" | "newest" | "price";

  /** Yalnız kimliği doğrulanmış firmaların ürünleri. */
  @IsOptional()
  @IsIn(["1"])
  verified?: string;

  /** `has` = fiyatı yazılı ürünler, `request` = teklifle. */
  @IsOptional()
  @IsIn(["has", "request"])
  price?: "has" | "request";

  /** Satıcının faaliyet tipi (CompanyActivity kodu); tanınmayan kod yok sayılır. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  activity?: string;

  /**
   * Nitelik süzgeci — `anahtar:değer` çiftleri, tekrarlanabilir
   * (`?attr=malzeme:Çelik&attr=koruma_sinifi:IP65`).
   *
   * Neden tek param değil de tekrar: değerler serbest metin (kategori
   * tanımından gelir, ayraç içerebilir) — "|" gibi bir ayraçla birleştirmek
   * ilk "|" içeren seçenekte sessizce bölerdi.
   *
   * Tavan 6: her çift ayrı bir JSON koşulu üretir ve bu uçlar kenar
   * önbelleğine yazılıyor; sınırsız kombinasyon hem pahalı sorgu hem sınırsız
   * önbellek anahtarı demek.
   */
  @IsOptional()
  @Transform(({ value }) =>
    value == null ? undefined : Array.isArray(value) ? value : [value],
  )
  @IsArray()
  @ArrayMaxSize(6)
  @Matches(/^[a-z0-9_]{1,40}:[^\n\r]{1,60}$/, {
    each: true,
    message: "Nitelik süzgeci anahtar:değer biçiminde olmalı",
  })
  attr?: string[];

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

/**
 * Facet sorgusu — YALNIZ kategori alır.
 *
 * `PublicProductQueryDto` yeniden kullanılmadı: kullanılmayan parametreler
 * (arama, sayfa) önbellek anahtarını çeşitlendirir ve aynı yanıt için onlarca
 * girdi üretirdi.
 */
export class PublicProductFacetQueryDto {
  @IsOptional()
  @Matches(/^\d{8}$/, { message: "Kategori kodu 8 haneli olmalı" })
  category?: string;
}
