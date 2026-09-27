import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { countryName } from "@rothern/shared";
import type { Locale } from "@rothern/i18n";
import { PrismaBypassService } from "../../common/prisma/prisma.service";
import { GeoIndex, geoIndex, resolveCityId, setGeoIndex, type GeoCityRow } from "../../common/geo/geo-index";

/**
 * Dünya şehir listesini (`geo_cities`) belleğe yükler ve `geoIndex()` kaydına
 * yazar (2026-09-27). Açılışı BEKLETMEZ: yükleme arka planda; bitene dek
 * Türkiye + KKTC yedeği çalışır. Tablo boşsa (seed koşulmamış) yedek kalır.
 */
@Injectable()
export class GeoCityService implements OnModuleInit {
  private readonly logger = new Logger(GeoCityService.name);

  constructor(private readonly prisma: PrismaBypassService) {}

  onModuleInit(): void {
    void this.reload().catch((err) =>
      this.logger.warn(`Geo city list could not be loaded: ${err instanceof Error ? err.message : String(err)}`),
    );
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
