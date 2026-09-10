"use client";

import { RothernLogo } from "@/components/brand/logo";
import { Sheet } from "@/components/ui/sheet";
import { MARKETPLACE_LABELS, MARKETPLACE_ROUTES } from "@/lib/public/marketplace";
import { Bars3Icon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * ÜST ÇUBUK — TEK KATMAN, SADE MENÜ (2026-09-09, kullanıcı kararı).
 *
 * Önceki hâli iki katmanlıydı (PROMPT 6): üstte siyah şerit (iki tarafın
 * giriş cümlesi + Nasıl çalışır / Fiyatlar / TR), altında logo · Kategoriler
 * mega menüsü · ortada typeahead · Alım Talepleri · Giriş · Kaydol.
 * Kullanıcı KALDIRTTI: siyah şerit tümüyle, mega menü ve üst çubuk araması.
 * Şeridin taşıdığı sayfalar (Nasıl çalışır, Fiyatlar) logonun YANINDA normal
 * menü satırı oldu.
 *
 * HEDEF SAYFALAR GERİ GELDİ (2026-09-09, kullanıcı: "eskiden daha fazla
 * başlık vardı, şimdi 2 tane; çok solda ve garip duruyor"). Ürünler ·
 * Firmalar · Alım Talepleri eskiden mega menünün ve şeridin içinde
 * yaşıyordu; o katmanlar kalkınca sitenin ÜÇ ana yüzeyi üst çubuktan
 * tümüyle düştü ve geriye logoya yapışmış iki bilgi bağlantısı kaldı.
 * Şimdi düz menü satırı olarak duruyorlar — mega menü ve arama GERİ
 * GELMEDİ, yalnız bağlantılar.
 *
 * SIRA: önce gidilecek yerler (pazar yeri), sonra açıklayıcı sayfalar.
 * Adlar `MARKETPLACE_LABELS`ten — üst çubuk, liste sayfası ve footer aynı
 * sözcüğü kullanmalı ("ürün ≠ ilan" ayrımı orada belgeli).
 *
 * Sonuç: header 100 px'ten **64 px'e** indi. Sayfaların üst boşluğu
 * (`pt-28`) olduğu gibi duruyor — artık nefes payı daha geniş, kesişme yok;
 * anasayfa hero'sunun boşluğu tek katmana göre yeniden ayarlandı
 * (`home-hero.tsx`).
 *
 * Header `fixed` KALDI ve arama kutusu artık HİÇ çizilmediği için
 * `useHeroGone`a bağlı render dallanması da kalktı — sunucu ve istemci aynı
 * ağacı basar (2026-09-05 hydration #418 dersi).
 *
 * GÖRSEL RÖTUŞ (2026-09-09, kullanıcı: "modern header yap" — seçim: yeni öğe
 * EKLEME, yalnız görsel):
 *  · AKTİF SAYFA alt çizgiyle işaretli (`aria-current="page"`), hover'da aynı
 *    çizgi soluk beliriyor — bağlantılar artık "nerede olduğunu" söylüyor.
 *  · Kaydırınca çubuk 64 → 56 px'e iniyor, zemin matlaşıyor ve ince bir gölge
 *    biniyor; sayfanın üstündeyken çizgi/gölge YOK (hero fotoğrafı çubuğun alt
 *    çizgisine oturuyor, gölge orada kirli bir bant yapardı).
 *
 * İKİSİ DE İSTEMCİ EFEKTİNDEN OKUNUR, render dallanması DEĞİL. `usePathname`
 * statik/ISR üretimde "/" DÖNMÜYOR (2026-09-05 #418): sunucu HER ZAMAN
 * "aktif yok + kaydırılmamış" hâli basar, işaret hidrasyondan sonra düşer.
 * Yükseklik yalnız kaydırınca değişir, dolayısıyla ilk boyada zıplama olmaz.
 */
const PRICING_HREF = "/nasil-calisir#fiyatlar";

/** Logonun yanındaki menü — tek kaynak (masaüstü satırı + mobil çekmece). */
const NAV = [
  { name: MARKETPLACE_LABELS.products, href: MARKETPLACE_ROUTES.products },
  { name: MARKETPLACE_LABELS.companies, href: MARKETPLACE_ROUTES.companies },
  { name: MARKETPLACE_LABELS.demands, href: MARKETPLACE_ROUTES.demands },
  { name: "Nasıl Çalışır", href: "/nasil-calisir" },
  { name: "Fiyatlar", href: PRICING_HREF },
];

export function MarketingHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [here, setHere] = useState<string | null>(null);
  const pathname = usePathname();

  /* Aktif satır: `pathname` yalnız EFEKT BAĞIMLILIĞI — render dalı değil.
     Rota değişince yeniden değerlendirilir, ilk boyada boş kalır. */
  useEffect(() => {
    setHere(window.location.pathname);
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* Fiyatlar `/nasil-calisir#fiyatlar`e gidiyor; çapa aynı sayfa olduğu için
     ikisi birden işaretlenmesin diye yalnız TAM eşleşme aktif sayılır. */
  const isActive = (href: string) => here != null && here === href.split("#")[0] && !href.includes("#");

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div
        className={`border-b transition-[height,background-color,border-color,box-shadow] duration-200 ${
          scrolled
            ? "h-14 border-zinc-950/10 bg-white/90 shadow-sm shadow-zinc-950/5 backdrop-blur-md"
            : "h-16 border-zinc-950/10 bg-white/95 backdrop-blur"
        }`}
      >
        <div
          className={`mx-auto flex max-w-7xl items-center gap-2 px-4 transition-[height] duration-200 sm:px-6 lg:gap-7 lg:px-8 ${
            scrolled ? "h-14" : "h-16"
          }`}
        >
          {/* Logonun alt metni "Rothern" — ayrıca sr-only metin KOYMA
              (ekran okuyucu adı iki kez okur). */}
          <Link href="/" className="-m-1.5 shrink-0 p-1.5">
            <RothernLogo variant="full-light" size="sm" priority />
          </Link>

          {/* Menü logo ile sağdaki düğmeler arasında ORTALANIR (mx-auto): sola
              yaslı hâli "çok soldan başlıyor" diye iki kez geri geldi
              (kullanıcı, 2026-09-10). Sağ grup ml-auto taşımaz, boşluğu nav
              iki yana eşit paylaştırır. */}
          <nav aria-label="Site menüsü" className="hidden items-center gap-8 lg:mx-auto lg:flex">
            {NAV.map((item) => {
              const on = isActive(item.href);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  aria-current={on ? "page" : undefined}
                  className={`relative py-1 text-sm font-medium whitespace-nowrap transition after:absolute after:inset-x-0 after:-bottom-0.5 after:h-0.5 after:rounded-full after:transition ${
                    on
                      ? "text-zinc-950 after:bg-zinc-950"
                      : "text-zinc-600 after:bg-transparent hover:text-zinc-950 hover:after:bg-zinc-950/20"
                  }`}
                >
                  {item.name}
                </Link>
              );
            })}
          </nav>

          <div className="hidden items-center gap-4 lg:flex">
            <Link
              href="/company/login"
              className="text-sm font-semibold whitespace-nowrap text-zinc-900 transition hover:text-zinc-600"
            >
              Giriş Yap
            </Link>
            <Link
              href="/company/kayit"
              className="rounded-full bg-zinc-950 px-4 py-2 text-sm font-semibold whitespace-nowrap text-white shadow-sm transition hover:bg-zinc-800"
            >
              Ücretsiz Kaydol
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="ml-auto inline-flex size-10 items-center justify-center rounded-lg text-zinc-700 hover:bg-zinc-100 lg:hidden"
          >
            <span className="sr-only">Menüyü aç</span>
            <Bars3Icon aria-hidden className="size-6" />
          </button>
        </div>
      </div>

      {/* Mobil menü — masaüstüyle AYNI satırlar + CTA'lar. */}
      <Sheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        side="right"
        title="Menü"
        footer={
          <div className="flex flex-col gap-2">
            <Link
              href="/company/kayit"
              onClick={() => setMenuOpen(false)}
              className="rounded-full bg-zinc-950 px-4 py-2.5 text-center text-sm font-semibold text-white"
            >
              Ücretsiz Kaydol
            </Link>
            <Link
              href="/company/login"
              onClick={() => setMenuOpen(false)}
              className="rounded-full px-4 py-2.5 text-center text-sm font-semibold text-zinc-900 ring-1 ring-zinc-950/10 ring-inset"
            >
              Giriş Yap
            </Link>
          </div>
        }
      >
        <nav
          className="flex flex-col"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a")) setMenuOpen(false);
          }}
        >
          {NAV.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="-mx-2 rounded-lg px-2 py-2.5 text-base font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              {item.name}
            </Link>
          ))}
        </nav>
      </Sheet>
    </header>
  );
}
