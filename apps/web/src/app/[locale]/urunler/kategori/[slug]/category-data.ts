import { isHiddenCategory } from "@rothern/shared";
import { isSegmentCode } from "@/lib/public/marketplace";
import { fetchProducts, fetchSegments } from "@/lib/public/marketplace-api";

export interface SegmentLanding {
  id: string;
  /** Okuyucunun dilinde ad (`categories/segments`, i18n Faz 4). */
  name: string;
  /** Dilden bağımsız adres parçası (Türkçe ad) — `categoryHref`. */
  slug?: string;
  /** Segmentteki yayında ürün SAYISI — liste ucunun `total`ı. */
  count: number;
}

/**
 * KATEGORİ (SEGMENT) AÇILIŞ SAYFASININ ÇÖZÜMÜ — sayfa, metası ve OG kartı
 * AYNI fonksiyondan (2026-09-27 SEO denetimi).
 *
 * Eskiden facet ucundan çözülüyordu: facet sırasız ilk 5.000 ürünü tarıyor
 * (`FACET_SCAN_CAP`) → katalog büyüyünce sitemap'te olan segment taramaya
 * girmeyip 404 veriyor, başlıktaki sayı eksik kalıyordu. Artık ad/slug segment
 * listesinden (gizli segmentler zaten yok), sayı ürün liste ucunun `total`ından
 * (şehir/ülke sayfasıyla aynı kural; `ProductIndex`in ilk sayfa isteğiyle aynı
 * adres → veri önbelleği paylaşılır). Ürünü olmayan segment → null (sayfa 404;
 * 27 görünür segmentin boşu için sayfa üretmek ince içerik).
 */
export async function resolveSegmentLanding(code: string): Promise<SegmentLanding | null> {
  if (!isSegmentCode(code) || isHiddenCategory(code)) return null;
  const [segments, page] = await Promise.all([fetchSegments(), fetchProducts({ category: code })]);
  const seg = segments.find((s) => s.id === code);
  if (!seg || page.total === 0) return null;
  return { id: seg.id, name: seg.nameTr, slug: seg.slug, count: page.total };
}
