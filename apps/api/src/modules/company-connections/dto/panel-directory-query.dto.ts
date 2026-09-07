import { Transform } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from "class-validator";
import type { DirectoryParams } from "../../../common/company/company-directory";

/**
 * PANEL FİRMA DİZİNİ SORGUSU — herkese açık `PublicDirectoryQueryDto` ile
 * BİREBİR aynı alanlar + üyeye özel `connection`.
 *
 * Eskiden bu uç elle ayrıştırılmış `@Query("x")` parametreleriydi ve
 * `gold`/`sort` hiç yoktu, `category` tek kod alıyordu: panel, ziyaretçinin
 * yapabildiğini yapamıyordu (aynı hatanın "üye ↔ ziyaretçi tutarlılığı"
 * turunda kapatılan biçimi). DTO'ya geçince `forbidNonWhitelisted` de
 * devreye girer — bilinmeyen parametre sessizce yok sayılmaz.
 */
export class PanelDirectoryQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  q?: string;

  /** Şehir — virgüllü çoklu (public ile aynı tavan; eskiden 60 karakterdi). */
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
  @MaxLength(200)
  activity?: string;

  @IsOptional()
  @IsIn(["1"])
  verified?: string;

  @IsOptional()
  @IsIn(["1"])
  hasProducts?: string;

  @IsOptional()
  @IsIn(["1"])
  gold?: string;

  @IsOptional()
  @IsIn(["relevance", "name", "products", "newest"])
  sort?: "relevance" | "name" | "products" | "newest";

  /**
   * Bağlantı durumu — YALNIZ panelde anlamlı. `connected` bağlı olduklarım,
   * `new` henüz bağlı olmadıklarım (bekleyen istek "bağlı" SAYILMAZ: istek
   * gönderilmiş bir firma hâlâ keşfedilecek bir firmadır).
   */
  @IsOptional()
  @IsIn(["connected", "new"])
  connection?: "connected" | "new";

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
 * Facet sorgusu — sayaçlar BAĞLAMSAL olduğu için listeyle AYNI alanları alır.
 * (Panelin facet ucu eskiden hiçbir parametre almıyordu: arama "boru" iken
 * "İstanbul (7)" tüm dizini sayıyordu, tıklayınca sonuç 0 çıkabiliyordu.)
 */
export class PanelDirectoryFacetQueryDto extends PanelDirectoryQueryDto {}

/** DTO → `DirectoryParams` (dize bayrakları boolean'a). */
export function toDirectoryParams(dto: PanelDirectoryQueryDto): Omit<DirectoryParams, "q"> {
  return {
    city: dto.city || undefined,
    category: dto.category || undefined,
    activity: dto.activity || undefined,
    verified: dto.verified === "1",
    hasProducts: dto.hasProducts === "1",
    gold: dto.gold === "1",
    sort: dto.sort,
    page: dto.page,
  };
}
