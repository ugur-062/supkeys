import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketplaceFooter } from "./marketplace-footer";
import type { ReactNode } from "react";

/**
 * HERKESE AÇIK SAYFA KABUĞU — tek header, tek footer (2026-09-04).
 *
 * Denetimde üç ayrı şablon bulundu: pazar yeri (MarketingHeader +
 * MarketplaceFooter), firma profili (kendi inline header/footer'ı, "e-ihale"
 * metniyle) ve `/nasil-calisir` (koyu pill + kendi inline dark footer'ı).
 * Ziyaretçi üç sayfada üç site gördü. Artık her public sayfa buradan geçer;
 * `/hakkimizda` ve `/iletisim` de (eskiden hiç header/footer'ları yoktu —
 * ziyaretçi sayfadan çıkamıyordu).
 *
 * Header `fixed` (iki katman, 100 px); içerik üst boşluğunu SAYFA verir
 * (hero kendi `pt-32`sini taşır, düz sayfalar `pt-28`). Kabuk oturum OKUMAZ — public rotalar
 * statik/ISR ve nonce'suz CSP ile çalışır (bkz. lib/public-routes.ts).
 */
export function PublicLayout({
  children,
  className = "bg-white",
}: {
  children: ReactNode;
  /** Gövde zemini — pazar yeri beyaz, firma profili `bg-zinc-50`. */
  className?: string;
}) {
  return (
    <div className={`min-h-dvh ${className}`}>
      <MarketingHeader />
      <main>{children}</main>
      <MarketplaceFooter />
    </div>
  );
}
