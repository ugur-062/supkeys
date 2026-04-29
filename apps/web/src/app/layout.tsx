import { QueryProvider } from "@/components/providers/query-provider";
import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Supkeys — Akıllı Satın Alma Platformu",
  description: "AI destekli e-satın alma ve e-ihale platformu",
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
          {children}
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
