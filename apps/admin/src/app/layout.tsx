import { ErrorReporter } from "@/components/error-reporter";
import { AuthHydrationBoundary } from "@/components/providers/auth-hydration";
import { QueryProvider } from "@/components/providers/query-provider";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

// CSP nonce → dinamik render ZORUNLU: statik prerender'da per-request nonce
// enjekte edilemez (build'de request yok) → statik HTML'deki framework
// script'leri nonce'suz kalır, strict-dynamic altında BLOKLANIR (login ölür).
// Root layout'ta force-dynamic tüm rotalara iner. Admin zaten tümüyle authed →
// statik değer yok, kayıp yok. (bkz. src/middleware.ts)
export const dynamic = "force-dynamic";

// Inter build'de self-host edilir (fonts.googleapis.com CSP'de engelli — derin
// denetim LU-13). latin-ext: Türkçe ğ/ş/ı/İ glifleri.
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Rothern Admin",
    template: "%s · Rothern Admin",
  },
  description: "Rothern platform yönetim paneli",
  robots: {
    index: false,
    follow: false,
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className={inter.variable}>
      <body className="antialiased">
        {/* Tarayıcı hatalarını sunucuya bildirir (SDK yok, ~1 kB). */}
        <ErrorReporter />
        <QueryProvider>
          <AuthHydrationBoundary>{children}</AuthHydrationBoundary>
          <Toaster
            position="top-right"
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
