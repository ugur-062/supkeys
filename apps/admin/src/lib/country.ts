/**
 * ISO 3166-1 alpha-2 kodundan bayrak emojisi (regional indicator çifti) ve
 * Türkçe ülke adı (Intl.DisplayNames). Ayrı veri dosyası gerekmez.
 */
export function countryFlag(code: string | null | undefined): string {
  const cc = (code ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "🏳️";
  return String.fromCodePoint(
    ...[...cc].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65),
  );
}

let display: Intl.DisplayNames | null | undefined;

export function countryName(code: string | null | undefined): string {
  const cc = (code ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return code ?? "—";
  if (display === undefined) {
    try {
      display = new Intl.DisplayNames(["tr"], { type: "region" });
    } catch {
      display = null;
    }
  }
  return display?.of(cc) ?? cc;
}

/** "🇹🇷 Türkiye" biçimi — tablo hücreleri için. */
export function countryLabel(code: string | null | undefined): string {
  const cc = (code ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "—";
  return `${countryFlag(cc)} ${countryName(cc)}`;
}
