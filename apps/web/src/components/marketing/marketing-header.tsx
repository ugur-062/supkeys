"use client";

import { RothernLogo } from "@/components/brand/logo";
import { MegaMenu } from "@/components/marketplace/mega-menu";
import { SearchTypeahead } from "@/components/marketplace/search-typeahead";
import { Disclosure } from "@/components/ui/disclosure";
import { Sheet } from "@/components/ui/sheet";
import { useHeroGone } from "@/hooks/use-hero-gone";
import { categoryPath, MARKETPLACE_LABELS, MARKETPLACE_ROUTES } from "@/lib/public/marketplace";
import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";
import type { CategoryMenuNode } from "@/lib/public/marketplace-api";
import { fetchCategoryMenu } from "@/lib/public/suggest-client";
import { signupHref } from "@/lib/public/visibility";
import { cn } from "@/lib/utils";
import { Bars3Icon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * ÜST ÇUBUK — İKİ KATMAN (PROMPT 6, 2026-09-06).
 *
 *  · İnce şerit (h-9, siyah): iki tarafın giriş cümlesi + Nasıl çalışır /
 *    Fiyatlar / dil. Dar ekranda çizilmez — dört bağlantı 390 px'e sığmaz,
 *    hepsi menüde zaten var.
 *  · Ana satır (h-16, beyaz, alt çizgi): logo · Kategoriler ▾ (mega menü) ·
 *    ortada arama · Alım Talepleri · Giriş Yap · Ücretsiz Kaydol.
 *
 * Header `fixed` KALDI (sayfalar üst boşluğu kendileri veriyor: hero `pt-32`,
 * düz sayfalar `pt-28`; iki katman 36+64=100 px, ikisinin de altında).
 * Sticky'ye çevirmek her herkese açık sayfanın padding'ini elden geçirmek
 * demekti — kabuk değişikliği sayfa düzenine sızmasın.
 *
 * `usePathname()` ile RENDER DALLANMASI YOK (2026-09-05 hydration dersi):
 * arama kutusu sunucuda HER ZAMAN gizli basılır, `useHeroGone` istemcide
 * karar verir. Anasayfada hero görünürken kutu görünmez, hero geçince belirir.
 */
const PRICING_HREF = "/nasil-calisir#fiyatlar";

const navigation = MARKETPLACE_LIVE
  ? [
      { name: MARKETPLACE_LABELS.products, href: MARKETPLACE_ROUTES.products },
      { name: MARKETPLACE_LABELS.companies, href: MARKETPLACE_ROUTES.companies },
      { name: MARKETPLACE_LABELS.demands, href: MARKETPLACE_ROUTES.demands },
    ]
  : [];

export function MarketingHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [tree, setTree] = useState<CategoryMenuNode[]>([]);
  const heroGone = useHeroGone();
  const showSearch = MARKETPLACE_LIVE && heroGone;

  // Mobil menüdeki kategori akordeonu — çekmece ilk açıldığında yüklenir.
  useEffect(() => {
    if (!menuOpen || tree.length > 0 || !MARKETPLACE_LIVE) return;
    void fetchCategoryMenu().then(setTree);
  }, [menuOpen, tree.length]);

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      {/* Üst şerit — iki tarafın giriş cümlesi. */}
      <div className="hidden h-9 bg-zinc-950 text-white/85 md:block">
        <div className="mx-auto flex h-9 max-w-7xl items-center justify-between px-6 text-[13px] lg:px-8">
          <div className="flex items-center gap-4">
            <Link href={signupHref("talep")} className="transition hover:text-white">
              Alıcı mısın? <span className="font-semibold text-white">Talep aç</span>
            </Link>
            <span aria-hidden className="text-white/25">·</span>
            <Link href={signupHref("vitrin")} className="transition hover:text-white">
              Tedarikçi misin? <span className="font-semibold text-white">Firmanı listele</span>
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/nasil-calisir" className="transition hover:text-white">
              Nasıl çalışır
            </Link>
            <Link href={PRICING_HREF} className="transition hover:text-white">
              Fiyatlar
            </Link>
            <span className="text-white/50" aria-label="Dil: Türkçe">
              TR
            </span>
          </div>
        </div>
      </div>

      {/* Ana satır */}
      <div
        className="h-16 border-b border-zinc-950/10 bg-white/95 backdrop-blur"
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:px-6 lg:gap-4 lg:px-8">
          {/* Logonun alt metni "Rothern" — ayrıca sr-only metin KOYMA
              (ekran okuyucu adı iki kez okur). */}
          <Link href="/" className="-m-1.5 shrink-0 p-1.5">
            <RothernLogo variant="full-light" size="sm" priority />
          </Link>

          {MARKETPLACE_LIVE ? (
            <div className="hidden lg:block">
              <MegaMenu />
            </div>
          ) : null}

          <div
            className={cn(
              "mx-auto hidden w-full max-w-xl transition-opacity duration-200 lg:block",
              showSearch ? "opacity-100" : "pointer-events-none opacity-0",
            )}
            aria-hidden={!showSearch}
            /* aria-hidden bir odaklanabilir öğeyi SARMAMALI (aria-hidden-focus):
               gizliyken sekme sırasından da düşsün. */
            inert={!showSearch}
          >
            {MARKETPLACE_LIVE ? <SearchTypeahead size="sm" /> : null}
          </div>

          <nav className="ml-auto hidden items-center gap-4 lg:flex">
            {MARKETPLACE_LIVE ? (
              <Link
                href={MARKETPLACE_ROUTES.demands}
                className="text-sm font-medium whitespace-nowrap text-zinc-600 transition hover:text-zinc-950"
              >
                {MARKETPLACE_LABELS.demands}
              </Link>
            ) : (
              <Link
                href="/nasil-calisir"
                className="text-sm font-medium whitespace-nowrap text-zinc-600 transition hover:text-zinc-950"
              >
                Nasıl Çalışır
              </Link>
            )}
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
          </nav>

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

      {/* Mobil menü — arama, kategori akordeonu, bağlantılar, CTA'lar. */}
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
        <div className="space-y-5" onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setMenuOpen(false); }}>
          {MARKETPLACE_LIVE ? <SearchTypeahead size="sm" /> : null}

          <nav className="flex flex-col">
            {navigation.map((item) => (
              <Link key={item.name} href={item.href} className="-mx-2 rounded-lg px-2 py-2.5 text-base font-semibold text-zinc-900 hover:bg-zinc-50">
                {item.name}
              </Link>
            ))}
            <Link href="/nasil-calisir" className="-mx-2 rounded-lg px-2 py-2.5 text-base font-semibold text-zinc-900 hover:bg-zinc-50">
              Nasıl Çalışır
            </Link>
            <Link href={PRICING_HREF} className="-mx-2 rounded-lg px-2 py-2.5 text-base font-semibold text-zinc-900 hover:bg-zinc-50">
              Fiyatlar
            </Link>
          </nav>

          {tree.length > 0 ? (
            <div className="border-t border-zinc-950/5 pt-3">
              <p className="mb-1 text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">Kategoriler</p>
              {tree.slice(0, 12).map((seg) => (
                <Disclosure key={seg.id} title={seg.name} buttonClassName="py-2 text-sm font-medium">
                  <ul className="space-y-1 pb-2">
                    {(seg.children.length > 0 ? seg.children : [{ id: seg.id, name: `Tüm ${seg.name}`, count: seg.count }]).map((c) => (
                      <li key={c.id}>
                        <Link href={categoryPath(c.id, c.name)} className="block py-1 text-sm text-zinc-600 hover:text-zinc-950">
                          {c.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Disclosure>
              ))}
            </div>
          ) : null}

          <div className="border-t border-zinc-950/5 pt-3 text-sm text-zinc-600">
            <Link href={signupHref("talep")} className="block py-1.5 font-medium text-zinc-900">
              Alıcı mısın? Talep aç
            </Link>
            <Link href={signupHref("vitrin")} className="block py-1.5 font-medium text-zinc-900">
              Tedarikçi misin? Firmanı listele
            </Link>
          </div>
        </div>
      </Sheet>
    </header>
  );
}
