import { allCitySlugs, cityCompanyPath, cityProductPath } from "@/lib/public/city";
import Link from "next/link";

/**
 * ŞEHİR BAĞLANTI ŞERİDİ — iç bağlantı ağı (2026-09-09, Parça 3).
 *
 * Şehir sayfalarının var olması yetmez; tarayıcının onlara ULAŞMASI gerekir.
 * Sitemap keşfi sağlar, iç bağlantı OTORİTE aktarır — ikisi ayrı işlerdir.
 *
 * Yalnız VERİSİ OLAN iller basılır (`cities` facet sayımından gelir): sıfır
 * sonuçlu 81 il bağlantısı hem kullanıcıyı boş sayfaya götürür hem tarama
 * bütçesini yer. Facet yoksa şerit HİÇ çizilmez.
 */
export function CityLinks({
  cities,
  kind,
  activeCity,
}: {
  cities: { city: string; count: number }[];
  kind: "products" | "companies";
  activeCity?: string;
}) {
  const known = new Set(allCitySlugs().map((c) => c.name));
  const list = cities
    .filter((c) => c.count > 0 && known.has(c.city) && c.city !== activeCity)
    .sort((a, b) => b.count - a.count)
    .slice(0, 24);
  if (list.length === 0) return null;

  const href = kind === "products" ? cityProductPath : cityCompanyPath;
  const heading = kind === "products" ? "Şehre göre ürünler" : "Şehre göre firmalar";

  return (
    <section className="mx-auto mt-10 max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
      <h2 className="text-sm font-semibold text-zinc-900">{heading}</h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {list.map((c) => (
          <li key={c.city}>
            <Link
              href={href(c.city)}
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm text-zinc-700 ring-1 ring-zinc-950/10 ring-inset transition hover:text-zinc-950 hover:ring-zinc-950/20"
            >
              {c.city}
              <span className="text-xs text-zinc-500 tabular-nums">{c.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
