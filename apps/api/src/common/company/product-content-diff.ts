/**
 * YAYINDAKİ ÜRÜNDE İÇERİK DEĞİŞTİ Mİ? (moderasyon, 2026-09-19)
 *
 * `updateShowcase` eskiden `JSON.stringify(patch[k]) !== JSON.stringify(before[k])`
 * ile bakıyordu ve ÜÇ yanlış pozitif üretiyordu: (1) niteliksiz üründe patch
 * `Prisma.DbNull` (nesne → "{}") iken kayıt `null`; (2) `description` kayıtta
 * boş dize/`null` ayrışması; (3) nitelik anahtar SIRASI. Sonuç: kullanıcı hiç
 * bir şey değiştirmeden Kaydet'e basınca ürün yeniden incelemeye düşüyordu
 * (kullanıcı bulgusu). Karşılaştırma artık iki tarafı da AYNI kanonik biçime
 * indirger.
 */
export const PRODUCT_CONTENT_FIELDS = [
  "name",
  "description",
  "categoryId",
  "images",
  "keywords",
  "attributes",
] as const;
export type ProductContentField = (typeof PRODUCT_CONTENT_FIELDS)[number];

type Loose = Record<string, unknown>;

/** Prisma `DbNull`/`JsonNull` nesneleri ve `undefined` → `null`. */
function jsonish(v: unknown): unknown {
  if (v == null) return null;
  if (typeof v === "object" && !Array.isArray(v)) {
    const ctor = (v as { constructor?: { name?: string } }).constructor?.name ?? "";
    if (ctor === "DbNull" || ctor === "JsonNull" || ctor === "AnyNull") return null;
  }
  return v;
}

function canon(field: ProductContentField, raw: unknown): string {
  const v = jsonish(raw);
  switch (field) {
    case "name":
    case "description":
    case "categoryId": {
      const s = typeof v === "string" ? v.trim() : "";
      return s || "";
    }
    case "images":
    case "keywords": {
      const arr = Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];
      return JSON.stringify(field === "keywords" ? [...new Set(arr)] : arr);
    }
    case "attributes": {
      if (!v || typeof v !== "object" || Array.isArray(v)) return "{}";
      const entries = Object.entries(v as Loose)
        .filter(([, x]) => x != null && x !== "" && !(Array.isArray(x) && x.length === 0))
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      return JSON.stringify(entries);
    }
  }
}

/**
 * `patch` içinde BULUNAN içerik alanlarından biri kayıttan farklı mı?
 * Patch'te olmayan alan "değişmedi" sayılır (kısmi güncelleme).
 */
export function showcaseContentChanged(before: Loose, patch: Loose): boolean {
  return PRODUCT_CONTENT_FIELDS.some(
    (k) => k in patch && canon(k, patch[k]) !== canon(k, before[k]),
  );
}
