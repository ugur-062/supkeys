/**
 * ADMIN SAYI GİRİŞİ — Türkçe arayüz kuralıyla kesin ayrıştırma (arayüz testi
 * kapanış NUM, 2026-10-03).
 *
 * `type="number"` Türkçe tarayıcıda virgülü YUTUYOR, noktayı ondalık okuyordu:
 * manuel kur "34,5678" → 345678 (tüm TRY çevrimleri bozulurdu), saatlik maliyet
 * "1.500" → 1,5, katsayı "0,5" → 5, üyelik "0,5" ay → 5 ay. Admin paketi
 * `@rothern/shared`e ve web'e bağlı değil; kural web `parseNumberStrict`
 * (`apps/web/src/components/ui/money-input.tsx`) ile AYNI, dil sabit Türkçe:
 *  - virgül ondalık, nokta/boşluk binlik ("1.234,56");
 *  - iki ayraç türü birlikte → sondaki ondalık ("1,234.56" yapıştırma);
 *  - yalnız nokta: düzgün 3'lü grup binlik ("1.500"), değilse ondalık
 *    ("34.5678", "2.5");
 *  - `maxDecimals`tan fazla anlamlı ondalık, düzensiz gruplama, harf → GEÇERSİZ
 *    (kırpılmaz, tahmin edilmez).
 *
 * Dönüş: `null` boş · sayı · `NaN` geçersiz.
 */
export function parseAdminNumber(text: string, maxDecimals = 0): number | null {
  const norm = text.trim();
  if (!norm) return null;
  const cleaned = norm.replace(/[\s'’]/g, "");
  if (!/^[0-9.,]+$/.test(cleaned) || !/\d/.test(cleaned)) return Number.NaN;

  const grouped = (s: string, sep: "." | ",") =>
    new RegExp(`^\\d{1,3}(?:${sep === "." ? "\\." : ","}\\d{3})+$`).test(s) && !/^0[.,]/.test(s);

  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");
  let decimalAt = -1;
  if (lastDot !== -1 && lastComma !== -1) {
    decimalAt = Math.max(lastDot, lastComma);
    if (cleaned.split(cleaned[decimalAt]!).length !== 2) return Number.NaN;
  } else if (lastComma !== -1) {
    // Virgül = Türkçe ondalık; birden çoksa yalnız düzgün binlik kalıbı.
    const count = cleaned.split(",").length - 1;
    if (count === 1) decimalAt = lastComma;
    else if (!grouped(cleaned, ",")) return Number.NaN;
  } else if (lastDot !== -1) {
    const count = cleaned.split(".").length - 1;
    if (!grouped(cleaned, ".")) {
      if (count === 1) decimalAt = lastDot;
      else return Number.NaN;
    }
  }

  const intPart = decimalAt === -1 ? cleaned : cleaned.slice(0, decimalAt);
  const fracPart = decimalAt === -1 ? "" : cleaned.slice(decimalAt + 1);
  if (/[.,]/.test(fracPart)) return Number.NaN;
  if (/[.,]/.test(intPart)) {
    const sep = intPart.includes(".") ? "." : ",";
    if (intPart.includes(sep === "." ? "," : ".") || !grouped(intPart, sep)) return Number.NaN;
  }
  const frac = fracPart.replace(/0+$/, "");
  if (frac.length > maxDecimals) return Number.NaN;
  const int = intPart.replace(/[.,]/g, "") || "0";
  return Number(frac ? `${int}.${frac}` : int);
}

/** Tam sayı alanı: boş/geçersiz/aralık dışı → null; aksi hâlde sayı. */
export function parseAdminInteger(text: string, min: number, max: number): number | null {
  const n = parseAdminNumber(text, 0);
  return n != null && Number.isInteger(n) && n >= min && n <= max ? n : null;
}
