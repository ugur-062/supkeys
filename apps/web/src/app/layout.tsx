import { QueryProvider } from "@/components/providers/query-provider";
import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

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

export const metadata: Metadata = {
  title: {
    default: "Rothern",
    template: "%s · Rothern",
  },
  description:
    "Alıcı ve tedarikçiyi tek hesapta birleştiren B2B ticaret platformu. Kapalı zarf teklif topla, ilan aç, firma keşfet — al, sat, keşfet, tek panelden.",
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
    description: "Alıcı ve tedarikçiyi tek hesapta birleştiren B2B ticaret platformu.",
    images: ["/rothern-logo-on-light.png"],
    locale: "tr_TR",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className={`${inter.variable} ${geistMono.variable}`}>
      <body className="antialiased">
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
      </body>
    </html>
  );
}
