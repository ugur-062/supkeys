/**
 * KAYIT TASLAĞI — DİL DEĞİŞİMİ VE YENİLEMEDE KORUNUR (arayüz testi 2026-10
 * code-auth-5/10, signup-enru-1, signup-tr-15).
 *
 * Kayıt formu ve kod adımı yalnız bileşen durumundaydı:
 *  · Dil seçici sayfayı yeni `[locale]` ön ekiyle yeniden bağlar → yazılan her
 *    şey ve onay kutuları siliniyordu (onboarding aynı sorunu
 *    `onboarding-draft.ts` ile çözmüştü).
 *  · Kod adımında yenileme (telefonda posta uygulamasına geçip dönünce
 *    tarayıcı bunu kendiliğinden yapar) boş forma döndürüyor, aynı bilgilerle
 *    yeniden kayıt 409 veriyor, tek yol giriş sayfası kalıyordu.
 *
 * Saklananlar: ad, soyad, e-posta, onay kutuları ve kod adımı açıksa kodun
 * gittiği adres. ŞİFRELER ASLA YAZILMAZ — tip de taşımaz; geri yüklenen kod
 * adımında "e-posta adresini değiştir" formu şifreyi yeniden sorar. Telefon
 * 2026-10-08'de formdan kalktı: eski sürümün yazdığı taslaktaki `phone` alanı
 * okunmaz ve geri yazılmaz.
 *
 * Oturum deposunda (sekmeye özel, sekme kapanınca silinir). Öneki
 * `tenant-storage.ts` `TENANT_SESSION_PREFIXES`te: çıkışta ve aynı sekmede
 * başka hesap girince silinir. Hesap doğrulanınca ya da giriş yapılınca da
 * silinir (`use-company-auth.ts`). Depo kapalıysa (gizli sekme) sessizce yok
 * sayılır.
 */
export const SIGNUP_DRAFT_KEY = "rothern:signup-draft";

export interface SignupDraftConsents {
  terms: boolean;
  mediation: boolean;
  kvkk: boolean;
  marketing: boolean;
  profile: boolean;
}

export interface SignupDraft {
  firstName: string;
  lastName: string;
  email: string;
  consents: SignupDraftConsents;
  /** Kod adımı açıksa kodun gönderildiği adres; form adımında `null`. */
  verifyEmail: string | null;
  /**
   * Taslak yazılırken adresteki `?email=` değeri (yoksa ""). Geri yüklerken
   * bugünkü `?email=` bundan FARKLIYSA kullanıcı yeni bir bağlantıyla
   * gelmiştir (misafir bilgi talebi adresi) → bağlantıdaki adres kazanır;
   * aynıysa (dil değişimi, yenileme) kullanıcının yazdığı adres korunur.
   */
  emailSeed: string;
}

const CONSENT_KEYS = ["terms", "mediation", "kvkk", "marketing", "profile"] as const;

function isEmpty(d: SignupDraft): boolean {
  return (
    !d.verifyEmail &&
    !d.firstName &&
    !d.lastName &&
    !d.email &&
    CONSENT_KEYS.every((k) => !d.consents[k])
  );
}

export function saveSignupDraft(draft: SignupDraft): void {
  try {
    if (isEmpty(draft)) {
      sessionStorage.removeItem(SIGNUP_DRAFT_KEY);
      return;
    }
    // Alanlar TEK TEK kopyalanır: çağıran yanlışlıkla form nesnesinin tamamını
    // (şifre alanlarıyla) verse bile depoya şifre gitmez.
    const safe: SignupDraft = {
      firstName: draft.firstName,
      lastName: draft.lastName,
      email: draft.email,
      consents: {
        terms: draft.consents.terms,
        mediation: draft.consents.mediation,
        kvkk: draft.consents.kvkk,
        marketing: draft.consents.marketing,
        profile: draft.consents.profile,
      },
      verifyEmail: draft.verifyEmail,
      emailSeed: draft.emailSeed,
    };
    sessionStorage.setItem(SIGNUP_DRAFT_KEY, JSON.stringify(safe));
  } catch {
    // depo kapalı — taslak korunmaz, akış çalışır
  }
}

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");

/** Taslağı okur (silmez). Bozuk ya da tanınmayan kayıt `null` döner. */
export function readSignupDraft(): SignupDraft | null {
  try {
    const raw = sessionStorage.getItem(SIGNUP_DRAFT_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<Record<keyof SignupDraft, unknown>> | null;
    if (!p || typeof p !== "object") return null;
    const c = (p.consents && typeof p.consents === "object" ? p.consents : {}) as Record<string, unknown>;
    const verifyEmail = str(p.verifyEmail, 254).trim();
    return {
      firstName: str(p.firstName, 80),
      lastName: str(p.lastName, 80),
      email: str(p.email, 254),
      consents: {
        terms: c.terms === true,
        mediation: c.mediation === true,
        kvkk: c.kvkk === true,
        marketing: c.marketing === true,
        profile: c.profile === true,
      },
      verifyEmail: verifyEmail || null,
      emailSeed: str(p.emailSeed, 254),
    };
  } catch {
    return null;
  }
}

export function clearSignupDraft(): void {
  try {
    sessionStorage.removeItem(SIGNUP_DRAFT_KEY);
  } catch {
    // yok say
  }
}
