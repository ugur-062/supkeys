"use client";

import { RothernLogo } from "@/components/brand/logo";
import {
  MARKETPLACE_LABELS,
  MARKETPLACE_ROUTES,
} from "@/lib/public/marketplace";
import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";
import { Dialog, DialogPanel } from "@headlessui/react";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { MagnifyingGlassIcon } from "@heroicons/react/20/solid";

/**
 * Kök `/` pazar yerine dönünce pazarlama çapaları (#ozellikler/#fiyatlar/#sss)
 * `/nasil-calisir`e taşındı — burada da öyle yazılı olmazsa bağlantılar
 * anasayfada karşılığı olmayan bir çapaya gider ve sessizce hiçbir şey yapmaz.
 * Adların tek kaynağı `lib/public/marketplace.ts` MARKETPLACE_LABELS.
 */
const navigation = [
  // Pazar yeri satırları yalnız yayın anahtarı AÇIKKEN görünür; kapalıyken
  // 404'e link vermiş olurduk.
  // v2 sırası: Ürünler · Firmalar · Alım Talepleri. "Satılık İlanlar" header'da
  // DEĞİL (footer + /urunler yan bağlantısı) — anasayfa ürün/firma/talep odaklı.
  ...(MARKETPLACE_LIVE
    ? [
        { name: MARKETPLACE_LABELS.products, href: MARKETPLACE_ROUTES.products },
        { name: MARKETPLACE_LABELS.companies, href: MARKETPLACE_ROUTES.companies },
        { name: MARKETPLACE_LABELS.demands, href: MARKETPLACE_ROUTES.demands },
      ]
    : []),
  { name: "Nasıl Çalışır", href: "/nasil-calisir" },
];

/**
 * Üst çubuk — İKİ ton.
 *
 * `light` (pazar yeri): beyaz, yarı saydam, blur'lu; açık zeminli sayfalarla
 * aynı yüzey dilini konuşur. `dark` (pazarlama sayfası): siyah pill — orası
 * koyu bölümler üzerine kuruluysa ve o tasarım korunuyor.
 *
 * Tek bileşen, iki ton: ikisini ayrı dosyaya bölmek logo/menü/mobil panel
 * mantığını ikiye kopyalardı ve biri ötekinden sessizce ayrışırdı.
 */
