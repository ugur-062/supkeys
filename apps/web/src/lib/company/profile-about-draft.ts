/**
 * PROFİLİM "HAKKINDA" TASLAĞI — SAYFADAN ÇIKINCA KAYBOLMAZ (canlı doğrulama
 * 2026-10-09, PD-01).
 *
 * "Tanıtımı AI ile yaz" kutuya KAYDEDİLMEMİŞ bir taslak yazar; sunucu taslağın
 * kopyasını tutmaz. Kaydedilmemiş değişiklik koruması (`useUnsavedChangesGuard`)
 * bağlantı tıklamasını, yenilemeyi ve sekme kapatmayı sorar; tarayıcının Geri
 * düğmesini, dil değişimini ve bildirim tıklamasını (programla gezinme) SORMAZ.
 * O üç çıkışta taslak siliniyor, harcanan deneme (günde 3; doğrulanmamış firmada
 * ömür boyu 6 öneriden biri) geri gelmiyordu.
 *
 * Çözüm sormak değil SAKLAMAK: kutudaki kaydedilmemiş metin — AI yazmış ya da
 * elle yazılmış olsun — sürekli buraya yazılır ve Profilim yeniden açıldığında
 * geri yüklenir (kaydet çubuğu açık, "taslak geri yüklendi" notuyla). Onboarding
 * taslağıyla aynı kalıp (`lib/company-auth/onboarding-draft.ts`):
 *  · depo `sessionStorage` — taslak sekmeyle birlikte biter;
 *  · anahtar kullanıcı kimliğine bağlı — aynı sekmede başka hesabın taslağı
 *    okunmaz; önek `TENANT_SESSION_PREFIXES`te, çıkışta silinir;
 *  · okumak SİLMEZ (ikinci yenileme de aynı taslağı bulur); silindiği yerler
 *    Kaydet, Vazgeç ve metnin kayıtlı hâline dönmesi;
 *  · depo kapalıysa (gizli sekme) sessizce yok sayılır — taslak korunmaz, akış çalışır.
 *
 * Yalnız "Hakkında" metni saklanır; sektör, hizmetler ve diğer alanlar değil.
 */
export const PROFILE_ABOUT_DRAFT_PREFIX = "rothern:profile-about-draft";

/** Saklanan biçim değişince ARTIRILIR; tanınmayan sürümün kaydı okunmaz ve silinir. */
export const PROFILE_ABOUT_DRAFT_VERSION = 1;

/** Son AI önerisinin kutunun altındaki notu için gerekenler. */
export interface ProfileAboutAiResult {
  /** İsteme giren vitrin ürünü sayısı; 0 ise "ürün ekledikçe zenginleşir" notu. */
  productCount: number;
  /** Tam erişimi olmayan firmada kalan öneri hakkı; tam erişimde null. */
  remaining: number | null;
  /** Taslağın yerine yazıldığı metin ("Önceki metne dön"); yoksa / geri alındıysa null. */
  previous: string | null;
}

export interface ProfileAboutDraft {
  /** Kutudaki kaydedilmemiş metin (boş olabilir: kullanıcı kutuyu temizlemiştir). */
  text: string;
  /** Taslak AI önerisiyse sonuç notu; elle yazılmış taslakta null. */
  result: ProfileAboutAiResult | null;
}

const keyFor = (userId: string) => `${PROFILE_ABOUT_DRAFT_PREFIX}:${userId}`;

export function saveProfileAboutDraft(userId: string, companyId: string, draft: ProfileAboutDraft): void {
  if (!userId || !companyId) return;
  try {
    sessionStorage.setItem(
      keyFor(userId),
      JSON.stringify({ v: PROFILE_ABOUT_DRAFT_VERSION, companyId, text: draft.text, result: draft.result }),
    );
  } catch {
    // depo kapalı / dolu — taslak korunmaz, akış çalışır
  }
}

function parseResult(raw: unknown): ProfileAboutAiResult | null | undefined {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object") return undefined;
  const { productCount, remaining, previous } = raw as Record<string, unknown>;
  if (typeof productCount !== "number" || !Number.isFinite(productCount)) return undefined;
  if (remaining !== null && (typeof remaining !== "number" || !Number.isFinite(remaining))) return undefined;
  if (previous !== null && typeof previous !== "string") return undefined;
  return { productCount, remaining, previous };
}

/**
 * Taslağı okur (silmez). Kayıt yoksa `null`. Bozuk kayıt, tanınmayan sürüm ve
 * BAŞKA firmaya ait kayıt `null` döner VE silinir (bir daha okunmasın).
 */
export function readProfileAboutDraft(userId: string, companyId: string): ProfileAboutDraft | null {
  if (!userId || !companyId) return null;
  try {
    const raw = sessionStorage.getItem(keyFor(userId));
    if (!raw) return null;
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    const p = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    const result = p ? parseResult(p.result) : undefined;
    if (
      !p ||
      p.v !== PROFILE_ABOUT_DRAFT_VERSION ||
      p.companyId !== companyId ||
      typeof p.text !== "string" ||
      result === undefined
    ) {
      sessionStorage.removeItem(keyFor(userId));
      return null;
    }
    return { text: p.text, result };
  } catch {
    return null;
  }
}

export function clearProfileAboutDraft(userId: string): void {
  if (!userId) return;
  try {
    sessionStorage.removeItem(keyFor(userId));
  } catch {
    // yok say
  }
}
