import {
  CHEQUE_PAYMENT_METHOD,
  LEGACY_LC_PAYMENT_METHOD,
  LEGACY_SYSTEM_TEXT_EXACT,
  LEGACY_SYSTEM_TEXT_PREFIXES,
} from "../data/legacy-system-texts";

export { CHEQUE_PAYMENT_METHOD };

/**
 * SİSTEMİN YAZDIĞI metinler (2026-09-27, çok dillilik): sipariş/teklif
 * kayıtlarına kullanıcının değil PLATFORMUN koyduğu gerekçe ve ödeme yöntemi
 * eskiden Türkçe cümle olarak saklanıyordu ("Sipariş satıcı tarafından
 * reddedildi: …", "Akreditif") ve her dilde Türkçe görünüyordu. Artık DB'de
 * KOD saklanır; metni çizim yeri okuyucunun dilinde üretir
 * (web `useSystemText`/`usePaymentMethodLabel`, admin `lib/system-text.ts`).
 *
 * Biçim: `[[KOD]]` ya da `[[KOD]] <kullanıcının serbest metni>`. Eski
 * kayıtlar Türkçe cümleyi taşır → `parseSystemText` onları da tanır
 * (`data/legacy-system-texts.ts`; geriye uyum, veri dönüşümü gerekmez).
 */
export const SYSTEM_TEXT_CODES = [
  /** Satıcı siparişi reddetti → kazanan teklif LOST (eleme gerekçesi). */
  "ORDER_REJECTED",
  /** Alıcı satıcının iptal talebini onayladı, talepte gerekçe yoktu. */
  "CANCEL_REQUEST_APPROVED",
  /** Yönetici iptali (sipariş) — ardından yöneticinin gerekçesi. */
  "ADMIN",
  /** Akreditif ödemesi banka kanalından alındı (ödeme notu). */
  "LC_PAID_VIA_BANK",
] as const;
export type SystemTextCode = (typeof SYSTEM_TEXT_CODES)[number];

/** Akreditifte sistemin ürettiği ödeme kaydının yöntemi (eskiden Türkçe ad). */
export const LC_PAYMENT_METHOD = "LETTER_OF_CREDIT";

/** Kodlu metin üretir: `[[KOD]]` ya da `[[KOD]] metin`. */
export function encodeSystemText(code: SystemTextCode, text?: string | null): string {
  const rest = text?.trim();
  return rest ? `[[${code}]] ${rest}` : `[[${code}]]`;
}

/**
 * Saklanan metni çözer: kodluysa `{ code, text }` (text = kullanıcının serbest
 * metni, yoksa ""), değilse `{ code: null, text: ham }`.
 */
export function parseSystemText(raw: string | null | undefined): { code: SystemTextCode | null; text: string } {
  const value = raw ?? "";
  const m = /^\[\[([A-Z_]+)\]\]\s?([\s\S]*)$/.exec(value);
  if (m && (SYSTEM_TEXT_CODES as readonly string[]).includes(m[1]!)) {
    return { code: m[1] as SystemTextCode, text: m[2]!.trim() };
  }
  // Own-key lookup only: a plain object literal would return prototype members
  // for free text like "constructor" / "toString" (derin denetim LU-10).
  const key = value.trim();
  if (Object.hasOwn(LEGACY_SYSTEM_TEXT_EXACT, key)) return { code: LEGACY_SYSTEM_TEXT_EXACT[key]!, text: "" };
  for (const [prefix, code] of LEGACY_SYSTEM_TEXT_PREFIXES) {
    if (value.startsWith(prefix)) return { code, text: value.slice(prefix.length).trim() };
  }
  return { code: null, text: value };
}

/** Ödeme yöntemi kodu: akreditif (yeni kod ya da eski Türkçe ad) · çek · serbest metin → null. */
export function paymentMethodCode(raw: string | null | undefined): "LETTER_OF_CREDIT" | "CHEQUE" | null {
  const v = raw?.trim();
  if (v === LC_PAYMENT_METHOD || v === LEGACY_LC_PAYMENT_METHOD) return "LETTER_OF_CREDIT";
  if (v === CHEQUE_PAYMENT_METHOD) return "CHEQUE";
  return null;
}
