import { MarketingHeader } from "@/components/marketing/marketing-header";
import { JsonLd } from "@/components/seo/json-ld";
import { isLocale } from "@rothern/i18n";
import { useLocale } from "next-intl";
import { siteGraph } from "@/lib/seo/jsonld";
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
  const locale = useLocale();
  return (
    <div className={`min-h-dvh ${className}`}>
      {/* SİTE KİMLİĞİ HER PUBLIC SAYFADA (2026-09-09). Eskiden yalnız
          anasayfa `WebSite` düğümü basıyordu; bir kullanıcı arama sonucundan
          doğrudan ürün ya da firma sayfasına indiğinde yayıncı kimliği hiç
          yoktu. Üretken motorlar (GEO) bir cevabı kaynağa bağlarken yayıncıyı
          arar — kimliksiz sayfa alıntılanabilir ama ATFEDİLEMEZ. Sayfaya özel
          düğümler (Product, Organization/firma, Demand, ItemList) buna EK
          olarak kendi script'lerinde durur; `@id` üzerinden aynı grafiğe
          bağlanırlar. */}
      <JsonLd data={siteGraph(isLocale(locale) ? locale : undefined)} />
      <MarketingHeader />
      {/* Sabit üst çubuk güvenli alanın üst payı kadar uzar (mobil kabuk);
          sayfaların kendi üst boşluğu (`pt-28`, hero `pt-32`) aynı kalır,
          pay burada eklenir. Pay 0 iken eskisiyle aynı.
          `@container` (2. tur safe-area): tam genişlik bantlar (`100cqw`,
          anasayfa hero'su — `heroBandClass`) gövdenin yatay güvenli alan
          payı DÜŞÜLMÜŞ genişliği ölçer; kapsayıcı yokken `100cqw` görünüm
          alanının tamamıydı ve yatay iPhone'da arama kutusu ile "Ara"
          çentik tarafına taşıyordu. Panelde `main` zaten kapsayıcı.
          DİKKAT: eski motorlar (WebView/Chrome ~128 öncesi, eski Safari)
          kapsayıcıya yerleşim kapsaması da uygular ve `main` içindeki `fixed`
          öğenin içerik bloğu olur — yüzen düğme / alt çubuk görünüm alanına
          değil `main`e göre konumlanır. Sayfa içeriğindeki her `fixed` öğe
          `ViewportLayer` ile `body`ye taşınır (yüzen "Talep aç":
          `FloatingRequestDock`). */}
      <main className="@container pt-(--safe-top)">{children}</main>
      <MarketplaceFooter />
    </div>
  );
}
