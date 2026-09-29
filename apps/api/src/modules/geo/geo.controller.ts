import { Controller, Get, Header, NotFoundException, Param, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { Throttle } from "@nestjs/throttler";
import { currentLocale } from "../../common/i18n/locale-context";
import { i18nMessage } from "../../common/i18n/http-i18n";
import { geoIndex } from "../../common/geo/geo-index";
import { GEO_FALLBACK_CACHE_CONTROL, GeoCityService } from "./geo-city.service";

/**
 * Dünya şehir listesi (2026-09-27) — herkese açık başvuru verisi (GeoNames).
 * Pazar yeri anahtarına TABİ DEĞİL: kayıt formu ve adres defteri de kullanır.
 *
 * Yanıt okuyucunun dilinde (ad `Accept-Language`tan) ve CDN'de önbelleğe
 * alınıyor → `Vary: Accept-Language` ŞART; yoksa ilk isteğin dili herkese
 * dağıtılır. `res.vary` EKLER (CORS'un `Vary: Origin`ini ezmez).
 *
 * Tam liste henüz yüklenmemişken (TR+KKTC yedeği; seed API açıldıktan sonra
 * koşulur) önbellek KISA: yedeğin boş yabancı araması / 404'ü CDN'de 24 saat
 * kalmasın. Nest `@Header`ı işleyiciden ÖNCE yazar; burada ezilir (atılan
 * 404'te de geçerli).
 */
@Controller("public/geo")
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class GeoController {
  constructor(private readonly geo: GeoCityService) {}

  /** Şehir arama önerisi: `q` (≥2 harf), isteğe bağlı `country` (ISO). */
  @Get("cities")
  @Header("Cache-Control", "public, max-age=3600, s-maxage=86400")
  search(
    @Res({ passthrough: true }) res: Response,
    @Query("q") q?: string,
    @Query("country") country?: string,
    @Query("limit") limit?: string,
  ) {
    res.vary("Accept-Language");
    this.shortCacheOnFallback(res);
    const n = Math.min(Math.max(Number(limit) || 10, 1), 20);
    const cc = country && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : null;
    return geoIndex()
      .search((q ?? "").slice(0, 60), { country: cc, limit: n })
      .map((r) => this.geo.toDto(r, currentLocale()));
  }

  /** Kalıcı adresten şehir (şehir sayfası). Eski ham il adı da çözülür. */
  @Get("cities/:slug")
  @Header("Cache-Control", "public, max-age=3600, s-maxage=86400")
  bySlug(@Res({ passthrough: true }) res: Response, @Param("slug") slug: string) {
    res.vary("Accept-Language");
    this.shortCacheOnFallback(res);
    const row = geoIndex().resolveParam(slug.slice(0, 120));
    if (!row) throw new NotFoundException(i18nMessage("api.geo.sehirBulunamadi"));
    return this.geo.toDto(row, currentLocale());
  }

  private shortCacheOnFallback(res: Response): void {
    if (!this.geo.fullListLoaded) res.setHeader("Cache-Control", GEO_FALLBACK_CACHE_CONTROL);
  }
}
