import { categoryPhotoSrc } from "./category-photos";

/**
 * ANASAYFA KATEGORİ SEÇKİSİ — hangi 11 üst kategori, hangi görselle.
 *
 * Kural: ürünü OLAN kategoriler önce (sayıya göre), sonra küratörlü sıra.
 * Sıfır envanterde de ızgara DOLU çıkar — bölüm her zaman görünür, çünkü
 * boş bir pazar yerinde bile katalog gerçek ve gezilebilir. Ürün sayısı
 * yalnız > 0 ise gösterilir; "0 ürün" yazmak envanterin azlığını duyurur.
 *
 * Küratörlü sıra Türkiye B2B'sinin ana damarları: makine, bileşen, elektrik,
 * inşaat, metal, kimya, tesisat, el aletleri, lojistik ekipmanı, yazılım,
 * taşımacılık, gıda. Elle sıra, veri gelince veriye yerini bırakır.
 */
export const SHOWCASE_ORDER = [
  "23000000", // Endüstriyel üretim makineleri
  "31000000", // Üretim bileşenleri
  "39000000", // Elektrik sistemleri ve aydınlatma
  "30000000", // İnşaat malzemeleri
  "11000000", // Metaller, mineraller
  "12000000", // Kimyasal maddeler
  "40000000", // Dağıtım ve koşullama sistemleri
  "27000000", // Aletler ve genel makineler
  "24000000", // Malzeme elleçleme ve depolama
  "43000000", // Bilgisayar, yazılım, telekom
  "78000000", // Taşıma, depolama, posta
  "50000000", // Gıda ve içecek
  "25000000", // Araçlar ve bileşenleri
  "26000000", // Güç üretim ve dağıtımı
  "32000000", // Elektronik bileşenler
  "53000000", // Giyim, çanta, kişisel bakım
] as const;

export interface ShowcaseCategory {
  id: string;
  name: string;
  /** > 0 ise kartta rozet. */
  count: number;
  /** Fotoğraf → ürün kapağı → null (üretilmiş görsel). */
  imageSrc: string | null;
}

export function buildShowcase(input: {
  segments: { id: string; name: string }[];
  counts: { id: string; count: number }[];
  /** Kategori kodu (herhangi seviye) → ürün kapağı; segmenti koddan türetiriz. */
  productCovers: { categoryId: string | null; image: string | undefined }[];
  limit?: number;
}): ShowcaseCategory[] {
  const limit = input.limit ?? 11;
  const nameById = new Map(input.segments.map((s) => [s.id, s.name]));
  const countById = new Map(input.counts.map((c) => [c.id, c.count]));
  const coverBySeg = new Map<string, string>();
  for (const p of input.productCovers) {
    if (!p.categoryId || !p.image || !/^\d{8}$/.test(p.categoryId)) continue;
    const seg = `${p.categoryId.slice(0, 2)}000000`;
    if (!coverBySeg.has(seg)) coverBySeg.set(seg, p.image);
  }
  const withCount = [...countById.entries()]
    .filter(([id, n]) => n > 0 && nameById.has(id))
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
  const ordered: string[] = [];
  for (const id of [...withCount, ...SHOWCASE_ORDER, ...nameById.keys()]) {
    if (!nameById.has(id) || ordered.includes(id)) continue;
    ordered.push(id);
    if (ordered.length >= limit) break;
  }
  return ordered.map((id) => ({
    id,
    name: nameById.get(id) as string,
    count: countById.get(id) ?? 0,
    imageSrc: categoryPhotoSrc(id) ?? coverBySeg.get(id) ?? null,
  }));
}
