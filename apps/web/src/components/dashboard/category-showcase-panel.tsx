"use client";

import { TONE_CLASS, categoryVisual } from "@/lib/public/category-visual";
import type { ShowcaseCategory } from "@/lib/public/category-showcase";
import { ArrowRightIcon } from "@heroicons/react/20/solid";
import Image from "next/image";
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
            <Tile category={c} href={hrefFor(c.id)} countNoun={countNoun} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Tile({ category: c, href, countNoun }: { category: ShowcaseCategory; href: string; countNoun: string }) {
  const { icon: Icon, tone } = categoryVisual([c.id]);
  const t = TONE_CLASS[tone];
  return (
    <Link
      href={href}
      className="group flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-950/5 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-zinc-950/10"
    >
      {c.imageSrc ? (
        <span className="relative block aspect-[16/10] overflow-hidden bg-zinc-100">
          <Image
            src={c.imageSrc}
            alt=""
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition duration-500 group-hover:scale-105"
          />
        </span>
      ) : (
        <span className={`flex aspect-[16/10] items-center justify-center ${t.surface}`}>
          <Icon aria-hidden strokeWidth={1.25} className={`size-9 ${t.icon}`} />
        </span>
      )}
      <span className="flex items-center gap-3 px-4 py-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-zinc-900">{c.name}</span>
          <span className="block text-xs text-zinc-500 tabular-nums">
            {c.count > 0 ? `${c.count.toLocaleString("tr-TR")} ${countNoun}` : "Keşfet"}
          </span>
        </span>
        <ArrowRightIcon aria-hidden className="size-4 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-500" />
      </span>
    </Link>
  );
}
