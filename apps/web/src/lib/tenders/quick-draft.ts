import type { TenderFormData } from "./form-schema";

/**
 * HIZLI TALEP TASLAĞI — sessionStorage (2026-09-09).
 *  · `QUICK_DRAFT_KEY`: kart yazdıkça saklar; sayfa yenilense de kaybolmaz.
 *  · `QUICK_TO_WIZARD_KEY`: "Detaylı ayarlar" ile sihirbaza taşıma — sihirbaz
 *    okur, siler (AI taslağı / ürün tohumuyla AYNI teknik, AYRI anahtar).
 */
export const QUICK_DRAFT_KEY = "quick-request-draft";
export const QUICK_TO_WIZARD_KEY = "quick-request-to-wizard";

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

export type QuickDraft = Pick<TenderFormData, "title" | "description" | "items" | "categoryIds" | "keywords" | "deliveryAddressId" | "visibility" | "invitedSupplierIds" | "bidsCloseAt">;
