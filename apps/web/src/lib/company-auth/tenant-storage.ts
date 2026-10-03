/**
 * TARAYICIDA KALAN FİRMA VERİSİ (yayın denetimi 2026-09-28 Bölüm 5).
 *
 * Hızlı talep taslağı (başlık, kalemler, AI'ın bulduğu tedarikçi adresleri,
 * davet edilecek üyeler), ürün tohumu, AI taslağı ve davet ön doldurma bilgisi
 * `sessionStorage`da; paneldeki son aramalar `localStorage`da tutulur. Çıkış
 * bunları silmiyordu → ortak bilgisayarda aynı sekmede giriş yapan BAŞKA
 * firmanın kullanıcısı "Yeni talep"i açınca öncekinin yayınlanmamış talebini ve
 * tedarikçi listesini dolu buluyordu.
 *
 * Kural: açık çıkışta hepsi silinir; oturum düşüp (401) aynı sekmede FARKLI bir
 * kullanıcı girerse `bindSessionOwner` silinmesini sağlar. Aynı kullanıcı geri
 * girerse taslağı korunur.
 */
const TENANT_SESSION_PREFIXES = [
  "quick-request", // QUICK_DRAFT_KEY + talep başına bekleyen davet anahtarları
  "tender-product-seed",
  "ai-tender-draft",
  "ai-search-intent",
  "rothern:invite-prefill",
  // Hızlı talep AI tedarikçi keşfi sonuçları (dış adresler + eşleşen üyeler)
  // ve `:auto` bayrağı — form-supplier-panel.tsx RESULTS_KEY / AUTO_KEY.
  "rothern:quick-ai-suppliers",
  // Dil değişiminde korunan onboarding taslağı (onboarding-draft.ts).
  "rothern:onboarding-draft",
];
const TENANT_LOCAL_KEYS = ["rothern.panel.recent-searches"];
const OWNER_KEY = "rothern.session-owner";

export function clearTenantSessionData(): void {
  if (typeof window === "undefined") return;
  try {
    const ss = window.sessionStorage;
    const keys = Array.from({ length: ss.length }, (_, i) => ss.key(i)).filter((k): k is string => !!k);
    for (const k of keys) if (TENANT_SESSION_PREFIXES.some((p) => k.startsWith(p))) ss.removeItem(k);
    ss.removeItem(OWNER_KEY);
  } catch {
    /* depolama kapalı — silinecek bir şey de yok */
  }
  try {
    for (const k of TENANT_LOCAL_KEYS) window.localStorage.removeItem(k);
  } catch {
    /* yok say */
  }
}

/** Oturumun sahibini işaretler; önceki sahip farklıysa önce firma verisini siler. */
export function bindSessionOwner(userId: string): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    const prev = window.sessionStorage.getItem(OWNER_KEY);
    if (prev && prev !== userId) clearTenantSessionData();
    window.sessionStorage.setItem(OWNER_KEY, userId);
  } catch {
    /* yok say */
  }
}
