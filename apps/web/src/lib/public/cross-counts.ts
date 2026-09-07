import { fetchListings, fetchProducts, fetchPublicDirectory } from "./marketplace-api";
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
 * Hata dayanıklılığı çağıranda değil BURADA: `getJson` zaten boş yedeğe
 * düşüyor, dolayısıyla bir uç 500 dönse sekme sayısız çizilir — sayfa
 * çökmez, yalnız rozet kaybolur.
 */
export async function crossCounts(
  q: string | undefined,
  self: SearchSurface,
): Promise<Partial<Record<SearchSurface, number>>> {
  if (!q) return {};
  const [products, companies, listings] = await Promise.all([
    self === "products" ? null : fetchProducts({ q }),
    self === "companies" ? null : fetchPublicDirectory({ q }),
    self === "listings" ? null : fetchListings({ q }),
  ]);
  return {
    ...(products ? { products: products.total } : {}),
    ...(companies ? { companies: companies.total } : {}),
    ...(listings ? { listings: listings.total } : {}),
  };
}
