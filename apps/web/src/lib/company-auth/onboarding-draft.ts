/**
 * ONBOARDING TASLAĞI — YENİLEMEDE VE DİL DEĞİŞİMİNDE KORUNUR (arayüz testi
 * webA-09; kayıt denetimi 2026-10 signup-tr-2 / code-auth-14).
 *
 * Sihirbaz ~20 alan + kategori seçimi içerir. Sayfa yenilenince (F5) ya da dil
 * seçici `[locale]` bölümünü değiştirip sihirbazı yeniden bağlayınca yerel
 * durum (unvan, vergi no, adres, kategoriler, adım) sıfırlanıyor, kurucu
 * girdiği her şeyi uyarısız kaybediyordu.
 *
 * Taslak SÜREKLİ yazılır (sihirbaz her değişiklikten kısa süre sonra, dil
 * değişiminden hemen önce de anında) ve açılışta okunur; okumak SİLMEZ —
 * ikinci yenileme de aynı taslağı bulur. Silindiği yerler: onboarding
 * tamamlanınca (`clearOnboardingDraft`) ve çıkışta (`tenant-storage` öneki).
 * Anahtar kullanıcı kimliğine bağlıdır — aynı sekmede başka hesabın taslağı
 * okunmaz. Depo `sessionStorage`: taslak sekmeyle birlikte biter (vergi no ve
 * kimlik no taşır, kalıcı depoya yazılmaz). Depo kapalıysa (gizli sekme)
 * sessizce yok sayılır.
 */
export const ONBOARDING_DRAFT_PREFIX = "rothern:onboarding-draft";

export interface OnboardingDraft<F> {
  step: number;
  f: F;
}

const keyFor = (userId: string) => `${ONBOARDING_DRAFT_PREFIX}:${userId}`;

export function saveOnboardingDraft<F>(userId: string, draft: OnboardingDraft<F>): void {
  if (!userId) return;
  try {
    sessionStorage.setItem(keyFor(userId), JSON.stringify(draft));
  } catch {
    // depo kapalı — taslak korunmaz, akış çalışır
  }
}

/** Taslağı okur (silmez). Bozuk kayıt `null` döner. */
export function readOnboardingDraft(userId: string): OnboardingDraft<Record<string, unknown>> | null {
  if (!userId) return null;
  try {
    const raw = sessionStorage.getItem(keyFor(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OnboardingDraft<Record<string, unknown>>>;
    if (!parsed || typeof parsed !== "object" || !parsed.f || typeof parsed.f !== "object") return null;
    return { step: typeof parsed.step === "number" ? parsed.step : 0, f: parsed.f };
  } catch {
    return null;
  }
}

export function clearOnboardingDraft(userId: string): void {
  if (!userId) return;
  try {
    sessionStorage.removeItem(keyFor(userId));
  } catch {
    // yok say
  }
}
