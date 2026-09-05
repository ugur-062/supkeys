import type { AiSearchIntentResult } from "@rothern/shared";
import { companyActivityLabel } from "@rothern/shared";
import { buildProductFilterQuery, EMPTY_FILTERS } from "@/lib/public/product-filter-params";
import { buildRequestFilterQuery, EMPTY_REQUEST_FILTERS, segmentOf } from "@/lib/company/request-filter-params";

/**
 * AI ARAMA — yorum → URL süzgeci (2026-09-05). Model süzgeç önerir, sayfa
 * onu mevcut liste şemasına yazar; her parça çip olarak görünür ve tek tıkla
 * kaldırılır (çipler URL'den okunur — kaldırılan gerçekten kalkmış olur).
 */
export const AI_TENDER_DRAFT_KEY = "ai-tender-draft";

/** Satınalma: ürün dizini süzgeci. Adet → "min. sipariş en fazla" (MOQ tavanı). */
export function intentToProductQuery(r: AiSearchIntentResult): string {
  return buildProductFilterQuery({
    ...EMPTY_FILTERS,
    q: r.query ?? undefined,
    category: r.category?.id,
    cities: r.city ? [r.city] : [],
    activities: r.activity ? [r.activity] : [],
    verified: r.verifiedOnly,
    priceMax: r.priceMax ?? undefined,
    moqMax: r.quantity != null ? Math.max(1, Math.trunc(r.quantity)) : undefined,
    page: 1,
  });
}

/** Satış: açık talep süzgeci (kategori SEGMENT düzeyinde, şehir = alıcı şehri). */
export function intentToRequestQuery(r: AiSearchIntentResult): string {
  return buildRequestFilterQuery({
    ...EMPTY_REQUEST_FILTERS,
    q: r.query ?? undefined,
    categories: r.category ? [segmentOf(r.category.id)] : [],
    cities: r.city ? [r.city] : [],
    page: 1,
  });
}

export interface IntentChip {
  /** Kaldırılınca URL'den silinecek anahtar. */
  param: string;
  label: string;
}

/** Yorumun parçalarından URL'de HÂLÂ duranlar — çip olarak. */
export function intentChips(r: AiSearchIntentResult, sp: URLSearchParams): IntentChip[] {
  const out: IntentChip[] = [];
  const has = (k: string) => sp.has(k) && sp.get(k) !== "";
  if (r.query && has("q")) out.push({ param: "q", label: `Arama: "${r.query}"` });
  if (r.category && has("kategori")) out.push({ param: "kategori", label: `Kategori: ${r.category.nameTr}` });
  if (r.city && has("sehir")) out.push({ param: "sehir", label: `Şehir: ${r.city}` });
  if (r.portal === "satinalma") {
    if (r.verifiedOnly && has("dogrulanmis")) out.push({ param: "dogrulanmis", label: "Doğrulanmış firma" });
    if (r.activity && has("faaliyet")) out.push({ param: "faaliyet", label: companyActivityLabel(r.activity) });
    if (r.priceMax != null && has("fiyatMax"))
      out.push({ param: "fiyatMax", label: `Birim fiyat ≤ ${r.priceMax.toLocaleString("tr-TR")}${r.currency ? ` ${r.currency}` : ""}` });
    if (r.quantity != null && has("moqMax"))
      out.push({ param: "moqMax", label: `Min. sipariş ≤ ${Math.trunc(r.quantity).toLocaleString("tr-TR")}${r.unit ? ` ${r.unit}` : ""}` });
  }
  return out;
}
