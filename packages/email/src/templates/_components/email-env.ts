import * as React from "react";
import { DEFAULT_LOCALE, translateRoutePath, type Locale } from "@rothern/i18n";

/**
 * Gönderim ORTAMI — şablon verisinden bağımsız, her e-postada aynı (2026-09-27).
 *
 * Alt bilgi "rothern.com" ve "© 2026" SABİTTİ: staging `supkeys.com`
 * alanından gönderdiği hâlde e-posta "rothern.com platformundan aldınız"
 * diyordu, yıl da elle güncellenmeyi bekliyordu. Alan adı gönderen API'nin
 * web adresinden (`WEB_URL`) gelir; her şablona ayrı prop taşımak yerine
 * `renderEmail` bağlamı bir kez kurar, `Layout` okur.
 */
export interface EmailEnv {
  /** Web uygulamasının kök adresi (`https://www.rothern.com`). */
  siteUrl?: string;
  /** Test için sabitlenebilir "şimdi" (yıl). */
  now?: Date;
  /**
   * Tek tık çıkış sayfası (imzalı jetonlu). Verilirse alt bilgi "abonelikten
   * çıkın" satırını basar — işlem e-postalarında (kod, şifre, sipariş) YOK.
   */
  unsubscribeUrl?: string;
  /**
   * Kayıtlı kullanıcının bildirim ayarları sayfası (varsa alt bilgide).
   * `unsubscribeUrl` OLMADAN verilirse (alıcının kendi işlemine dair ACTIVITY
   * bildirimi, 2026-10-05) alt bilgi çıkış satırı yerine yalnız sessiz bir
   * "bildirim ayarları" bağlantısı basar.
   */
  preferencesUrl?: string;
  /**
   * KVKK aydınlatma bağlantısını çıkış bağlantısından BAĞIMSIZ açar (derin
   * denetim boşluk taraması GA2). İşlem dışı akışta çıkış bağlantısı zaten
   * aydınlatmayı getirir; bu bayrak ÜYE OLMAYAN adrese giden İŞLEM e-postaları
   * içindir (ekip daveti, misafir bilgi talebi doğrulaması): adres veri
   * ilgilisinden toplanmamış olabilir ve ilk temas bu e-postadır.
   */
  privacyNotice?: boolean;
}

/** Alt bilgi aydınlatma satırını basar mı? Çıkış bağlantısı varsa her zaman. */
export function showsPrivacyNotice(env: EmailEnv): boolean {
  return env.privacyNotice === true || !!env.unsubscribeUrl;
}

export const EmailEnvContext = React.createContext<EmailEnv>({});

/** `https://www.rothern.com` → `rothern.com`; geçersiz/boş → `rothern.com`. */
export function siteHost(siteUrl?: string): string {
  if (!siteUrl) return "rothern.com";
  try {
    return new URL(siteUrl).host.replace(/^www\./i, "") || "rothern.com";
  } catch {
    return "rothern.com";
  }
}

/**
 * KVKK aydınlatma metninin alıcının dilindeki adresi (yayın denetimi 2026-09-28
 * Bölüm 13): işlem dışı her e-posta — özellikle ÜYE OLMAYAN adrese giden talep
 * daveti — veri sorumlusunun aydınlatma metnine bağlanır (KVKK m. 10: veri
 * ilgilisinden toplanmayan veride ilk iletişimde aydınlatma).
 */
export function privacyNoticeUrl(siteUrl: string | undefined, locale: Locale): string {
  const base = (siteUrl || "https://www.rothern.com").replace(/\/$/, "");
  const prefix = locale === DEFAULT_LOCALE ? "" : `/${locale}`;
  return `${base}${prefix}${translateRoutePath("/sozlesmeler/kvkk", locale)}`;
}
