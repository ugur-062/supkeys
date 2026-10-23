import { getUnit } from "@rothern/shared";
import type { Locale } from "@rothern/i18n";
import { tApi } from "./i18n.service";

/**
 * Ölçü birimi etiketi — okuyucunun dilinde (2026-09-27). Katalog
 * `api.units.<KOD>` (web `web.domain.unit` ile aynı değerler); paylaşılan
 * `UNITS.nameTr` yalnız Türkçe kaynak ve depolama adıdır. Bilinmeyen kod
 * (serbest metin birim) verilen yedek metne düşer.
 */
export function unitDisplayName(
  code: string | null | undefined,
  fallback?: string | null,
  locale?: Locale,
): string {
  const u = getUnit(code);
  if (!u) return fallback?.trim() || "";
  return tApi(`api.units.${u.code}` as never, undefined, locale);
}

/**
 * Miktar + birim DİLİN ÇOĞUL KURALIYLA (`api.qty.<KOD>`): "10 pieces",
 * "10 коробок", "10 adet". Tekil etiketi sayının yanına yapıştırmak EN/RU'da
 * "10 piece" basıyordu. Kodsuz serbest birimde sayı + metin (`api.qty.other`).
 */
export function quantityDisplay(
  qty: number | string,
  code: string | null | undefined,
  fallback?: string | null,
  locale?: Locale,
): string {
  const n = Number(qty);
  const u = getUnit(code);
  if (!Number.isFinite(n)) return [String(qty), unitDisplayName(code, fallback, locale)].filter(Boolean).join(" ");
  if (u) return tApi(`api.qty.${u.code}` as never, { n } as never, locale);
  return tApi("api.qty.other" as never, { n, unit: fallback?.trim() ?? "" } as never, locale);
}

