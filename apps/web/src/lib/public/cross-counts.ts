import { fetchListings, fetchProducts } from "./marketplace-api";
import type { SearchSurface } from "@/components/marketplace/public-search-tabs";

/**
 * ARAMA SEKMELERİNİN KARŞI YÜZEY SAYAÇLARI (2026-09-07).
 *
 * `/urunler?q=vana` sayfasındayken "Firmalar 12" rozetini basabilmek için
 * aynı sorgunun öteki yüzeylerdeki toplamı gerekiyor. Kendi yüzeyi zaten
 * sayfada hesaplanmış durumda — burada YALNIZ diğerleri çekilir.
 *
 * SORGU YOKSA HİÇ İSTEK ATILMAZ: aramasız gezinen kullanıcı için sayaç bir
 * bilgi değil gürültü ve her liste yüklemesine iki ağ isteği eklemek olurdu.
 *
 * `page/pageSize` verilmiyor — yalnız `total` okunuyor; uçlar ilk sayfayı
 * döndürse de sayaç doğru. İstekler ISR önbelleğine düşer (`getJson`
 * revalidate), yani aynı sorgu için tekrar tekrar gidilmez.
 *
 * Hata dayanıklılığı çağıranda değil BURADA: `fetchProducts`/`fetchListings`
 * ana veri çağrısıdır ve kesintide (5xx/429/ağ) `PublicApiUnavailableError`
 * atar (B1-1). Sayaç ikincildir → her çağrı ayrı ayrı yutulur; karşı yüzeyin
 * ucu 500 dönse sekme sayısız çizilir — sayfa çökmez, yalnız rozet kaybolur
 * (derin denetim LU-24).
 */
export async function crossCounts(
  q: string | undefined,
  self: SearchSurface,
): Promise<Partial<Record<SearchSurface, number>>> {
  if (!q) return {};
  // FİRMA SAYISI BASILMAZ (2026-09-22, kullanıcı kararı: "sayı falan
  // görünmesin, başta az firma olacağı için kötü intiba bırakır") — dizin
  // artık üyeliğe yönlendiren vitrin; sekmede firma rozeti yok.
  const [products, listings] = await Promise.all([
    self === "products" ? null : fetchProducts({ q }).catch(() => null),
    self === "listings" ? null : fetchListings({ q }).catch(() => null),
  ]);
  return {
    ...(products ? { products: products.total } : {}),
    ...(listings ? { listings: listings.total } : {}),
  };
}
