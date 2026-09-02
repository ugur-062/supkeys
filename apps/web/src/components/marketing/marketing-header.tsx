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
import { useEffect, useState } from "react";

/**
 * Kök `/` pazar yerine dönünce pazarlama çapaları (#ozellikler/#fiyatlar/#sss)
 * `/nasil-calisir`e taşındı — burada da öyle yazılı olmazsa bağlantılar
 * anasayfada karşılığı olmayan bir çapaya gider ve sessizce hiçbir şey yapmaz.
 * Adların tek kaynağı `lib/public/marketplace.ts` MARKETPLACE_LABELS.
 */
const navigation = [
  // Pazar yeri satırları yalnız yayın anahtarı AÇIKKEN görünür; kapalıyken
  // 404'e link vermiş olurduk.
  ...(MARKETPLACE_LIVE
    ? [
        { name: MARKETPLACE_LABELS.demands, href: MARKETPLACE_ROUTES.demands },
        { name: MARKETPLACE_LABELS.offers, href: MARKETPLACE_ROUTES.offers },
        { name: MARKETPLACE_LABELS.companies, href: MARKETPLACE_ROUTES.companies },
      ]
    : []),
  { name: "Nasıl Çalışır", href: "/nasil-calisir" },
];

export function MarketingHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

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
        className={`mx-auto flex items-center justify-between text-white transition-all duration-300 ease-out ${
          scrolled
            ? "mt-3 max-w-5xl rounded-full border border-zinc-800 bg-zinc-950 px-5 py-2 shadow-2xl"
            : "mt-4 max-w-6xl rounded-2xl border border-zinc-800 bg-zinc-950 px-6 py-3 shadow-lg"
        }`}
      >
        <div className="flex lg:flex-1">
          <Link href="/" className="-m-1.5 p-1.5">
            <span className="sr-only">Rothern</span>
            <RothernLogo variant="full" size={scrolled ? "sm" : "md"} priority />
          </Link>
        </div>
        <div className="flex lg:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-zinc-300"
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
              className="text-sm/6 font-medium whitespace-nowrap text-zinc-300 transition hover:text-white"
            >
              {item.name}
            </a>
          ))}
        </div>
        <div className="hidden lg:flex lg:flex-1 lg:items-center lg:justify-end lg:gap-x-3">
          <Link
            href="/company/login"
            className="text-sm/6 font-semibold whitespace-nowrap text-white transition hover:text-zinc-300"
          >
            Giriş Yap
          </Link>
          <Link
            href="/company/kayit"
            className="rounded-full bg-white px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap text-zinc-950 shadow-sm transition hover:bg-zinc-200"
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
        <DialogPanel className="fixed inset-y-0 right-0 z-50 w-full overflow-y-auto bg-zinc-950 p-6 sm:max-w-sm sm:ring-1 sm:ring-white/10">
          <div className="flex items-center justify-between">
            <Link href="/" className="-m-1.5 p-1.5">
              <RothernLogo variant="full" size="sm" />
            </Link>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="-m-2.5 rounded-md p-2.5 text-zinc-300"
            >
              <span className="sr-only">Menüyü kapat</span>
              <XMarkIcon aria-hidden="true" className="size-6" />
            </button>
          </div>
          <div className="mt-6 flow-root">
            <div className="-my-6 divide-y divide-white/10">
              <div className="space-y-2 py-6">
                {navigation.map((item) => (
                  <a
                    key={item.name}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="-mx-3 block rounded-lg px-3 py-2 text-base/7 font-semibold text-white hover:bg-white/5"
                  >
                    {item.name}
                  </a>
                ))}
              </div>
              <div className="space-y-2 py-6">
                <Link
                  href="/company/login"
                  className="-mx-3 block rounded-lg px-3 py-2.5 text-base/7 font-semibold text-white hover:bg-white/5"
                >
                  Giriş Yap
                </Link>
                <Link
                  href="/company/kayit"
                  className="-mx-3 block rounded-lg bg-white px-3 py-2.5 text-center text-base/7 font-semibold text-zinc-950"
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
