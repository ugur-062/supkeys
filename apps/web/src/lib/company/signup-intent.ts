/**
 * KAYIT NİYETİ — anasayfa CTA'sı ile kayıt sonrası ilk sayfa arasındaki köprü
 * (2026-09-04).
 *
 * "Talep aç / İlan aç / Vitrin aç" üç farklı niyetle kayda gelir; hepsi
 * `/company/kayit?intent=…`. Kayıt formu niyeti ön seçili gösterir, doğrulama
 * bitince `sessionStorage`'a yazar; onboarding (Kurucu) araya girse de
 * `/company` köküne dönüldüğünde `consumeSignupIntent` okur, ilgili sihirbaza
 * yönlendirir ve siler. Query ile taşımak onboarding'de kaybolurdu.
 *
 * Tek kaynak: hedef rotalar burada, bileşenler yazmaz.
 */
export const SIGNUP_INTENTS = {
  talep: {
    label: "Alım talebi açmak",
    hint: "Satın alma talebi yayımla, kapalı zarf teklif topla.",
    href: "/company/satinalma/taleplerim/yeni",
  },
  ilan: {
    label: "Ürün veya ilan yayınlamak",
    hint: "Satılık ilan aç, teklif ya da hemen-al ile sat.",
    href: "/company/satis/ilanlarim/yeni",
  },
  vitrin: {
    label: "Vitrin açmak",
    hint: "Ürün kataloğunu yayımla, bilgi talebi al.",
    href: "/company/satis/urunlerim?yeni=1",
  },
  ikisi: {
    label: "İkisi de",
    hint: "Tek hesapla hem al hem sat — panelden başla.",
    href: null,
  },
} as const;

export type SignupIntent = keyof typeof SIGNUP_INTENTS;

const KEY = "rothern.signup-intent";

export function parseSignupIntent(raw: string | null | undefined): SignupIntent | null {
  return raw && raw in SIGNUP_INTENTS ? (raw as SignupIntent) : null;
}

export function rememberSignupIntent(intent: SignupIntent) {
  try {
    if (SIGNUP_INTENTS[intent].href) sessionStorage.setItem(KEY, intent);
  } catch {
    /* özel pencere / depolama kapalı — yönlendirme olmaz, kayıt olur */
  }
}

/** Okur ve SİLER — tek kullanımlık. Hedef yoksa null. */
export function consumeSignupIntent(): string | null {
  try {
    const intent = parseSignupIntent(sessionStorage.getItem(KEY));
    sessionStorage.removeItem(KEY);
    return intent ? SIGNUP_INTENTS[intent].href : null;
  } catch {
    return null;
  }
}
