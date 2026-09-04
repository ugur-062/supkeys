import { ProductCard } from "./product-card";
import type { ProductIndexCard } from "@/lib/public/marketplace-api";
import { ArrowRightIcon } from "@heroicons/react/20/solid";
import Link from "next/link";

/**
 * YATAY ÜRÜN KAYDIRICISI — Europages "Product recommendation" / "trending".
 * Sunucu bileşeni: CSS scroll-snap, JS yok. Eşik altında hiç çizilmez.
 */
export const CAROUSEL_MIN = 8;

export function ProductCarousel({
  heading,
  lead,
  items,
  href,
  hrefLabel = "Tüm ürünler",
  tone = "white",
}: {
  heading: string;
  lead?: string;
  items: ProductIndexCard[];
  href: string;
  hrefLabel?: string;
  tone?: "white" | "zinc";
}) {
  if (items.length < CAROUSEL_MIN) return null;
  return (
    <section className={tone === "zinc" ? "border-y border-zinc-950/5 bg-zinc-50" : ""}>
      <div className="mx-auto max-w-7xl px-6 py-14 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">{heading}</h2>
            {lead ? <p className="mt-2 max-w-2xl text-base/7 text-zinc-500">{lead}</p> : null}
          </div>
          <Link href={href} className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-900 hover:text-zinc-600">
            {hrefLabel}
            <ArrowRightIcon aria-hidden className="size-4" />
          </Link>
        </div>
        <ul className="-mx-6 mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-2 lg:-mx-8 lg:px-8 [scrollbar-width:thin]">
          {items.map((p) => (
            <li key={`${p.company.slug}/${p.slug}`} className="w-64 shrink-0 snap-start sm:w-72">
              <ProductCard
                product={p}
                companySlug={p.company.slug}
                company={{ name: p.company.name, city: p.company.city, verified: p.company.verified, activities: p.company.activities }}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
