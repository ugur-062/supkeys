import { fetchListingCount, fetchProductCount, fetchPublicDirectoryCount } from "@/lib/public/marketplace-api";

/**
 * BOŞ DİZİN SAYFASI İNDEKSLENMEZ (2026-09-13).
 *
 * Pazar yeri boşken `/urunler`, `/firmalar` ve `/alim-talepleri` içeriksiz
 * listelerdir. Arama motoru bunları "ince içerik" / yumuşak 404 sayar ve
 * tekrar tekrar boş sayfa taramak alan adının genel değerlendirmesini düşürür.
 * Kural KENDİ KENDİNİ ONARIR: ilk kayıt girdiği anda sayfa yeniden
 * indekslenebilir olur, elle müdahale gerekmez.
 *
 * Sayım başarısız olursa (API erişilemez) sayfa İNDEKSLENEBİLİR kalır:
 * geçici bir hata yüzünden kalıcı SEO kaybı yaşamak, boş sayfanın zararından
 * büyüktür.
 *
 * SAYIM İKİNCİL OKUMADIR (gözden geçirme C2-2): `generateMetadata` ve sitemap
 * bu sonucu yalnız `noindex` kararı için ister; hata zaten "bilinmiyor"
 * sayılır. Bu yüzden ana liste çağrıları (`fetchProducts` /
 * `fetchPublicDirectory` / `fetchListings`) değil, onların ikincil sayım
 * karşılıkları kullanılır: tek deneme, kısa zaman aşımı, kesintide `null`.
 * Ana çağrıyla sayılırken API 500 dönünce `generateMetadata` dört istek atıp
 * ~4 sn (asılı API'de 8 sn) bekliyor, vazgeçişi de süreç genelindeki tek
 * deneme kipini açıp sayfanın gerçek ana okumasını yeniden denemesiz
 * bırakıyordu. Adres ve önbellek girdisi ana listeyle aynıdır.
 */
export type DizinTuru = "urunler" | "firmalar" | "talepler";

async function sayim(tur: DizinTuru): Promise<number | null> {
  try {
    if (tur === "urunler") return await fetchProductCount({});
    if (tur === "firmalar") return await fetchPublicDirectoryCount({});
    return await fetchListingCount({});
  } catch {
    return null;
  }
}

/**
 * `generateMetadata` içinde kullanılır: dizin boşsa `true` döner ve çağıran
 * bunu `buildMetadata({ noindex })` olarak geçirir (tek kaynak: robots
 * yönergesini `meta.ts` üretir, burada yeniden yazılmaz).
 */
export async function dizinBos(tur: DizinTuru): Promise<boolean> {
  const n = await sayim(tur);
  return n !== null && n === 0;
}
