import { MARKETPLACE_ROUTES } from "@/lib/public/marketplace";
import type { PublicFacets } from "@/lib/public/marketplace-api";
import Link from "next/link";

/**
 * Sektör (L1 segment) ızgarası — long-tail'in giriş kapısı.
 *
 * Sayacı OLMAYAN segment gösterilmez: içi boş bir kategori sayfasına bağlantı
 * vermek hem ziyaretçiyi çıkmaza sokar hem de tarayıcı botuna "ince içerik"
 * sinyali verir. Kapsam veriden gelir, elle yazılmış bir listeden değil.
 */
export function SectorGrid({ facets }: { facets: PublicFacets }) {
  const sectors = facets.categories.slice(0, 12);
  if (sectors.length === 0) return null;
  return (
    <section className="border-y border-zinc-200 bg-zinc-50">
      <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
          Sektöre göre gezin
        </h2>
        <p className="mt-2 max-w-2xl text-base/7 text-zinc-600">
          Açık talepler ve ilanlar, Ariba/UNSPSC uyumlu 58 sektör başlığı
          altında sınıflandırılır.
        </p>
        <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sectors.map((s) => (
            <li key={s.id}>
              <Link
                href={`${MARKETPLACE_ROUTES.demands}?kategori=${s.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm transition hover:border-zinc-300 hover:shadow-sm"
              >
                <span className="line-clamp-1 font-medium text-zinc-900">
                  {s.name}
                </span>
                <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                  {s.count}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
