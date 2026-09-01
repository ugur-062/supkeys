/**
 * Kategori kataloğu ekseni — Ariba'nın İKİ dışa aktarımı var ve platformda
 * İKİ AYRI yerde kullanılıyorlar:
 *
 *   "full"      → FİRMA kategori seçimi ("hangi alandasınız"): ana + alt
 *                 kategoriler. Tam katalog (158.018).
 *   "discovery" → TALEP ve İLAN kategorisi. Ariba Discovery alt kümesi
 *                 (158.005).
 *
 * Ölçülen fark YALNIZ L4 yaprakta: 13 yaprak yalnız tam katalogda. L1 (58
 * segment), L2 (558 aile) ve L3 (7.966 sınıf) kod ve ad olarak birebir aynı.
 * Bu yüzden ayrı tablo/ayrı ağaç yok — tek katalog + `Category.inDiscovery`
 * bayrağı (bkz. `packages/db/prisma/schema.prisma`).
 *
 * ⚠️ Buradaki değer yalnız hangi ağacın GÖSTERİLECEĞİNİ seçer — yetki kapısı
 * DEĞİL. Asıl kapı backend'de: talep/ilan kategori doğrulaması `inDiscovery:
 * true` şart koşar (`company-listings.service.ts`), firma seçimi koşmaz
 * (`category-selection.helper.ts`). İstemci `catalog` göndermese bile
 * discovery dışı bir kod talebe/ilana YAZILAMAZ.
 */
export const CATEGORY_CATALOGS = ["full", "discovery"] as const;

export type CategoryCatalog = (typeof CATEGORY_CATALOGS)[number];

/**
 * Gövde/query'den gelen ham değeri güvenli daraltır.
 *
 * Bilinmeyen veya eksik değer → `"full"`. Fail-open BİLİNÇLİ: bu bir yetki
 * kapısı değil, ağaç seçimi. Yanlış tarafa düşmesi hâlinde kullanıcı 13 fazla
 * yaprak görür ve seçerse backend reddeder; ters varsayım (`"discovery"`)
 * firma kategori seçimini sessizce daraltır ve kimse fark etmez.
 */
export function parseCategoryCatalog(value: unknown): CategoryCatalog {
  return value === "discovery" ? "discovery" : "full";
}

/**
 * Prisma `where` parçası: discovery kataloğunda süz, tam katalogda süzme.
 * Tek yerde tutuluyor ki "hangi uçta filtre var" sorusu tek kaynağa baksın.
 */
export function categoryCatalogWhere(
  catalog: CategoryCatalog,
): { inDiscovery: true } | Record<string, never> {
  return catalog === "discovery" ? { inDiscovery: true } : {};
}
