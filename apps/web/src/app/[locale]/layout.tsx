import { ErrorReporter } from "@/components/error-reporter";
import { I18nRuntimeBridge } from "@/i18n/runtime-bridge";
import { routing } from "@/i18n/routing";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { clientMessages } from "@/i18n/client-messages";
import { localeFromParams, type LocaleParams } from "@/i18n/params";
import { notFound } from "next/navigation";
import { QueryProvider } from "@/components/providers/query-provider";
import { OG_LOCALE, SITE_NAME, absoluteUrl } from "@/lib/seo/meta";
import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { Toaster } from "sonner";
import "../globals.css";

// Catalyst ile birebir: variable Inter (cv11 stylistic set globals.css'te aktif)
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

// BURADA `force-dynamic` YOK — bilinçli. Eskiden root layout'ta duruyordu ve
// public SEO sayfalarını da dinamik render'a zorluyordu; SEO/GEO önceliğe
// alınınca kaldırıldı (statik/ISR + CDN önbelleği olmadan crawl bütçesi ve
// TTFB kaybediliyordu). Nonce'lı CSP ile statik prerender bağdaşmadığı için
// dinamik render artık rota bazında zorunlu kılınır:
//   · /company/*      → app/company/layout.tsx
//   · /davet-kapat    → app/davet-kapat/layout.tsx
//   · /reset-password → app/reset-password/page.tsx
// Hangi rotanın hangi tarafta olduğunun tek kaynağı: lib/public-routes.ts
// (bkz. src/middleware.ts, public-routes.test.ts).

/* Dil bilen kök meta (i18n Faz 1): açıklama ve og:locale sayfanın diline
   göre; başlık şablonu ve ikonlar ortak. Sayfalar kendi metasını yazdığında
   (buildMetadata) o kazanır; burası yalnız yedek/miras. */
export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeFromParams(params);
  const t = await getTranslations({ locale, namespace: "web.seo" });
  return {
  /* Göreli OG/Twitter görsellerini ve `alternates.canonical`ı mutlaklaştıran
     taban. Olmadan Next uyarı basıp göreli adres yazıyor; sosyal ağlar ve AI
     tarayıcıları göreli görseli çözemiyor. */
  metadataBase: new URL(absoluteUrl("/")),
  title: {
    default: "Rothern",
    template: `%s · ${SITE_NAME}`,
  },
  applicationName: SITE_NAME,
  /* Arama motoruna ve AI tarayıcısına AÇIK yönerge: parçacığı kısaltma,
     görseli küçük gösterme, videoyu kırpma. Varsayılan davranış Google'da
     "kısa parçacık"tır; uzun parçacık hem tıklamayı hem üretken motorların
     alıntıladığı metnin kalitesini yükseltir. Panel `noindex`i rota
     bazında veriliyor (bkz. lib/public-routes.ts), buradaki genel izin onu
     EZMEZ — sayfa kendi robots'unu yazdığında o kazanır. */
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
  description: t("siteDescription"),
  /* Arama motoru sahiplik doğrulaması — env'den (Parça 9). Boşsa etiket
     yazılmaz. Google: Search Console "HTML etiketi"; Bing: Webmaster Tools
     meta (msvalidate.01). Vercel env → redeploy. */
  ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
    ? {
        verification: {
          ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION } : {}),
          ...(process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
            ? { other: { "msvalidate.01": process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION } }
            : {}),
        },
      }
    : {}),
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-16.png", type: "image/png", sizes: "16x16" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Rothern",
    description: t("siteOgDescription"),
    /* OG görseli OPAK olmalı: sosyal platformlar saydam PNG'yi siyaha basar
       (2026-09-09 logo düzeltmesinde `-trans`a çevrilmedi, bilinçli). */
    images: ["/rothern-logo-on-light.png"],
    siteName: SITE_NAME,
    locale: OG_LOCALE[locale],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Rothern",
    description: t("siteOgDescription"),
    images: ["/rothern-logo-on-light.png"],
  },
  };
}

/**
 * i18n Faz 1: `[locale]` KÖK düzeni. Dil segmentten gelir (tr ön eksiz, en/ru
 * ön ekli — src/i18n/routing.ts). `generateStaticParams` üç dili statik üretir;
 * `setRequestLocale` bu render'daki next-intl API'lerinin (sağlayıcı dahil)
 * statik kalmasını sağlar. Geçersiz segment middleware'den geçemez, yine de 404.
 */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  // Sunucuya özel ad alanları (SSS gövdesi, SEO cümleleri…) istemci yüküne yazılmaz.
  const messages = clientMessages(await getMessages());

  return (
    <html lang={locale} className={`${inter.variable} ${geistMono.variable}`}>
      <body className="antialiased">
        {/* Tarayıcı hatalarını sunucuya bildirir (SDK yok, ~1 kB). */}
        <ErrorReporter />
        {/* Sağlayıcı sunucudan render edilir: dil + mesajlar next-intl v4'te
            otomatik aktarılır. Köprü, React dışı kodun (axios) dilini kaydeder. */}
        <NextIntlClientProvider messages={messages}>
          <I18nRuntimeBridge />
          <QueryProvider>
            {children}
            {/* P0: sağ-alt — header'ı/aksiyonları örtmesin (canlı mesaj
                kartlarıyla aynı köşe, tek bildirim bölgesi). */}
            <Toaster
              position="bottom-right"
              // C13: alt boşluk AI launcher'ın (bottom-5 h-14) üstünde kalacak
              // kadar — toast butonun üzerine binmesin.
              offset={{ right: 24, bottom: 96 }}
              mobileOffset={{ bottom: 88 }}
              richColors
              closeButton
              toastOptions={{
                style: {
                  fontFamily: "var(--font-inter), system-ui, sans-serif",
                },
              }}
            />
          </QueryProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
