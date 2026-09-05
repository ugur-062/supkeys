import { categoryAncestors, foldSearchText, isCategoryCode, tokenizeQuery } from "@rothern/shared";

/**
 * SATICININ ÜRÜNLERİ ↔ AÇIK TALEP eşleşmesi (2026-09-05, kullanıcı: "ilgili
 * ürünlerine göre talepler ona uygun çıkmalı").
 *
 * İki sinyal, ikisi de deterministik (istatistik katmanı `CompanyAffinity`
 * ayrı — o geçmiş tekliflerden/siparişlerden beslenir):
 *  1. KATEGORİ: ürünün ata zinciri (L2+) ile talebin ata zinciri (L2+)
 *     kesişiyor mu. Segment (L1) sayılmaz — o düzey zaten beyan edilen
 *     kategori eşleşmesinin (`categoryMatch`) işi.
 *  2. METİN: ürün adı + anahtar kelimelerinin katlanmış tokenleri (≥4
 *     karakter, jenerik sözcükler hariç) talebin başlığında ya da kalem
 *     adlarında geçiyor mu ("pano" → "…kompanzasyon panosu…").
 * Sonuç "neden gösterildi" metnine ürün ADIYLA yazılır — kara kutu değil.
 */
export interface SellerProductLite {
  name: string;
  categoryId: string | null;
  keywords: string[];
}

export interface ProductMatchResult {
  matched: boolean;
  /** Eşleşen ürünün adı (kullanıcı yüzü). */
  product: string | null;
  via: "category" | "text" | null;
}

/** Tek başına ayırt etmeyen sözcükler — eşleşme üretmesin. */
const GENERIC = new Set([
  "adet", "urun", "urunu", "urunler", "urunleri", "malzeme", "malzemesi", "malzemeleri",
  "sistem", "sistemi", "sistemleri", "hizmet", "hizmeti", "hizmetleri", "takim", "takimi",
  "seti", "model", "tipi", "yeni", "kalite", "kaliteli", "ozel", "standart", "profesyonel",
  "endustriyel", "sanayi", "toptan", "fiyat", "satis", "alim", "alimi", "tedarik", "tedarigi",
  "proje", "projesi", "genel", "cesitli", "muhtelif", "parca", "parcasi", "parcalari",
]);

export function buildProductMatcher(products: SellerProductLite[]) {
  const byCategory = new Map<string, string>();
  const tokens: { token: string; product: string }[] = [];
  for (const p of products) {
    if (p.categoryId && isCategoryCode(p.categoryId)) {
      for (const a of categoryAncestors(p.categoryId)) {
        if (a.endsWith("000000") || byCategory.has(a)) continue;
        byCategory.set(a, p.name);
      }
    }
    const seen = new Set<string>();
    for (const t of tokenizeQuery([p.name, ...(p.keywords ?? [])].join(" "))) {
      const f = foldSearchText(t);
      if (f.length < 4 || GENERIC.has(f) || seen.has(f)) continue;
      seen.add(f);
      tokens.push({ token: f, product: p.name });
    }
  }
  const empty: ProductMatchResult = { matched: false, product: null, via: null };
  return {
    size: products.length,
    match(requestCodes: string[], haystackRaw: string): ProductMatchResult {
      if (byCategory.size > 0) {
        for (const c of requestCodes) {
          if (!isCategoryCode(c)) continue;
          for (const a of categoryAncestors(c)) {
            if (a.endsWith("000000")) continue;
            const hit = byCategory.get(a);
            if (hit) return { matched: true, product: hit, via: "category" };
          }
        }
      }
      if (tokens.length > 0 && haystackRaw) {
        const hay = foldSearchText(haystackRaw);
        for (const t of tokens) {
          if (hay.includes(t.token)) return { matched: true, product: t.product, via: "text" };
        }
      }
      return empty;
    },
  };
}

/** "Neden gösterildi" — ürün eşleşmesi metni (ilgi motoru metninin önüne geçer). */
export function productMatchReason(r: ProductMatchResult): string | null {
  if (!r.matched || !r.product) return null;
  return r.via === "category"
    ? `Ürününüz bu kategoride: ${r.product}`
    : `Ürününüzle eşleşiyor: ${r.product}`;
}
