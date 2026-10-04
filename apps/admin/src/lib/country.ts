/**
 * Türkçe ülke adı (Intl.DisplayNames) ve kısa kod. Bayrak GÖRSELİ
 * `components/country-flag.tsx` (flag-icons SVG, 2026-10-04): emoji bayrağı
 * Windows çizmiyor, iki harf basıyordu ("TR"). Native `<option>` gibi yalnız
 * metin alan yerlerde bayrak basılmaz, yalnız ad.
 *
 * Kullanıcıya ayrılmış kod: `XN` KKTC — ISO'da YOK, Intl tanımaz (adı "XN")
 * → ad elle; bayrağı yok, bileşen "KKTC" metnine düşer.
 */
const EXTRA_NAMES: Record<string, string> = {
  XN: "Kuzey Kıbrıs Türk Cumhuriyeti (KKTC)",
};

let display: Intl.DisplayNames | null | undefined;

export function countryName(code: string | null | undefined): string {
  const cc = (code ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return code ?? "—";
  if (EXTRA_NAMES[cc]) return EXTRA_NAMES[cc];
  if (display === undefined) {
    try {
      display = new Intl.DisplayNames(["tr"], { type: "region" });
    } catch {
      display = null;
    }
  }
  return display?.of(cc) ?? cc;
}

/** Metin bağlamı için ülke adı; geçersiz kodda "—". Bayrak `<CountryFlag decorative/>` ile önüne konur. */
export function countryLabel(code: string | null | undefined): string {
  const cc = (code ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "—";
  return countryName(cc);
}

/** Dar tablo hücresi için kısa kod: ISO kodu, KKTC için "KKTC" ("XN" okunmaz). */
export function countryShort(code: string | null | undefined): string {
  const cc = (code ?? "").trim().toUpperCase();
  if (!cc) return "—";
  return cc === "XN" ? "KKTC" : cc;
}
