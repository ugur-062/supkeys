/**
 * ISO 3166-1 alpha-2 kodundan bayrak emojisi (regional indicator çifti) ve
 * Türkçe ülke adı (Intl.DisplayNames). Ayrı veri dosyası gerekmez.
 *
 * Kullanıcıya ayrılmış iki kod (2026-09-27, kayıt tüm ülkelere açıldı):
 * `XN` KKTC — ISO'da YOK, Intl tanımaz (adı "XN", bayrağı harf kutusu
 * basıyordu) → ad elle; `XK` Kosova — Intl adı bilir ama bayrak çifti her
 * sistemde çizilmez. İkisinde de bayrak çizilmez (web `codeToFlag` ile aynı).
 */
const NO_FLAG = new Set(["XN", "XK"]);
const EXTRA_NAMES: Record<string, string> = {
  XN: "Kuzey Kıbrıs Türk Cumhuriyeti (KKTC)",
};

export function countryFlag(code: string | null | undefined): string {
  const cc = (code ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc) || NO_FLAG.has(cc)) return "🏳️";
  return String.fromCodePoint(
    ...[...cc].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65),
  );
}

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

/** "🇹🇷 Türkiye" biçimi — tablo hücreleri için. */
export function countryLabel(code: string | null | undefined): string {
  const cc = (code ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "—";
  return `${countryFlag(cc)} ${countryName(cc)}`;
}

/** Dar tablo hücresi için kısa kod: ISO kodu, KKTC için "KKTC" ("XN" okunmaz). */
export function countryShort(code: string | null | undefined): string {
  const cc = (code ?? "").trim().toUpperCase();
  if (!cc) return "—";
  return cc === "XN" ? "KKTC" : cc;
}
