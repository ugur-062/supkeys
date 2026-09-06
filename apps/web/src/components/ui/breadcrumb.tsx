import { cn } from "@/lib/utils";
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
 */
export function Breadcrumb({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
  const last = items.length - 1;
  return (
    <nav aria-label="Yol" className={cn("text-sm text-zinc-500", className)}>
      <ol className="flex items-center gap-1">
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
                <li aria-hidden className={cn("shrink-0", mobileHidden && "hidden sm:block")}>
                  /
                </li>
              ) : null}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
