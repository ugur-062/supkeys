import { fetchListings, fetchProducts, fetchPublicDirectory } from "@/lib/public/marketplace-api";

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
 */
export type DizinTuru = "urunler" | "firmalar" | "talepler";

async function sayim(tur: DizinTuru): Promise<number | null> {
  try {
    if (tur === "urunler") return (await fetchProducts({})).total ?? null;
    if (tur === "firmalar") return (await fetchPublicDirectory({})).total ?? null;
    return (await fetchListings({})).total ?? null;
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
