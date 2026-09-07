import { MARKETPLACE_LABELS, MARKETPLACE_ROUTES } from "@/lib/public/marketplace";
import Link from "next/link";

/**
 * ARAMA SONUCU SEKMELERİ — "aynı sorgu, öteki yüzey" (2026-09-07).
 *
 * Europages spec §8.2'nin karşılığı. Orada ayrı bir `/arama` rotası var;
 * BİZDE AYRI ROTA AÇILMADI — `/urunler?q=` ile aynı içeriği ikinci bir
 * adreste sunmak yinelenen içerik (SEO) demek olurdu ve URL şemasını sabit
 * tutma kararına aykırı. Kazanç aynı: kullanıcı bir kez arıyor, sonucu üç
 * yüzeyde de görebiliyor.
 *
 * SAYAÇ YALNIZ ARAMA VARKEN. Aramasız gezinen kullanıcı için "Firmalar 20"
 * bir bilgi değil gürültü; ayrıca her liste sayfasında iki ek istek demek
 * olurdu. Sayacı bilinmeyen sekme sayısız çizilir — 0 BASILMAZ, çünkü "0"
 * ile "bilmiyorum" farklı şeyler (aynı kural panel sekmelerinde de var).
 */
export type SearchSurface = "products" | "companies" | "listings";

export function PublicSearchTabs({
  active,
  q,
  counts,
}: {
  active: SearchSurface;
  /** Arama terimi — sekmeye taşınır, kullanıcı yeniden yazmasın. */
  q?: string;
  /** Yüzey başına toplam. Yalnız `q` varken doldurulur. */
  counts?: Partial<Record<SearchSurface, number>>;
}) {
  const href = (path: string) => (q ? `${path}?q=${encodeURIComponent(q)}` : path);
  const tabs: { key: SearchSurface; label: string; href: string }[] = [
    { key: "products", label: MARKETPLACE_LABELS.products, href: href(MARKETPLACE_ROUTES.products) },
    { key: "companies", label: MARKETPLACE_LABELS.companies, href: href(MARKETPLACE_ROUTES.companies) },
    { key: "listings", label: MARKETPLACE_LABELS.demands, href: href(MARKETPLACE_ROUTES.demands) },
  ];
  return (
    <nav aria-label="Sonuç türü" className="mt-6 border-b border-zinc-200">
      <ul className="-mb-px flex flex-wrap gap-x-6">
        {tabs.map((t) => {
          const on = t.key === active;
          const n = counts?.[t.key];
          return (
            <li key={t.key}>
              <Link
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={`inline-flex items-center gap-2 border-b-2 pb-3 text-sm font-medium transition ${
                  on
                    ? "border-zinc-950 text-zinc-950"
                    : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-900"
                }`}
              >
                {t.label}
                {n != null ? (
                  <span
                    className={`tnum rounded-md px-1.5 py-0.5 text-xs ${
                      on ? "bg-zinc-950 text-white" : "bg-zinc-200 text-zinc-700"
                    }`}
                  >
                    {n.toLocaleString("tr-TR")}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
