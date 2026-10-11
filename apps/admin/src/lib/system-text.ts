/** Sistemin yazdığı gerekçe/ödeme metinleri — DB'de KOD saklanır (`[[KOD]] metin`,
 *  2026-09-27 çok dillilik), admin Türkçe çizer. Kaynak `@rothern/shared`
 *  `helpers/system-text.ts`; admin @rothern/shared'a bağlı olmadığından yerel
 *  kopya (payment-plan-label.ts deseni). Eski Türkçe kayıtlar zaten Türkçe
 *  cümle taşıdığı için olduğu gibi döner. */

const CODE_TEXT: Record<string, (text: string) => string> = {
  ORDER_REJECTED: (t) => (t ? `Sipariş satıcı tarafından reddedildi: ${t}` : "Sipariş satıcı tarafından reddedildi"),
  CANCEL_REQUEST_APPROVED: () => "Satıcı iptal talebi onaylandı",
  ADMIN: (t) => (t ? `[Yönetici] ${t}` : "[Yönetici]"),
  LC_PAID_VIA_BANK: () => "Akreditif ödemesi banka kanalından alındı",
};

export function systemTextTr(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = /^\[\[([A-Z_]+)\]\]\s?([\s\S]*)$/.exec(raw);
  const render = m ? CODE_TEXT[m[1]!] : undefined;
  return render ? render(m![2]!.trim()) : raw;
}

/** Ödeme yöntemi: akreditif kodu (yeni) → "Akreditif"; diğerleri serbest metin. */
export function paymentMethodTr(raw: string | null | undefined): string | null {
  if (raw === "LETTER_OF_CREDIT") return "Akreditif";
  return raw ?? null;
}