export function MarketingHeader({
  tone = "light",
}: {
  tone?: "light" | "dark";
} = {}) {
  const dark = tone === "dark";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  // Kompakt arama yalnız hero DIŞINDAKİ sayfalarda (anasayfada büyük kutu var).
  const pathname = usePathname();
  const showSearch = MARKETPLACE_LIVE && pathname !== "/";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-4">
      <nav
        aria-label="Global"
        className={`mx-auto flex items-center justify-between transition-all duration-300 ease-out ${
          dark
            ? "border border-zinc-800 bg-zinc-950 text-white"
            : "bg-white/80 text-zinc-950 ring-1 ring-zinc-950/5 backdrop-blur-md"
        } ${
          scrolled
            ? "mt-3 max-w-5xl rounded-full px-5 py-2 shadow-lg"
            : "mt-4 max-w-6xl rounded-2xl px-6 py-3 shadow-sm"
        }`}
      >
        <div className="flex lg:flex-1">
          {/* Logonun alt metni "Rothern" — ayrıca sr-only metin KOYMA:
              ekran okuyucu adı iki kez okur (Lighthouse image-redundant-alt). */}
          <Link href="/" className="-m-1.5 p-1.5">
            <RothernLogo
              variant={dark ? "full" : "full-light"}
              size={scrolled ? "sm" : "md"}
              priority
            />
          </Link>
        </div>
        <div className="flex lg:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className={`-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 ${
              dark ? "text-zinc-300" : "text-zinc-700"
            }`}
          >
            <span className="sr-only">Menüyü aç</span>
            <Bars3Icon aria-hidden="true" className="size-6" />
          </button>
        </div>
        <div className="hidden lg:flex lg:gap-x-6 xl:gap-x-8">
          {navigation.map((item) => (
            <a
              key={item.name}
              href={item.href}
              className={`text-sm/6 font-medium whitespace-nowrap transition ${
                dark
                  ? "text-zinc-300 hover:text-white"
                  : "text-zinc-600 hover:text-zinc-950"
              }`}
            >
              {item.name}
            </a>
          ))}
        </div>
        <div className="hidden lg:flex lg:flex-1 lg:items-center lg:justify-end lg:gap-x-3">
          {showSearch ? (
            <form action={MARKETPLACE_ROUTES.products} method="get" role="search" className="relative">
              <MagnifyingGlassIcon aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-zinc-400" />
              <input
                type="search"
                name="q"
                aria-label="Ürün ara"
                placeholder="Ürün ara"
                className={`h-8 w-40 rounded-full pr-3 pl-8 text-sm outline-none ring-1 ring-inset transition focus:w-56 ${
                  dark ? "bg-zinc-900 text-white ring-zinc-700 placeholder:text-zinc-500" : "bg-zinc-50 text-zinc-900 ring-zinc-200 placeholder:text-zinc-400"
                }`}
              />
            </form>
          ) : null}
          <Link
            href="/company/login"
            className={`text-sm/6 font-semibold whitespace-nowrap transition ${
              dark ? "text-white hover:text-zinc-300" : "text-zinc-900 hover:text-zinc-600"
            }`}
          >
            Giriş Yap
          </Link>
          <Link
            href="/company/kayit"
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap shadow-sm transition ${
              dark
                ? "bg-white text-zinc-950 hover:bg-zinc-200"
                : "bg-zinc-950 text-white hover:bg-zinc-800"
            }`}
          >
            Kaydol
          </Link>
        </div>
      </nav>

      <Dialog
        open={mobileMenuOpen}
        onClose={setMobileMenuOpen}
        className="lg:hidden"
      >
        <div className="fixed inset-0 z-50" />
        <DialogPanel
          className={`fixed inset-y-0 right-0 z-50 w-full overflow-y-auto p-6 sm:max-w-sm sm:ring-1 ${
            dark ? "bg-zinc-950 sm:ring-white/10" : "bg-white sm:ring-zinc-950/10"
          }`}
        >
          <div className="flex items-center justify-between">
            <Link href="/" className="-m-1.5 p-1.5">
              <RothernLogo variant={dark ? "full" : "full-light"} size="sm" />
            </Link>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className={`-m-2.5 rounded-md p-2.5 ${
                dark ? "text-zinc-300" : "text-zinc-700"
              }`}
            >
              <span className="sr-only">Menüyü kapat</span>
              <XMarkIcon aria-hidden="true" className="size-6" />
            </button>
          </div>
          <div className="mt-6 flow-root">
            <div
              className={`-my-6 divide-y ${
                dark ? "divide-white/10" : "divide-zinc-950/10"
              }`}
            >
              <div className="space-y-2 py-6">
                {navigation.map((item) => (
                  <a
                    key={item.name}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`-mx-3 block rounded-lg px-3 py-2 text-base/7 font-semibold ${
                      dark
                        ? "text-white hover:bg-white/5"
                        : "text-zinc-900 hover:bg-zinc-50"
                    }`}
                  >
                    {item.name}
                  </a>
                ))}
              </div>
              <div className="space-y-2 py-6">
                <Link
                  href="/company/login"
                  className={`-mx-3 block rounded-lg px-3 py-2.5 text-base/7 font-semibold ${
                    dark
                      ? "text-white hover:bg-white/5"
                      : "text-zinc-900 hover:bg-zinc-50"
                  }`}
                >
                  Giriş Yap
                </Link>
                <Link
                  href="/company/kayit"
                  className={`-mx-3 block rounded-lg px-3 py-2.5 text-center text-base/7 font-semibold ${
                    dark ? "bg-white text-zinc-950" : "bg-zinc-950 text-white"
                  }`}
                >
                  Kaydol
                </Link>
              </div>
            </div>
          </div>
        </DialogPanel>
      </Dialog>
    </header>
  );
}
