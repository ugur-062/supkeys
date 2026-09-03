/**
 * KATEGORİ FOTOĞRAFLARI — anasayfa "Kategoriye göre keşfet" ızgarası.
 *
 * Görsel kaynağı ÜÇ kademeli (`categoryGridImage`):
 *   1. `apps/web/public/categories/<8 haneli kod>.jpg` — bu manifestte
 *      listelenen kodlar (dosya eklenince kodu buraya yaz; sunucu bileşeni
 *      dosya sistemine bakmasın diye liste elle),
 *   2. o kategorideki İLK YAYINDAKİ ürünün kapağı (canlı veriden),
 *   3. üretilmiş kategori görseli (`category-visual.ts` ikon + ton).
 *
 * 2026-09-04 durumu: klasör BOŞ — 58 segmentin hiçbirinin fotoğrafı yok.
 * Eksik liste = `MAPPED_SEGMENTS` − `CATEGORY_PHOTOS`. Fotoğraf eklerken
 * 3:2 oran, ≤ 200 KB, telifsiz; dosya adı segment kodu (`23000000.jpg`).
 */
export const CATEGORY_PHOTOS: ReadonlySet<string> = new Set<string>([]);

export function categoryPhotoSrc(code: string): string | null {
  return CATEGORY_PHOTOS.has(code) ? `/categories/${code}.jpg` : null;
}
