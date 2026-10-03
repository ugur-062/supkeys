import { LocaleUrlSync } from "@/components/company/locale-url-sync";

// CSP nonce'lı rotalar dinamik render olmak ZORUNDA (statik prerender nonce
// alamaz — bkz. src/middleware.ts). Bu segmentin altındaki her sayfa
// (login, onboarding, (authed)/*) buradan dinamikleşir; public SEO sayfaları
// etkilenmez (kök layout'ta force-dynamic YOK, bilinçli).
export const dynamic = "force-dynamic";
// NOT (2026-09-23, ölçüldü): `[locale]` kök düzeni `generateStaticParams`
// taşıdığı için derleme tablosu bu rotaları ● (SSG) ETİKETLER ama `force-dynamic`
// geçerlidir — `.next/server/app/<dil>/company/*.html` ÜRETİLMEZ, panel isteğe
// bağlı render edilir. Etikete bakıp `connection()` eklemeye kalkma.

/**
 * i18n: sağlayıcı artık `[locale]/layout.tsx`te (Faz 1). Burada yalnız panel
 * kuralı kalır — üyenin kayıtlı dili adresteki dilden farklıysa `LocaleUrlSync`
 * aynı sayfayı doğru ön ekle açar.
 */
export default function CompanySegmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <LocaleUrlSync />
      {children}
    </>
  );
}
