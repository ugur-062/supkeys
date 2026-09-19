/**
 * Vitrin PATCH'i KISMİ olabilir — gönderilmeyen alan mevcut değeriyle kalır.
 *
 * 2026-09-19 incelemesinde bulundu: `normalizeShowcase` gövdeyi TAM vitrin
 * sayıyordu (`images ?? []`, `keywords ?? []`, `priceMode ?? "ON_REQUEST"`,
 * belge/video → null). Yalnız `description` gönderen bir istek ürünün
 * görsellerini, anahtar kelimelerini, niteliklerini ve fiyatını SİLİYORDU;
 * ürün sonra "En az 1 görsel eklenmeli" diye yeniden yayınlanamıyordu.
 * Web formu her alanı gönderdiği için ekranda görünmüyordu; API sözleşmesi
 * (PATCH) ve ileride asistan/AI yolları için kural burada tek yerde.
 *
 * Kural: `undefined` = "dokunma"; `null`/boş dizi = bilinçli silme.
 */
export interface ShowcasePatchInput {
  name?: string;
  description?: string;
  unit?: string;
  unitCode?: string | null;
  categoryId?: string | null;
  images?: string[];
  videoUrl?: string | null;
  externalUrl?: string | null;
  documents?: { url: string; title: string }[] | null;
  keywords?: string[];
  attributes?: Record<string, unknown>;
  priceMode?: "FIXED" | "TIERED" | "ON_REQUEST";
  priceAmount?: number | null;
  priceTiers?: { minQty: number; unitPrice: number }[] | null;
  priceCurrency?: string;
  moq?: number | null;
}

export interface ShowcaseBeforeRow {
  images: string[];
  keywords: string[];
  attributes: unknown;
  videoUrl: string | null;
  externalUrl: string | null;
  documents: unknown;
  priceMode: string;
  priceAmount: { toString(): string } | number | null;
  priceTiers: unknown;
  priceCurrency: string | null;
  moq: { toString(): string } | number | null;
}

const num = (v: { toString(): string } | number | null): number | null =>
  v == null ? null : typeof v === "number" ? v : Number(v.toString());

export function mergeShowcaseInput(
  before: ShowcaseBeforeRow,
  input: ShowcasePatchInput,
): ShowcasePatchInput {
  return {
    ...input,
    images: input.images ?? before.images,
    keywords: input.keywords ?? before.keywords,
    attributes:
      input.attributes ??
      ((before.attributes as Record<string, unknown> | null) ?? undefined),
    videoUrl: input.videoUrl === undefined ? before.videoUrl : input.videoUrl,
    externalUrl: input.externalUrl === undefined ? before.externalUrl : input.externalUrl,
    documents:
      input.documents === undefined
        ? ((before.documents as { url: string; title: string }[] | null) ?? null)
        : input.documents,
    priceMode: input.priceMode ?? (before.priceMode as ShowcasePatchInput["priceMode"]),
    priceAmount: input.priceAmount === undefined ? num(before.priceAmount) : input.priceAmount,
    priceTiers:
      input.priceTiers === undefined
        ? ((before.priceTiers as { minQty: number; unitPrice: number }[] | null) ?? null)
        : input.priceTiers,
    priceCurrency: input.priceCurrency ?? before.priceCurrency ?? undefined,
    moq: input.moq === undefined ? num(before.moq) : input.moq,
  };
}
