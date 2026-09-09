import type { Metadata } from "next";

/**
 * `buildMetadata`/varlık üreticilerinin çıktısından parçacık önizlemesi —
 * formdaki "Google'da böyle görünür" kutusu sayfanın GERÇEK şablonunu okur;
 * ayrı bir metin üretmez (ayrı üretseydi önizleme ile sayfa ayrışırdı).
 */
export function snippetFromMetadata(m: Metadata, siteName = "Rothern"): { title: string; description: string; url: string } {
  const raw = typeof m.title === "string" ? m.title : ((m.title as { absolute?: string } | null)?.absolute ?? "");
  const title = raw.includes(siteName) ? raw : `${raw} · ${siteName}`;
  const canonical = m.alternates?.canonical;
  const url = typeof canonical === "string" ? canonical : ((canonical as { url?: string } | null)?.url ?? "");
  return { title, description: m.description ?? "", url };
}
