import { AuthHydrationBoundary } from "@/components/providers/auth-hydration";
import { QueryProvider } from "@/components/providers/query-provider";
import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

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
    <html lang="tr">
      <body className="antialiased">
        <QueryProvider>
          <AuthHydrationBoundary>{children}</AuthHydrationBoundary>
          <Toaster
            position="top-right"
            richColors
            closeButton
            toastOptions={{
              style: {
                fontFamily: "Inter, system-ui, sans-serif",
              },
            }}
          />
        </QueryProvider>
      </body>
    </html>
  );
}
