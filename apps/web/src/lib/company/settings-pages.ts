/**
 * Ayarlar sayfaları — TEK KAYNAK (2026-09-10).
 *
 * Hub kartı ve sayfanın kendi başlığı/açıklaması aynı kayıttan okunur; daha
 * önce iki yerde elle yazılıyor ve ayrışıyordu (kart "Unvan, adres, KEP…"
 * derken sayfa "Kimlik, unvan…" diyordu; kart "telefon" derken sayfa demiyordu).
 * Uzun açıklama gereken sayfa `SettingsShell`e ayrıca `description` geçer;
 * kart her zaman buradaki kısa cümleyi basar.
 *
 * i18n Faz 2: ROTA burada, METİN katalogda
 * (`web.panel.settings.settingsPages.<key>.{title,description}`) — başlık ve
 * açıklama OKUYUCUNUN DİLİNDE `useSettingsPages()` / `useSettingsPage(key)`
 * ile gelir; Türkçe yedek sözlük KALDIRILDI (tek kaynak katalog).
 */
import { useTranslations } from "next-intl";

export const SETTINGS_PAGE_KEYS = [
  "hesap",
  "sifre",
  "bildirimler",
  "twoFactor",
  "profil",
  "firma",
  "adresler",
  "banka",
  "kullanicilar",
  "aktivite",
  "ai",
  "dogrulama",
] as const;
export type SettingsPageKey = (typeof SETTINGS_PAGE_KEYS)[number];

/** Sayfanın kimliği: katalog anahtarı + adres. Metin taşımaz. */
export interface SettingsPageRef {
  /** Katalog anahtarı (`web.panel.settings.settingsPages.<key>`) — kabuk ve hub bununla çevirir. */
  key: SettingsPageKey;
  href: string;
}

/** Kimlik + okuyucunun dilindeki metin (`useSettingsPages()` üretir). */
export interface SettingsPageMeta extends SettingsPageRef {
  title: string;
  description: string;
}

export const SETTINGS_PAGES = {
  hesap: { key: "hesap", href: "/company/ayarlar/hesap-bilgileri" },
  sifre: { key: "sifre", href: "/company/ayarlar/sifre" },
  bildirimler: { key: "bildirimler", href: "/company/ayarlar/bildirimler" },
  twoFactor: { key: "twoFactor", href: "/company/ayarlar/2fa" },
  // Firma Bilgileri = ticari kayıt, Firma Profili = Profilim (vitrin) —
  // ayrım korunur; bu kart yalnız Profilim'e köprü.
  profil: { key: "profil", href: "/company/sirketim/profil" },
  firma: { key: "firma", href: "/company/ayarlar/firma" },
  adresler: { key: "adresler", href: "/company/ayarlar/adresler" },
  banka: { key: "banka", href: "/company/ayarlar/banka-hesaplari" },
  kullanicilar: { key: "kullanicilar", href: "/company/ayarlar/kullanicilar" },
  aktivite: { key: "aktivite", href: "/company/ayarlar/aktivite" },
  ai: { key: "ai", href: "/company/ayarlar/ai-kullanim" },
  // ONAY AKIŞLARI BURADA YOK (2026-09-14, kullanıcı kararı: "bir daha orada
  // olmasına gerek yok"). 2026-09-10'da sayfa Onaylar'a taşınmış ama Ayarlar'da
  // bir KART bırakılmıştı — aynı özelliğe iki giriş, ikisi de aynı yere gidiyor.
  // Tek giriş: Onaylar sayfasının başlığındaki "Onay akışları" düğmesi.
  //
  // Doğrulama kartının açıklaması ÜCRETSİZ ODAKLI (2026-09-15, kullanıcı
  // kararı): eskiden "Silver/Gold paketine geçişin ilk adımı" diyordu — yani
  // paket satıyordu. Oysa doğrulama ücretsiz ve rozet pakete bağlı DEĞİL
  // (`companyVerificationStatus`). Teşvik paketten değil rozetten gelmeli.
  dogrulama: { key: "dogrulama", href: "/company/ayarlar/dogrulama" },
} as const satisfies Record<SettingsPageKey, SettingsPageRef>;

/**
 * Aynı kayıt, okuyucunun dilinde (i18n Faz 2): başlık/açıklama katalog
 * anahtarından. Yalnız bileşen/hook gövdesinde çağrılır (rules-of-hooks).
 */
export function useSettingsPages(): Record<SettingsPageKey, SettingsPageMeta> {
  const t = useTranslations("web.panel.settings.settingsPages");
  const out = {} as Record<SettingsPageKey, SettingsPageMeta>;
  for (const key of SETTINGS_PAGE_KEYS) {
    out[key] = {
      ...SETTINGS_PAGES[key],
      title: t(`${key}.title` as never),
      description: t(`${key}.description` as never),
    };
  }
  return out;
}

/** Tek sayfa kaydı, okuyucunun dilinde. */
export function useSettingsPage(key: SettingsPageKey): SettingsPageMeta {
  return useSettingsPages()[key];
}
