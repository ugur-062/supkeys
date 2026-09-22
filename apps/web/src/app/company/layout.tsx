import { LocaleCookieSync } from "@/components/company/locale-cookie-sync";
import { I18nRuntimeBridge } from "@/i18n/runtime-bridge";
import { NextIntlClientProvider } from "next-intl";

// CSP nonce'lı rotalar dinamik render olmak ZORUNDA (statik prerender nonce
// alamaz — bkz. src/middleware.ts). Bu segmentin altındaki her sayfa
// (login, onboarding, (authed)/*) buradan dinamikleşir; public SEO sayfaları
// etkilenmez (kök layout'ta force-dynamic YOK, bilinçli).
export const dynamic = "force-dynamic";

/**
 * i18n Faz 0: next-intl sağlayıcısı YALNIZ panel segmentinde. `src/i18n/
 * request.ts` dili çerezden okur (`cookies()` = dinamik API); bu segment zaten
 * dinamik olduğu için bedelsiz. Herkese açık statik sayfalara sağlayıcı
 * takılmaz — Faz 1'de `[locale]` segmentiyle statik kalarak gelir
 * (docs/plan-i18n.md). Sağlayıcı sunucudan render edildiği için dil ve
 * mesajlar next-intl v4'te otomatik aktarılır.
 */
export default function CompanySegmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <NextIntlClientProvider>
      <I18nRuntimeBridge />
      <LocaleCookieSync />
      {children}
    </NextIntlClientProvider>
  );
}
