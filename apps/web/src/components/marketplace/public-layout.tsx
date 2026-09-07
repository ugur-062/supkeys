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
/**
 * KATALOG ZEMİNİ — beyaz DEĞİL (2026-09-07, Europages spec §2.1).
 *
 * Kartlar da beyaz olduğu için beyaz zeminde zeminden ayrılmıyor ve liste
 * "katalog" değil "blog" gibi okunuyordu. Tonlu zemin + beyaz kart, kartı
 * kaldırır; spec'in "pazaryeri hissinin %40'ı" dediği tek değişiklik bu.
 * Değer `--color-ink-100` (#F4F4F5) ile aynı — spec'in #F3F4F5'i.
 *
 * YALNIZ LİSTE/KATALOG sayfalarında kullanılır. Anasayfa ve düzyazı
 * sayfaları (`/nasil-calisir`, `/hakkimizda`) BEYAZ kalır: oradaki ritim
 * beyaz ↔ `bg-zinc-50` bölüm bantlarına dayanıyor, zemini tonlayınca o
 * bantlar zeminden AÇIK kalıp ters dönerdi.
 */
export const MARKET_GROUND = "bg-zinc-100";

export function PublicLayout({
  children,
  className = "bg-white",
}: {
  children: ReactNode;
  /** Gövde zemini. Katalog sayfaları `MARKET_GROUND`, gerisi beyaz. */
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
