"use client";

import { RothernLogo } from "@/components/brand/logo";
import { Sheet } from "@/components/ui/sheet";
import { Bars3Icon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { useState } from "react";

/**
 * ÜST ÇUBUK — TEK KATMAN, SADE MENÜ (2026-09-09, kullanıcı kararı).
 *
 * Önceki hâli iki katmanlıydı (PROMPT 6): üstte siyah şerit (iki tarafın
 * giriş cümlesi + Nasıl çalışır / Fiyatlar / TR), altında logo · Kategoriler
 * mega menüsü · ortada typeahead · Alım Talepleri · Giriş · Kaydol.
 * Kullanıcı KALDIRTTI: siyah şerit tümüyle, mega menü, üst çubuk araması ve
 * "Alım Talepleri" bağlantısı. Şeridin taşıdığı sayfalar (Nasıl çalışır,
 * Fiyatlar) logonun YANINDA normal menü satırı oldu.
 *
 * Sonuç: header 100 px'ten **64 px'e** indi. Sayfaların üst boşluğu
 * (`pt-28`) olduğu gibi duruyor — artık nefes payı daha geniş, kesişme yok;
 * anasayfa hero'sunun boşluğu tek katmana göre yeniden ayarlandı
 * (`home-hero.tsx`).
 *
 * Header `fixed` KALDI ve arama kutusu artık HİÇ çizilmediği için
 * `useHeroGone`a bağlı render dallanması da kalktı — sunucu ve istemci aynı
 * ağacı basar (2026-09-05 hydration #418 dersi).
 */
const PRICING_HREF = "/nasil-calisir#fiyatlar";

/** Logonun yanındaki menü — tek kaynak (masaüstü satırı + mobil çekmece). */
const NAV = [
  { name: "Nasıl Çalışır", href: "/nasil-calisir" },
  { name: "Fiyatlar", href: PRICING_HREF },
];

export function MarketingHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="h-16 border-b border-zinc-950/10 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:px-6 lg:gap-6 lg:px-8">
          {/* Logonun alt metni "Rothern" — ayrıca sr-only metin KOYMA
              (ekran okuyucu adı iki kez okur). */}
          <Link href="/" className="-m-1.5 shrink-0 p-1.5">
            <RothernLogo variant="full-light" size="sm" priority />
          </Link>

          <nav aria-label="Site menüsü" className="hidden items-center gap-6 lg:flex">
            {NAV.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="text-sm font-medium whitespace-nowrap text-zinc-600 transition hover:text-zinc-950"
              >
                {item.name}
              </Link>
            ))}
          </nav>

          <div className="ml-auto hidden items-center gap-4 lg:flex">
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
