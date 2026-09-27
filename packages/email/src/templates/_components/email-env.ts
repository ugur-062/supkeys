import * as React from "react";

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
