/**
 * KATEGORİ FOTOĞRAFLARI — 58 üst kategori (UNSPSC segment), hepsi dolu
 * (2026-09-04). Dosya: `apps/web/public/categories/<8 haneli kod>.webp`,
 * 1200×800 (3:2), ≤140 KB. Kaynak ve lisans kaydı:
 * `docs/category-photo-credits.md` — yalnız CC0 / Public Domain (Openverse),
 * atıf zorunlu değil, kayıt yine de tutulur.
 *
 * Kullanım kademesi (`categoryGridImage` / `CategoryImage` / `CategoryVisualBox`):
 *   1. kaydın kendi görseli (ürün kapağı, ilan kapağı),
 *   2. kategorinin SEGMENT fotoğrafı — bu manifest (kod hangi seviyede
 *      olursa olsun ilk iki haneden segment türetilir),
 *   3. üretilmiş kategori görseli (`category-visual.ts` ikon + ton) — yalnız
 *      manifestte olmayan/bilinmeyen kod.
 *
 * Manifest ELLE: sunucu bileşeni dosya sistemine bakmasın. Fotoğraf
 * eklerken/değiştirirken kodu buraya ve credits dosyasına yaz.
 */
export const CATEGORY_PHOTOS: ReadonlySet<string> = new Set<string>([
  "10000000", "11000000", "12000000", "13000000", "14000000", "15000000",
  "20000000", "21000000", "22000000", "23000000", "24000000", "25000000", "26000000", "27000000",
  "30000000", "31000000", "32000000", "39000000",
  "40000000", "41000000", "42000000", "43000000", "44000000", "45000000", "46000000", "47000000", "48000000", "49000000",
  "50000000", "51000000", "52000000", "53000000", "54000000", "55000000", "56000000", "57000000",
  "60000000", "64000000",
  "70000000", "71000000", "72000000", "73000000", "76000000", "77000000", "78000000",
  "80000000", "81000000", "82000000", "83000000", "84000000", "85000000", "86000000",
  "90000000", "91000000", "92000000", "93000000", "94000000", "95000000",
]);

/** Segment kodunun fotoğrafı — yalnız manifestteki TAM kod (`23000000`). */
export function categoryPhotoSrc(code: string): string | null {
  return CATEGORY_PHOTOS.has(code) ? `/categories/${code}.webp` : null;
}

/**
 * Herhangi seviyedeki kategori kodlarından SEGMENT fotoğrafı: ilk iki hane +
 * altı sıfır. Listedeki ilk eşleşen kazanır (talep/ilan birden çok kategori
 * taşıyabilir). Bilinmeyen/boş → null (üretilmiş görsel devreye girer).
 */
export function segmentPhotoSrc(categoryIds: readonly string[] | undefined): string | null {
  for (const id of categoryIds ?? []) {
    if (!/^\d{8}$/.test(id)) continue;
    const seg = `${id.slice(0, 2)}000000`;
    const src = categoryPhotoSrc(seg);
    if (src) return src;
  }
  return null;
}
