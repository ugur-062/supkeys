import type { PublicStats } from "@/lib/public/marketplace-api";

/**
 * SAYI ŞERİDİ — gerçek sayımlar (`public/stats`, 10 dk önbellek). Eşik:
 * ürün ≥ 50 VE firma ≥ 20; altında hiç çizilmez ("Ürün 7" envanteri duyurmaz,
 * azlığını ilan eder).
 */
export const STATS_MIN = { products: 50, companies: 20 } as const;

export function StatsStrip({ stats }: { stats: PublicStats }) {
  if (stats.products < STATS_MIN.products || stats.companies < STATS_MIN.companies) return null;
  const items = [
    { n: stats.products, l: "Yayındaki ürün" },
    { n: stats.companies, l: "Firma" },
    { n: stats.categories, l: "Kategori" },
    { n: stats.openDemands, l: "Açık alım talebi" },
  ];
  return (
    <section aria-label="Pazar yeri sayıları" className="border-b border-zinc-950/5 bg-white">
      <dl className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-6 py-8 sm:grid-cols-4 lg:px-8">
        {items.map((i) => (
          <div key={i.l}>
            <dd className="text-3xl font-semibold tracking-tight text-zinc-950 tabular-nums">
              {i.n.toLocaleString("tr-TR")}
            </dd>
            <dt className="mt-1 text-sm text-zinc-500">{i.l}</dt>
          </div>
        ))}
      </dl>
    </section>
  );
}
