import { Controller, Get, Header, Param, Query, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { MarketplaceLiveGuard } from "../../common/http/marketplace-live.guard";
import { PublicListQueryDto } from "./dto/public-list-query.dto";
import { PublicMarketplaceService } from "./public-marketplace.service";

/**
 * Auth GEREKTİRMEYEN pazar yeri — herkese açık ilan/talep vitrini.
 *
 * ── Önbellek ──────────────────────────────────────────────────────────────
 * `s-maxage` yalnız paylaşımlı önbelleği (Vercel/CDN) bağlar, tarayıcıyı
 * değil (`max-age=0`): ziyaretçi sayfayı yenilediğinde bayat içerik görmez,
 * ama kenar önbelleği isabet ettiği sürece API'ye hiç gelinmez.
 * `stale-while-revalidate` ile önbellek süresi dolduğunda ziyaretçi BEKLEMEZ;
 * eski yanıt servis edilirken yenisi arka planda alınır.
 *
 * ── Hız sınırı ────────────────────────────────────────────────────────────
 * Varsayılan 100/dk burada YETMEZ: bu uçları çoğunlukla Next.js sunucusu
 * çağırır, yani tüm ziyaretçiler API'ye TEK IP olarak görünür. Sınır o yüzden
 * yükseltildi; okuma-only ve önbelleklenebilir oldukları için risk düşük.
 */
@Controller("public")
// Yayın anahtarı: kapalıyken TÜM pazar yeri uçları 404. Web'deki
// NEXT_PUBLIC_MARKETPLACE_LIVE yalnız sayfaları kapatır; uç açık kalsaydı
// adresi bilen veriye ulaşırdı.
@UseGuards(MarketplaceLiveGuard)
@Throttle({
  default: {
    limit: Number(process.env.THROTTLE_PUBLIC_LIMIT ?? 600),
    ttl: 60_000,
  },
})
export class PublicMarketplaceController {
  constructor(private readonly service: PublicMarketplaceService) {}

  /** Liste — filtre/sayfalama. Kısa önbellek: yeni ilan hızla görünsün. */
  @Get("listings")
  @Header("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=300")
  list(@Query() q: PublicListQueryDto) {
    return this.service.list(q);
  }

  /** Süzgeç sayaçları. Liste kadar sık değişmez → daha uzun önbellek. */
  @Get("listings/facets")
  @Header("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=900")
  facets() {
    return this.service.facets();
  }

  /** Sitemap kaynağı — yalnız DİZİNLENEBİLİR ilanlar. */
  @Get("listings/sitemap")
  @Header("Cache-Control", "public, max-age=0, s-maxage=900, stale-while-revalidate=3600")
  sitemap() {
    return this.service.sitemap();
  }

  /**
   * Tekil ilan — `:number` (ROT-NNNNNN). Statik rotalardan SONRA tanımlı;
   * "facets"/"sitemap" aksi hâlde numara sanılırdı.
   */
  @Get("listings/:number")
  @Header("Cache-Control", "public, max-age=0, s-maxage=120, stale-while-revalidate=600")
  byNumber(@Param("number") number: string) {
    return this.service.getByNumber(number.toUpperCase());
  }
}
