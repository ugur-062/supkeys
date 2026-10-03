import type { Locale, WebMessages } from "@rothern/i18n";

/**
 * next-intl tip bağlantısı: anahtarlar Türkçe kaynak katalogdan türer —
 * `useTranslations("web.settings")` altında olmayan anahtar DERLEMEDE kırmızı.
 */
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: WebMessages;
  }
}
