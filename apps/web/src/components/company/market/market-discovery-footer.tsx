import Link from "next/link";

/**
 * KEŞİF ALTLIĞI — listenin altında gezinmeye devam edecek bağlantılar.
 *
 * Yalnız GERÇEK envanterden beslenir: sayaçlar listenin kendi facet
 * yanıtından gelir. Brifin önerdiği "popüler aramalar" ve "hızlı yanıt
 * veren" rozetleri BURADA YOK — arama sorgusu logu ve yanıt süresi ölçümü
 * tutulmuyor, uydurma sayı basmak yerine bölüm hiç çizilmiyor (aynı
 * gerekçeyle "N tedarikçi inceledi" de basılmıyor).
 */
export function MarketDiscoveryFooter({
  cities,
  categories,
  cityHref,
  categoryHref,
}: {
  cities: { city: string; count: number }[];
  categories: { id: string; name: string; count: number }[];
  cityHref: (city: string) => string;
  categoryHref: (c: { id: string; name: string }) => string;
}) {
  const topCities = cities.slice(0, 12);
  const topCategories = categories.slice(0, 12);
  if (topCities.length === 0 && topCategories.length === 0) return null;
  return (
    <section aria-labelledby="kesif-altligi" className="border-t border-zinc-200 pt-8">
      <h2 id="kesif-altligi" className="sr-only">
        Keşfetmeye devam edin
      </h2>
      <div className="grid gap-8 sm:grid-cols-2">
        {topCategories.length > 0 ? (
          <Block title="Sektöre göre">
            {topCategories.map((c) => (
              <Item key={c.id} href={categoryHref(c)} label={c.name} count={c.count} />
            ))}
          </Block>
        ) : null}
        {topCities.length > 0 ? (
          <Block title="Şehre göre tedarikçiler">
            {topCities.map((c) => (
              <Item key={c.city} href={cityHref(c.city)} label={c.city} count={c.count} />
            ))}
          </Block>
        ) : null}
      </div>
    </section>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">{title}</h3>
      <ul className="mt-3 flex flex-wrap gap-2">{children}</ul>
    </div>
  );
}

function Item({ href, label, count }: { href: string; label: string; count: number }) {
  return (
    <li>
      <Link
        href={href}
        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-700 transition hover:border-zinc-400 hover:text-zinc-950"
      >
        <span className="max-w-[14rem] truncate">{label}</span>
        <span className="tnum text-xs text-zinc-500">{count}</span>
      </Link>
    </li>
  );
}
