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

/**
 * FİRMA KATEGORİ BEYANI TAVANLARI — TEK KAYNAK.
 *
 * Neden burada: 2026-09-14'te ölçüldü, ana kategori tavanı ÜÇ AYRI değerdi —
 * onboarding 3 (DTO + arayüz), ayarlar arayüzü 10 (`SegmentOnlyPicker`
 * varsayılanı, prop hiç geçilmemiş), ayarlar DTO'su 50. Sonuç: kayıtta 3'e
 * sıkışan firma ayarlardan 50 segment işaretleyip bildirim havuzunu
 * şişirebiliyordu ve `validateCategorySelection`'ın "1-3" kuralı ayarlar
 * yolunda HİÇ çalışmıyordu. Sayı artık tek yerde; ayrışması için iki dosyanın
 * birlikte değişmesi gerekir.
 *
 * 5, ölçülmüş bir orta yol: 3 dardı (makine imalatçısı = makine + metal +
 * elektrik + hidrolik, zaten 4), 50 ise anlamsız — 58 segmentin 50'sini seçen
 * firma "her şeyi yaparım" demiş olur, her talebin bildirimini alır ve bir
 * süre sonra hepsini görmezden gelir. Sinyal ölür.
 */
export const MAX_COMPANY_MAIN_CATEGORIES = 5;

/**
 * Alt kategori tavanı. Ana kategoriden yüksek olması DOĞRU: alt kategori
 * daraltır, genişletmez — 50 yaprak seçen firma 5 segment seçenden daha DAR
 * bir havuza girer. Sınırsız bırakmak ise segment seçmekle aynı kapıya çıkardı.
 */
export const MAX_COMPANY_SUB_CATEGORIES = 50;
