import { Transform } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { tApi } from "../../../common/i18n/i18n.service";

/**
 * Alıcı ülkesi listesi (`TR,de, XX1`) → büyük harf, yalnız iki harfli kodlar,
 * tekrarsız, en çok 10 (`["TR","DE"]`). Bozuk parça 400 değil sessizce düşer:
 * elle düzenlenmiş bağlantı ziyaretçiye hata sayfası çizdirmesin (web
 * ayrıştırıcısı da aynı kuralı uygular). DTO dönüşümü ve servis AYNI işlevi
 * okur (servis doğrudan çağrıldığında da — testler, iç kullanım).
 */
export function buyerCountryList(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return [
    ...new Set(
      value
        .split(",")
        .map((x) => x.trim().toUpperCase())
        .filter((x) => /^[A-Z]{2}$/.test(x)),
    ),
  ].slice(0, 10);
}

/** DTO dönüşümü: geçerli kod kalmazsa süzgeç yok (undefined). */
function normalizeBuyerCountries(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const codes = buyerCountryList(value);
  return codes.length ? codes.join(",") : undefined;
}

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
  @Matches(/^\d{8}$/, { message: () => tApi("api.dto.publicListQuery.kategoriKodu8HaneliOlmali") })
  category?: string;

  /**
   * ALICI ÜLKESİ (talebin açıldığı ülke) — virgüllü çoklu ISO alpha-2
   * (`TR,DE`). 2026-10-04 sahip kararı: talep dizininde alıcının ŞEHRİ
   * süzgeci kalktı, yerine bu geldi.
   */
  @IsOptional()
  @IsString()
  @MaxLength(400)
  @Transform(({ value }) => normalizeBuyerCountries(value))
  buyerCountry?: string;

  /**
   * ESKİ alıcı şehri süzgeci — 2026-10-04'ten beri YOK SAYILIR. Kabul
   * edilmeye devam eder ki dağıtım sırasında eski istemci / önbellekteki
   * sayfa `forbidNonWhitelisted` ile 400 almasın (süzülmemiş liste döner).
   */
  @IsOptional()
  @IsString()
  @MaxLength(400)
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

  /** Görünürlük ülkesi (ISO alpha-2): bu ülkedeki tedarikçinin görebildiği talepler (boş hedef = herkes). */
  @IsOptional()
  @IsString()
  @Length(2, 2)
  country?: string;

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
  /** Görünürlük ülkesi (liste ile aynı anlam). */
  @IsOptional()
  @IsString()
  @Length(2, 2)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  q?: string;

  @IsOptional()
  @Matches(/^\d{8}$/, { message: () => tApi("api.dto.publicListQuery.kategoriKodu8HaneliOlmali") })
  category?: string;

  /** Alıcı ülkesi — liste ile aynı biçim ve anlam. */
  @IsOptional()
  @IsString()
  @MaxLength(400)
  @Transform(({ value }) => normalizeBuyerCountries(value))
  buyerCountry?: string;

  /** ESKİ şehir süzgeci — yok sayılır (liste DTO'sundaki not). */
  @IsOptional()
  @IsString()
  @MaxLength(400)
  city?: string;

  @IsOptional()
  @IsIn(["domestic", "international"])
  scope?: "domestic" | "international";

  @IsOptional()
  @IsIn(["3", "7", "30"])
  closesWithin?: "3" | "7" | "30";
}
