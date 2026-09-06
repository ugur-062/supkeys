"use client";

import { CategoryTile } from "@/components/marketplace/category-tile";
import type { ShowcaseCategory } from "@/lib/public/category-showcase";
import { ArrowRightIcon } from "@heroicons/react/20/solid";
import Link from "next/link";

/**
 * PANEL KATEGORİ VİTRİNİ — Europages'in kategori ızgarası, Rothern kartıyla
 * (2026-09-05). Anasayfadaki `CategoryGrid` ile AYNI anatomi (16:10 fotoğraf
 * üstte, ad + sayı altta); fark yalnız hedef: satınalmada süzgeçli ürün
 * sonuçları (`?kategori=`), satışta açık talepler listesi (`?kategori=`).
 * Fotoğraflar `category-photos.ts` (58/58); yoksa tonlu segment ikonu.
 */
export function CategoryShowcasePanel({
  title,
  lead,
  items,
  hrefFor,
  countNoun,
  allHref,
  allLabel,
}: {
  title: string;
  lead: string;
  items: ShowcaseCategory[];
  hrefFor: (id: string) => string;
  /** "ürün" / "açık talep" — sayının birimi. */
  countNoun: string;
  allHref: string;
  allLabel: string;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-label={title}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-950">{title}</h2>
          <p className="mt-1 text-sm text-zinc-500">{lead}</p>
        </div>
        <Link href={allHref} className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-900 hover:text-zinc-600">
          {allLabel}
          <ArrowRightIcon aria-hidden className="size-4" />
        </Link>
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {items.slice(0, 8).map((c) => (
          <li key={c.id}>
            <CategoryTile category={c} href={hrefFor(c.id)} countNoun={countNoun} />
          </li>
        ))}
      </ul>
    </section>
  );
}

