import { CountUp } from "./count-up";
import type { PublicStats } from "@/lib/public/marketplace-api";

/**
 * SAYI ŞERİDİ — HAREKET metrikleri (B2, 2026-09-04). "56 ürün / 20 firma"
 * envanterin küçüklüğünü ilan ediyordu; "bu hafta 9 yeni ürün · son 24 saatte
 * 8 teklif" ise pazarın YAŞADIĞINI söyler. Gerçek sayımlar (`public/stats`,
 * 10 dk önbellek). Sıfır olan satır basılmaz ("Son 24 saatte 0 teklif" ölü
 * pazar demektir); iki satırdan az kalırsa şerit hiç çizilmez. Envanter eşiği
 * (ürün ≥ 50 ∧ firma ≥ 20) korunur — çok küçük envanterde hareket de yanıltır.
 */
export const STATS_MIN = { products: 50, companies: 20 } as const;

export function StatsStrip({ stats }: { stats: PublicStats }) {
  if (stats.products < STATS_MIN.products || stats.companies < STATS_MIN.companies) return null;
  const items = [
    { n: stats.productsThisWeek, l: "Bu hafta eklenen ürün" },
    { n: stats.bidsLast24h, l: "Son 24 saatte verilen teklif" },
    { n: stats.openDemands, l: "Açık alım talebi" },
    { n: stats.verifiedCompanies, l: "Doğrulanmış firma" },
  ].filter((i) => i.n > 0);
  if (items.length < 2) return null;

  return (
    <section aria-label="Pazar yeri hareketi" className="border-b border-zinc-950/5 bg-white">
      <dl className={`mx-auto grid max-w-7xl grid-cols-2 gap-6 px-6 py-8 lg:px-8 ${items.length >= 4 ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
        {items.map((i) => (
          <div key={i.l}>
            <dd className="text-3xl font-semibold tracking-tight text-zinc-950 tabular-nums">
              <CountUp value={i.n} />
            </dd>
            <dt className="mt-1 text-sm text-zinc-500">{i.l}</dt>
          </div>
        ))}
      </dl>
    </section>
  );
}
