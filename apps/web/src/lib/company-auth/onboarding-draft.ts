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
 *
 * SÜRÜM: taslak sihirbazın ADIM SIRASINI ve alan anlamlarını taşır. Biri
 * değişince sürüm artar; eski `step: 1` yeni sihirbazda başka bir adımdır.
 *  · 1 (sürümsüz kayıt): Şirket → Kişisel + kategori → Özet + beyan.
 *  · 2 (2026-10-08): Şirket (ülke başta) → Faaliyet alanı → Yetkili ve onay;
 *    `companyType` yerel listesi olan ülkede seçim yapılana dek boş,
 *    `legalFormLocal` seçilen yerel yapının adını da taşır.
 *
 * ESKİ TASLAK ATILMAZ, TAŞINIR (`migrateDraft`): dağıtım anında kaydın
 * ortasında olan kurucu yazdıklarını kaybetmesin. 1 → 2'de alan ADLARI aynı
 * kaldı, yalnız adım sırası ve hukuki yapının anlamı değişti: alan değerleri
 * aynen alınır, sihirbaz İLK adımdan açılır (kurucu yeni sırayı baştan görür);
 * hukuki yapıyı sihirbaz her taslakta ülkenin listesiyle uzlaştırır
 * (`sanitizeLegalForm`: listesi olan ülkede eski genel tür seçimsiz açılır,
 * "Diğer"e yazılmış listedeki ad seçili gelir). Taşınamayan sürüm (bu kodun
 * bilmediği, daha yeni bir biçim) okunmaz ve silinir.
 */
export const ONBOARDING_DRAFT_PREFIX = "rothern:onboarding-draft";

/** Sihirbazın adım sırası ya da alan anlamı değişince ARTIRILIR (bkz. dosya başı). */
export const ONBOARDING_DRAFT_VERSION = 2;

export interface OnboardingDraft<F> {
  step: number;
  f: F;
}

const keyFor = (userId: string) => `${ONBOARDING_DRAFT_PREFIX}:${userId}`;

export function saveOnboardingDraft<F>(userId: string, draft: OnboardingDraft<F>): void {
  if (!userId) return;
  try {
    sessionStorage.setItem(
      keyFor(userId),
      JSON.stringify({ v: ONBOARDING_DRAFT_VERSION, step: draft.step, f: draft.f }),
    );
  } catch {
    // depo kapalı — taslak korunmaz, akış çalışır
  }
}

type StoredDraft = OnboardingDraft<Record<string, unknown>>;

/**
 * Saklanan kaydı bugünkü biçime taşır; taşınamıyorsa `null`.
 *  · Bugünkü sürüm: olduğu gibi (adımı sayı değilse ilk adım).
 *  · Sürüm 1 (sürüm alanı YOK ya da 1): alan değerleri aynen, adım 0.
 *  · Başka her şey (daha yeni sürüm, sayı olmayan sürüm): taşınmaz.
 */
function migrateDraft(version: unknown, step: unknown, f: Record<string, unknown>): StoredDraft | null {
  if (version === ONBOARDING_DRAFT_VERSION) return { step: typeof step === "number" ? step : 0, f };
  if (version === undefined || version === 1) return { step: 0, f };
  return null;
}

/**
 * Taslağı okur (silmez). Bozuk kayıt `null` döner. Eski sürümün taslağı
 * bugünkü biçime taşınır ve depoya o biçimde geri yazılır (bkz. dosya başı);
 * taşınamayan sürümün taslağı `null` döner VE silinir (bir daha okunmasın,
 * depoda yer tutmasın).
 */
export function readOnboardingDraft(userId: string): StoredDraft | null {
  if (!userId) return null;
  try {
    const raw = sessionStorage.getItem(keyFor(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as (Partial<StoredDraft> & { v?: unknown }) | null;
    if (!parsed || typeof parsed !== "object" || !parsed.f || typeof parsed.f !== "object") return null;
    const draft = migrateDraft(parsed.v, parsed.step, parsed.f);
    if (!draft) {
      sessionStorage.removeItem(keyFor(userId));
      return null;
    }
    if (parsed.v !== ONBOARDING_DRAFT_VERSION) saveOnboardingDraft(userId, draft);
    return draft;
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
