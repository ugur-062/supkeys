import type { Metadata } from "next";
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
      <body className="antialiased">{children}</body>
    </html>
  );
}
