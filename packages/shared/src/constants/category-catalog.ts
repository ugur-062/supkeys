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
export function categoryCatalogWhere(catalog: CategoryCatalog): CategoryCatalogWhere {
  return {
    ...(catalog === "discovery" ? { inDiscovery: true as const } : {}),
    ...hiddenCategoryWhere(),
  };
}

export type CategoryCatalogWhere = { inDiscovery?: true } & HiddenCategoryWhere;

/**
 * GİZLİ SEGMENTLER — KATALOG SADELEŞTİRME (2026-09-19, kullanıcı kararı:
 * "endüstriyel, inşaat, sanayi tarzı şeyler hariç gereksiz kategorileri
 * kaldır"). Ariba kataloğu BİREBİR kalır (satır silinmez, `seed-categories`
 * ve çeviri katmanı dokunulmaz); bu liste yalnız hangi SEGMENTLERİN
 * (L1, ilk iki hane) ürün arayüzünde GÖRÜNMEYECEĞİNİ söyler. Tek kaynak:
 * seçiciler, arama, facet, herkese açık kategori sayfaları, sitemap, AI
 * önerisi ve doğrulama kapıları hepsi buradan okur. Geri almak = listeden
 * çıkarmak.
 *
 * Kalan 29 segment: malzeme (11 12 13 14 15 30 31 32), makine/ekipman
 * (20 21 22 23 24 25 26 27 39 40 41 46 47), endüstriyel hizmet (71 72 73 76
 * 77 78 81) + 95 (yapılar ve altyapı).
 */
export const HIDDEN_SEGMENTS: readonly string[] = [
  "10", // Canlı bitkiler, hayvanlar
  "42", // Tıp
  "43", // Bilgisayar, yazılım, telekom
  "44", // Ofis ekipmanı
  "45", // Baskı, fotoğraf, ses-video
  "48", // Hizmet sektörü ekipmanı
  "49", // Spor
  "50", // Gıda ve içecek
  "51", // İlaç
  "52", // Tüketici elektroniği
  "53", // Giyim, kişisel bakım
  "54", // Takılar
  "55", // Yayınlanmış ürünler
  "56", // Mobilya
  "57", // İnsani yardım
  "60", // Eğitim gereçleri, oyuncak
  "64", // Finansal araçlar
  "70", // Tarım ve balıkçılık hizmetleri
  "80", // Profesyonel ve idari hizmetler
  "82", // Kreatif hizmetler
  "83", // Kamu sektörü hizmetleri
  "84", // Finans ve sigorta hizmetleri
  "85", // Sağlık bakım hizmetleri
  "86", // Eğitim ve öğretim hizmetleri
  "90", // Konaklama
  "91", // Kişisel ve ev içi hizmetler
  "92", // Kamu düzeni hizmetleri
  "93", // Siyasi hizmetler
  "94", // Organizasyonlar ve kulüpler
];

const HIDDEN_SET: ReadonlySet<string> = new Set(HIDDEN_SEGMENTS);

/** Kod (herhangi seviye, 8 hane) gizli bir segmentin altında mı? */
export function isHiddenCategory(code: string | null | undefined): boolean {
  if (!code || code.length < 2) return false;
  return HIDDEN_SET.has(code.slice(0, 2));
}

export type HiddenCategoryWhere = { NOT: { id: { startsWith: string } }[] };

/** Prisma `where` parçası — gizli segmentlerin altındaki kodları dışarıda bırakır. */
export function hiddenCategoryWhere(): HiddenCategoryWhere {
  return { NOT: HIDDEN_SEGMENTS.map((p) => ({ id: { startsWith: p } })) };
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
 * Alt kategori DEPOLAMA tavanı — kullanıcının seçim tavanı DEĞİL.
 *
 * Kullanıcı en fazla `MAX_COMPANY_SUB_PICKS` (50) ürün/hizmet seçer; her seçim
 * ata zinciriyle birlikte saklandığı için depoda seçim başına en fazla üç kayıt
 * (L2+L3+L4) oluşur. Zincir gerekli: eşleştirme ata zincirini TALEBİN kodundan
 * yukarı çıkarıyor, firmanın beyanından aşağı inmiyor — yaprak tek başına
 * saklanırsa alıcı L3'te talep açtığında dar eksen tutmaz.
 *
 * 200 = 50 seçim × 3 seviye + pay. Ana kategoriden yüksek olması DOĞRU: alt
 * kategori daraltır, genişletmez.
 */
export const MAX_COMPANY_SUB_CATEGORIES = 200;
