import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { countryName } from "@rothern/shared";
import type { Locale } from "@rothern/i18n";
import { PrismaBypassService } from "../../common/prisma/prisma.service";
import { GeoIndex, geoIndex, resolveCityId, setGeoIndex, type GeoCityRow } from "../../common/geo/geo-index";

/**
 * Tablo boşken (ya da okuma hatasında) yeniden deneme aralığı. Kurulum sırası
 * gereği `seed-geo-cities` API AÇILDIKTAN SONRA koşulur (migration konteyner
 * açılışında çalışıyor, tablo o anda boş) — yalnız açılışta yükleyen servis
 * canlıda bir sonraki deploy'a dek TR+KKTC yedeğinde kalıyordu (derin denetim
 * 2026-09-29 Y-21/X07): yabancı şehir sayfası 404, yabancı kayıtlarda
 * `cityId` null. Dolu tabloda deneme durur; boş tabloda sorgu ucuzdur.
 */
export const GEO_RELOAD_RETRY_MS = 5 * 60_000;

/** Yedekteyken (tam liste yüklenmeden) herkese açık şehir yanıtlarının kısa önbelleği. */
export const GEO_FALLBACK_CACHE_CONTROL = "public, max-age=60, s-maxage=300";

/**
 * Dünya şehir listesini (`geo_cities`) belleğe yükler ve `geoIndex()` kaydına
 * yazar (2026-09-27). Açılışı BEKLETMEZ: yükleme arka planda; bitene dek
 * Türkiye + KKTC yedeği çalışır. Tablo boşsa (seed koşulmamış) yedek kalır ve
 * `GEO_RELOAD_RETRY_MS` aralıkla yeniden denenir — seed sonrası API'yi yeniden
 * başlatmak gerekmez. Dizin ÖRNEK BAŞINA bellekte olduğu için bu deneme
 * advisory lock'lu `@Cron` DEĞİL (kilit onu tek örnekte koştururdu).
 */
@Injectable()
export class GeoCityService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GeoCityService.name);
  private loaded = false;
  private destroyed = false;
  private emptyWarned = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly prisma: PrismaBypassService) {}

  onModuleInit(): void {
    void this.loadOrRetry();
  }

  onModuleDestroy(): void {
    this.destroyed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  /** Tam dünya listesi bellekte mi (değilse TR+KKTC yedeği çalışıyor). */
  get fullListLoaded(): boolean {
    return this.loaded;
  }

  private async loadOrRetry(): Promise<void> {
    this.retryTimer = null;
    let n = 0;
    try {
      n = await this.reload();
    } catch (err) {
      this.logger.warn(`Geo city list could not be loaded: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (n > 0 || this.destroyed) return;
    if (!this.emptyWarned) {
      this.emptyWarned = true;
      this.logger.warn(`Geo city list not loaded (TR fallback); retrying every ${GEO_RELOAD_RETRY_MS / 60_000} min`);
    }
    this.retryTimer = setTimeout(() => void this.loadOrRetry(), GEO_RELOAD_RETRY_MS);
    this.retryTimer.unref?.();
  }

  async reload(): Promise<number> {
    const rows = await this.prisma.geoCity.findMany({
      select: {
        id: true,
        countryCode: true,
        name: true,
        nameTr: true,
        nameEn: true,
        nameRu: true,
        slug: true,
        lat: true,
        lng: true,
        population: true,
        searchText: true,
      },
    });
    if (rows.length > 0) {
      setGeoIndex(new GeoIndex(rows));
      this.loaded = true;
      this.logger.log(`Geo city list loaded: ${rows.length}`);
    }
    return rows.length;
  }

  resolveCityId(country: string | null | undefined, cityText: string | null | undefined, cityId?: number | null): number | null {
    return resolveCityId(country, cityText, cityId);
  }

  toDto(row: GeoCityRow, locale: Locale) {
    const idx = geoIndex();
    return {
      id: row.id,
      slug: row.slug,
      name: idx.label(row, locale),
      countryCode: row.countryCode,
      countryName: countryName(row.countryCode),
    };
  }
}
