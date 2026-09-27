import { isLocale, recipientLocale, type Locale } from "@rothern/i18n";
import type { ExternalInviteTarget } from "@/hooks/use-supplier-discovery";
import type { TenderFormData } from "./form-schema";

/**
 * HIZLI TALEP TASLAĞI — sessionStorage (2026-09-09).
 *  · `QUICK_DRAFT_KEY`: kart yazdıkça saklar; sayfa yenilense de kaybolmaz.
 *    okur, siler (AI taslağı / ürün tohumuyla AYNI teknik, AYRI anahtar).
 */
export const QUICK_DRAFT_KEY = "quick-request-draft";

export function readSession<T>(key: string, consume = false): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    if (consume) sessionStorage.removeItem(key);
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeSession(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* kota/gizli mod — taslak saklanamaz, akış sürer */
  }
}

export function clearSession(key: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* yok say */
  }
}

export type QuickDraft = Pick<TenderFormData, "title" | "description" | "items" | "categoryIds" | "keywords" | "deliveryAddressId" | "visibility" | "invitedSupplierIds" | "bidsCloseAt"> & {
  /** AI keşfinden eklenen, yayında talebe özel davet gidecek alıcılar (adres + dil + ülke; 2026-09-27). */
  externalInvites?: ExternalInviteTarget[];
};

/**
 * Saklanmış bekleyen davetleri okur. Eski taslaklar düz adres dizisi
 * (`string[]`) taşıyordu — onlar kaybolmaz, dil `recipientLocale` ile
 * (e-posta uzantısı → arayüz dili) türetilir. Bozuk girdi atlanır.
 */
export function normalizeExternalInvites(raw: unknown, fallback: Locale): ExternalInviteTarget[] {
  if (!Array.isArray(raw)) return [];
  const out: ExternalInviteTarget[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const obj = typeof entry === "string" ? { email: entry } : entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null;
    const email = typeof obj?.email === "string" ? obj.email.trim().toLowerCase() : "";
    if (!email || seen.has(email)) continue;
    seen.add(email);
    const country = typeof obj?.country === "string" && /^[A-Z]{2}$/.test(obj.country) ? obj.country : null;
    const locale = isLocale(obj?.locale) ? obj.locale : recipientLocale({ country, email, fallback });
    out.push({ email, locale, ...(country ? { country } : {}) });
  }
  return out;
}

/**
 * Taslak olarak kaydedilen talebin BEKLEYEN dış davet adresleri — taslak
 * kaydı `QUICK_DRAFT_KEY`i siler ve talep sayfasına gider; düzenleme kartı
 * (`mode="edit"`) açılınca buradan okur, yayında gönderir.
 */
export function pendingInvitesKey(listingId: string): string {
  return `quick-request-external-invites:${listingId}`;
}

/** Yayında tek istekte gönderilebilecek dış davet sayısı (API `ExternalTenderInviteDto` üst sınırı). */
export const MAX_PENDING_EXTERNAL_INVITES = 60;
