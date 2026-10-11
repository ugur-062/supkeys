import { currencyForLocale } from "@rothern/shared";
import { getLocale } from "next-intl/server";
import { EMPTY_LISTING_FILTERS, toListingListParams } from "./listing-filter-params";
import { fetchListingCount, fetchProductCount, type ListParams, type ProductListParams } from "./marketplace-api";
import { EMPTY_FILTERS as EMPTY_PRODUCT_FILTERS, toProductListParams } from "./product-filter-params";
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
 * döndürse de sayaç doğru. İstekler veri önbelleğine düşer (`countOf` →
 * `loadPublicJson`, ana listenin süresi ve etiketiyle), yani aynı sorgu için
 * tekrar tekrar gidilmez.
 *
 * SAYAÇ İKİNCİLDİR — İKİNCİL OKUMAYLA ÇEKİLİR (gözden geçirme C2-2). Ana liste
 * çağrıları (`fetchProducts` / `fetchListings`) BURADA KULLANILMAZ: onlar ana
 * verinin "kısa bekle–yeniden dene" politikasını taşır (`upstream-retry.ts`).
 * Karşı yüzeyin ucu 500 dönerken sayfa, sonunda atılacak rozet için o uca dört
 * istek atıp ~4 sn bekliyordu; vazgeçiş ayrıca süreç genelindeki tek deneme
 * kipini açıp sıradaki gerçek ana okumayı yeniden denemesiz bırakıyordu.
 * `fetchProductCount` / `fetchListingCount` tek deneme yapar, kesintide `null`
 * ("bilinmiyor") döner ve tek deneme kipine dokunmaz.
 *
 * ADRES KARŞI YÜZEYİN ANA LİSTESİYLE AYNI (canlı doğrulama OUT-6). Veri
 * önbelleği girdisi (adres, dil) ile anahtarlı; sayım ancak karşı sekmenin
 * `?q=` sayfasının ANA liste çağrısıyla aynı adresi üretirse o girdiyi
 * paylaşır. Eskiden paylaşmıyordu: sayım `/public/listings?q=…` ve
 * `/public/products?q=…` soruyordu, sayfalar ise `type=ALIM` ve dilin para
 * birimini (`currency=TRY`) ekliyor — her arama sayfası önbelleğe düşmeyen iki
 * fazladan sayım çağrısı yapıyor, kesintide sekmeye geçen ziyaretçi az önce
 * sayılmış listeyi önbellekte bulamıyordu. Parametreler artık sayfaların KENDİ
 * üreticilerinden gelir (`toListingListParams` / `toProductListParams` +
 * `currencyForLocale`): sayfa bir varsayılan eklerse sayım da ekler. Sonuç
 * değişmez — talep ucu yalnız ALIM döndürür, para birimi yalnız fiyat aralığı
 * süzgecini etkiler (burada yok).
 *
 * Hata dayanıklılığı çağıranda değil BURADA: karşı yüzeyin ucu 500 dönse sekme
 * sayısız çizilir — sayfa çökmez, yalnız rozet kaybolur (derin denetim LU-24).
 * `null` rozet YOK demektir, "0" değil; gerçek sıfır (sağlıklı uç, sonuç yok)
 * sayı olarak döner.
 */
/** `/alim-talepleri?q=…` sayfasının ana liste parametreleri (`ListingIndex` ile aynı üretici). */
export function crossListingParams(q: string): ListParams {
  return toListingListParams({ ...EMPTY_LISTING_FILTERS, q });
}

/** `/urunler?q=…` sayfasının ana liste parametreleri (`ProductIndex` ile aynı üretici ve varsayılan birim). */
export function crossProductParams(q: string, locale: string): ProductListParams {
  return toProductListParams({ ...EMPTY_PRODUCT_FILTERS, q }, { defaultCurrency: currencyForLocale(locale) });
}

/** Sayfanın dili — veri önbelleği anahtarındaki dille (`publicHeaders`) aynı kural. */
async function pageLocale(): Promise<string> {
  try {
    return await getLocale();
  } catch {
    return "tr";
  }
}

export async function crossCounts(
  q: string | undefined,
  self: SearchSurface,
): Promise<Partial<Record<SearchSurface, number>>> {
  if (!q) return {};
  // FİRMA SAYISI BASILMAZ (2026-09-22, kullanıcı kararı: "sayı falan
  // görünmesin, başta az firma olacağı için kötü intiba bırakır") — dizin
  // artık üyeliğe yönlendiren vitrin; sekmede firma rozeti yok.
  const [products, listings] = await Promise.all([
    self === "products" ? null : pageLocale().then((locale) => fetchProductCount(crossProductParams(q, locale))).catch(() => null),
    self === "listings" ? null : fetchListingCount(crossListingParams(q)).catch(() => null),
  ]);
  return {
    ...(typeof products === "number" ? { products } : {}),
    ...(typeof listings === "number" ? { listings } : {}),
  };
}
