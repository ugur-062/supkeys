import { cn } from "@/lib/utils";
import { ChevronRightIcon, HomeIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { Fragment } from "react";

export interface BreadcrumbItem {
  label: string;
  /** Son öğe (mevcut sayfa) href taşımaz. */
  href?: string;
}

/**
 * KIRINTI — son öğe `aria-current="page"`, uzun etiketler kısalır, mobilde
 * yalnız son iki öğe görünür (öncekiler `sm:` ile açılır). Sunucu bileşeni.
 *
 * AYRAÇ ">" (chevron) ve isteğe bağlı EV İKONU (2026-09-08, kullanıcı
 * referansı — kaynak kalıp): eğik çizgi ayraç metinle karışıyordu ("Ürün Ara
 * / Marmara Gıda" bir yol gibi değil bir cümle gibi okunuyordu). Ev ikonu
 * yalnız `home` verilirse çizilir; ikon dekoratif, adı `sr-only` metinde.
 */
export function Breadcrumb({
  items,
  home,
  className,
}: {
  items: BreadcrumbItem[];
  /** Baştaki ev ikonu bağlantısı (public "/", panelde portal anasayfası). */
  home?: { href: string; label?: string };
  className?: string;
}) {
  const last = items.length - 1;
  return (
    <nav aria-label="Yol" className={cn("text-sm text-zinc-500", className)}>
      <ol className="flex items-center gap-1">
        {home ? (
          <>
            <li className="shrink-0">
              <Link href={home.href} className="block text-zinc-400 transition hover:text-zinc-700">
                <HomeIcon aria-hidden className="size-4" />
                <span className="sr-only">{home.label ?? "Anasayfa"}</span>
              </Link>
            </li>
            <li aria-hidden className="shrink-0 text-zinc-300">
              <ChevronRightIcon className="size-4" />
            </li>
          </>
        ) : null}
        {items.map((it, i) => {
          const isLast = i === last;
          const mobileHidden = i < last - 1;
          return (
            <Fragment key={`${it.label}-${i}`}>
              <li className={cn("min-w-0", mobileHidden && "hidden sm:block")}>
                {isLast || !it.href ? (
                  <span aria-current={isLast ? "page" : undefined} className="block max-w-[14rem] truncate text-zinc-900 sm:max-w-xs">
                    {it.label}
                  </span>
                ) : (
                  <Link href={it.href} className="block max-w-[12rem] truncate hover:text-zinc-900">
                    {it.label}
                  </Link>
                )}
              </li>
              {!isLast ? (
                <li aria-hidden className={cn("shrink-0 text-zinc-300", mobileHidden && "hidden sm:block")}>
                  <ChevronRightIcon className="size-4" />
                </li>
              ) : null}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
