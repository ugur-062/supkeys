import { MARKETPLACE_ROUTES, categoryPath } from "@/lib/public/marketplace";
import { ArrowRightIcon } from "@heroicons/react/20/solid";
import Link from "next/link";

/**
 * "POPÜLER KATEGORİLER" çip'leri — arama logu yok; ürün sayısı en yüksek
 * 20 alt kategori (`public/stats.popularCategories`). Boşsa çizilmez.
 */
export function PopularChips({ items }: { items: { id: string; name: string; count: number }[] }) {
  if (items.length === 0) return null;
  return (
    <section className="mx-auto max-w-7xl px-6 py-10 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-zinc-950">Popüler kategoriler</h2>
        <Link href={MARKETPLACE_ROUTES.products} className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-900 hover:text-zinc-600">
          Tüm kategoriler
          <ArrowRightIcon aria-hidden className="size-4" />
        </Link>
      </div>
      <ul className="mt-4 flex flex-wrap gap-2">
        {items.map((c) => (
          <li key={c.id}>
            <Link href={categoryPath(c.id, c.name)} className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1.5 text-sm text-zinc-700 transition hover:bg-zinc-200">
              {c.name}
              <span className="text-xs text-zinc-400">{c.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
