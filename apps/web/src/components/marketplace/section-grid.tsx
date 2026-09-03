import { ArrowRightIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Anasayfadaki envanter bölümü — İLAN ve ÜRÜN bölümleri ORTAK kullanır.
 *
 * EŞİK ALTINDA HİÇ BASILMAZ (2026-09-04): eskiden üç bölüm art arda boş
 * kutu gösteriyor, ziyaretçi üç kez "şu an yok" okuyordu. Boş bölüm yerine
 * her zaman dolu bölümler var (kategori ızgarası, güven bandı, nasıl
 * çalışır). Eşik: ürün ≥ 8, ilan ≥ 3 — tek kart üçte birlik şeridin solunda
 * öksüz kalır ve "yüklenememiş" gibi okunur.
 */
export function SectionGrid({
  heading,
  lead,
  href,
  hrefLabel,
  cards,
  min,
}: {
  heading: string;
  lead: string;
  href: string;
  hrefLabel: string;
  cards: ReactNode[];
  /** Bu sayının altında bölüm çizilmez. */
  min: number;
}) {
  if (cards.length < min) return null;

  return (
    <section className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
            {heading}
          </h2>
          <p className="mt-2 max-w-2xl text-base/7 text-zinc-500">{lead}</p>
        </div>
        <Link
          href={href}
          className="inline-flex items-center gap-1 rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-950 hover:text-white"
        >
          {hrefLabel}
          <ArrowRightIcon aria-hidden className="size-4" />
        </Link>
      </div>
      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cards}
      </div>
    </section>
  );
}
