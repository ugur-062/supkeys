import { LOCALES, type Locale } from "@rothern/i18n";
import { tApi, type ApiMessageKey } from "../i18n/i18n.service";
import { currentLocale } from "../i18n/locale-context";

/**
 * KAYITTA YAZILAN VARSAYILAN ADRES BAŞLIKLARI — okuyucunun dilinde (2026-09-27).
 *
 * Onboarding fatura/teslimat adresini "Merkez" / "Teslimat (fatura ile aynı)"
 * başlığıyla açar. Eskiden bu başlıklar sabit Türkçe yazılıyordu ve adres
 * defterinde, hızlı talep adres seçicisinde ham basılıyordu (Rus firma
 * "Merkez" görüyordu). Artık kayıt kullanıcının dilinde yazar; ESKİ kayıtlar ve
 * başka dilde açılmış hesaplar için okuma anında: başlık bu anahtarlardan
 * birinin HERHANGİ bir dildeki metniyle birebir aynıysa okuyucunun diline
 * çevrilir. Kullanıcının kendi yazdığı başlık ("Depo 2") olduğu gibi kalır.
 */
const DEFAULT_TITLE_KEYS = [
  "api.companyAuth.defaults.headOfficeTitle",
  "api.companyAuth.defaults.deliverySameTitle",
  "api.companyAuth.defaults.deliveryTitle",
] as const satisfies readonly ApiMessageKey[];

export function localizeDefaultAddressTitle(
  title: string,
  locale: Locale = currentLocale(),
): string {
  const t = title.trim();
  if (!t) return title;
  for (const key of DEFAULT_TITLE_KEYS) {
    if (LOCALES.some((l) => tApi(key, undefined, l) === t)) {
      return tApi(key, undefined, locale);
    }
  }
  return title;
}
