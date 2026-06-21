import { AuthHydrationBoundary } from "@/components/providers/auth-hydration";
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

export const metadata: Metadata = {
  title: {
    default: "Supkeys — AI Destekli E-Satın Alma Platformu",
    template: "%s · Supkeys",
  },
  description:
    "Tedarikçi yönetimi, RFQ, açık eksiltme — tek platformda. Tasarrufunuzu artırın, satın alma sürecinizi otomatikleştirin.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/supkeys-icon-16.png", type: "image/png", sizes: "16x16" },
      { url: "/supkeys-icon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/supkeys-icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/supkeys-icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Supkeys",
    description: "AI Destekli E-Satın Alma Platformu",
    images: ["/supkeys-logo-full.png"],
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
