/**
 * ONBOARDING TASLAĞI — DİL DEĞİŞİMİNDE KORUNUR (arayüz testi webA-09,
 * gözden geçirme).
 *
 * Sihirbazdaki dil seçici hesabın dilini yazar; `LocaleUrlSync` sayfayı
 * `/tr/…` → `/en/…` açar. `[locale]` bölümü değiştiği için sihirbaz yeniden
 * bağlanır ve yerel durumu (unvan, vergi no, adres, kategoriler, adım)
 * sıfırlanıyordu — 2. ya da 3. adımda dil değiştiren kurucu girdiği her şeyi
 * uyarısız kaybediyordu.
 *
 * Taslak YALNIZ dil değişiminden hemen önce yazılır, yeniden bağlanınca bir
 * kez okunup silinir (`takeOnboardingDraft`); tamamlanınca ve çıkışta da
 * silinir (`tenant-storage` öneki). Anahtar kullanıcı kimliğine bağlıdır —
 * aynı sekmede başka hesabın taslağı okunmaz. Depo kapalıysa (gizli sekme)
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

/** Taslağı okur ve siler (tek kullanımlık). Bozuk kayıt `null` döner. */
export function takeOnboardingDraft(userId: string): OnboardingDraft<Record<string, unknown>> | null {
  if (!userId) return null;
  try {
    const raw = sessionStorage.getItem(keyFor(userId));
    if (!raw) return null;
    sessionStorage.removeItem(keyFor(userId));
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
