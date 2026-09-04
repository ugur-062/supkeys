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

  /** Şehir — tek ya da virgüllü çoklu ("İstanbul,İzmir"). */
  @IsOptional()
  @IsString()
  @MaxLength(400)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  city?: string;

  /** Sıralama — `relevance`, `newest`, `price` (artan), `price_desc` (azalan); fiyatsızlar sonda. */
  @IsOptional()
  @IsIn(["relevance", "newest", "price", "price_desc"])
  sort?: "relevance" | "newest" | "price" | "price_desc";

  /** Birim fiyat aralığı (TRY). */
  @IsOptional()
  @Transform(({ value }) => (value === "" || value == null ? undefined : Number(value)))
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  priceMin?: number;

  @IsOptional()
  @Transform(({ value }) => (value === "" || value == null ? undefined : Number(value)))
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  priceMax?: number;

  /** Min. sipariş tavanı — bu miktarı aşan MOQ'lar dışarıda. */
  @IsOptional()
  @Transform(({ value }) => (value === "" || value == null ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  moqMax?: number;

  /** Yalnız kimliği doğrulanmış firmaların ürünleri. */
  @IsOptional()
  @IsIn(["1"])
  verified?: string;

  /** `has` = fiyatı yazılı ürünler, `request` = teklifle. */
  @IsOptional()
  @IsIn(["has", "request"])
  price?: "has" | "request";

  /** Faaliyet tipi kodu — tek ya da virgüllü çoklu; tanınmayan kod yok sayılır. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
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

  /** v3 (2026-09-04): BAĞLAMA DUYARLI sayım — diğer seçimler bu alanlarla gelir. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  activity?: string;

  @IsOptional()
  @IsIn(["1"])
  verified?: string;

  @IsOptional()
  @IsIn(["has", "request"])
  price?: "has" | "request";
}
