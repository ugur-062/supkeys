import { useTranslations } from "next-intl";
import { MARKETPLACE_ROUTES, categoryHref } from "@/lib/public/marketplace";
import { ArrowRightIcon } from "@heroicons/react/20/solid";
import { Link } from "@/i18n/navigation";

/**
 * "POPÜLER KATEGORİLER" çip'leri — arama logu yok; ürün sayısı en yüksek
 * 20 alt kategori (`public/stats.popularCategories`). Boşsa çizilmez.
 */
export function PopularChips({ items }: { items: { id: string; name: string; count: number }[] }) {
  const t = useTranslations("web.marketplace.popularChips");
  if (items.length === 0) return null;
  return (
    <section className="mx-auto max-w-7xl px-6 py-10 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-zinc-950">{t("title")}</h2>
        <Link href={MARKETPLACE_ROUTES.products} className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-900 hover:text-zinc-600">
          {t("all")}
          <ArrowRightIcon aria-hidden className="size-4" />
        </Link>
      </div>
      <ul className="mt-4 flex flex-wrap gap-2">
        {items.map((c) => (
          <li key={c.id}>
            <Link href={categoryHref(c)} className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1.5 text-sm text-zinc-700 transition hover:bg-zinc-200">
              {c.name}
              <span className="text-xs text-zinc-500">{c.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
