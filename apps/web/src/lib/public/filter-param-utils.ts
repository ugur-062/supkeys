/**
 * URL süzgeç yardımcıları — ürün, talep ve firma dizinlerinin ORTAK parse
 * ilkelleri (PROMPT 4). Üç şema ayrı dosyada yaşar (alanları farklı), ama
 * "virgüllü liste", "sayı", "tekil/çoklu okuma" tek yerde: ayrışsalardı bir
 * listede `İstanbul, İzmir` çalışıp ötekinde çalışmazdı.
 */
export type SearchParamsLike = Record<string, string | string[] | undefined> | URLSearchParams;

export function getParam(sp: SearchParamsLike, k: string): string | undefined {
  if (sp instanceof URLSearchParams) return sp.get(k) ?? undefined;
  const v = sp[k];
  return Array.isArray(v) ? v[0] : v;
}

export function getAllParams(sp: SearchParamsLike, k: string): string[] {
  if (sp instanceof URLSearchParams) return sp.getAll(k);
  const v = sp[k];
  return v == null ? [] : Array.isArray(v) ? v : [v];
}

/** Negatif olmayan tam sayı; yoksa undefined. */
export function numParam(v?: string): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : undefined;
}

/** Virgüllü liste → dizi (boşlar düşer, tavan 10). */
export function listParam(v?: string): string[] {
  return (v ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 10);
}

/** `sayfa` → 1 tabanlı sayfa (1'den küçük/geçersiz → 1). */
export function pageParam(v?: string): number {
  const n = numParam(v);
  return n && n > 1 ? n : 1;
}
