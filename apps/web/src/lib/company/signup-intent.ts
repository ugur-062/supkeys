/**
 * KAYIT NİYETİ — anasayfa CTA'sı ile kayıt sonrası ilk sayfa arasındaki köprü
 * (2026-09-04).
 *
 * "Talep aç / Vitrin aç" farklı niyetlerle kayda gelir; hepsi
 * `/company/kayit?intent=…`. Kayıt formu niyeti ön seçili gösterir, doğrulama
 * bitince `sessionStorage`'a yazar; onboarding (Kurucu) araya girse de
 * `/company` köküne dönüldüğünde `consumeSignupIntent` okur, ilgili sihirbaza
 * yönlendirir ve siler. Query ile taşımak onboarding'de kaybolurdu.
 *
 * Tek kaynak: hedef rotalar burada, bileşenler yazmaz. Niyetin EKRANDAKİ
 * adı/ipucu yok — kayıt formu niyeti yalnız taşır, metin basmaz (i18n Faz 2'de
 * ölü `label`/`hint` alanları kaldırıldı).
 */
export const SIGNUP_INTENTS = {
  talep: {
    /**
     * YÖNLENDİRME YOK (2026-09-14, kullanıcı kararı).
     *
     * Yeni firma STANDART doğuyor; satınalma paneli GOLD istiyor
     * (`BUYING_TIER`). Burası `/company/satinalma/taleplerim/yeni`ye
     * yönlendiriyordu: kullanıcı kaydoluyor, e-postasını doğruluyor,
     * onboarding'i bitiriyor ve İLK GÖRDÜĞÜ EKRAN paket duvarı oluyordu —
     * hem de ödeme akışı henüz YOKKEN, yani çıkışsız bir duvar.
     *
     * Paket satın alma devreye girince buraya `/company/satinalma/taleplerim/yeni`
     * geri konabilir; o zaman duvarın ardında gerçek bir yol olur.
     */
    href: null,
  },
  vitrin: {
    href: "/company/satis/urunlerim?yeni=1",
  },
  ikisi: {
    href: null,
  },
  /** "Teklif ver" / "Bilgi iste" — geldiği kaydın PANEL karşılığına döner (`redirect`). */
  teklif: {
    href: "/company/satis#acik-talepler",
  },
} as const;

export type SignupIntent = keyof typeof SIGNUP_INTENTS;

const KEY = "rothern.signup-intent";
const REDIRECT_KEY = "rothern.signup-redirect";

export function parseSignupIntent(raw: string | null | undefined): SignupIntent | null {
  return raw && raw in SIGNUP_INTENTS ? (raw as SignupIntent) : null;
}

/** Yalnız site içi yol; açık yönlendirme yok (visibility.ts ile aynı kural). */
function safe(redirect?: string | null): string | null {
  return redirect && redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : null;
}

export function rememberSignupIntent(intent: SignupIntent, redirect?: string | null) {
  try {
    if (SIGNUP_INTENTS[intent].href) sessionStorage.setItem(KEY, intent);
    const r = safe(redirect);
    if (r) sessionStorage.setItem(REDIRECT_KEY, r);
  } catch {
    /* özel pencere / depolama kapalı — yönlendirme olmaz, kayıt olur */
  }
}

/** Okur ve SİLER — tek kullanımlık. `redirect` niyet hedefinden ÖNCE gelir. */
export function consumeSignupIntent(): string | null {
  try {
    const redirect = safe(sessionStorage.getItem(REDIRECT_KEY));
    const intent = parseSignupIntent(sessionStorage.getItem(KEY));
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem(REDIRECT_KEY);
    return redirect ?? (intent ? SIGNUP_INTENTS[intent].href : null);
  } catch {
    return null;
  }
}
