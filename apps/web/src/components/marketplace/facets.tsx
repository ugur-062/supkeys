import Link from "next/link";

/**
 * Süzgeç yüzeyi — ilan ve ürün dizinleri ORTAK kullanır.
 *
 * Ayrı kopyalar tutulsaydı iki liste zamanla farklı davranırdı (biri sayıyı
 * gösterir öteki göstermez, biri aktif satırı vurgular öteki vurgulamaz) ve
 * ziyaretçi aynı sitede iki farklı süzgeç öğrenmek zorunda kalırdı.
 */

export function FilterChip({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200"
    >
      {label}
      <span aria-hidden>×</span>
      <span className="sr-only">süzgecini kaldır</span>
    </Link>
  );
}

export function FacetGroup({
  heading,
  items,
}: {
  heading: string;
  items: {
    key: string;
    label: string;
    count: number;
    href: string;
    active: boolean;
  }[];
}) {
  if (items.length === 0) return null;
  return (
    <section className="mb-8">
      <h2 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
        {heading}
      </h2>
      <ul className="mt-3 space-y-1">
        {items.map((i) => (
          <li key={i.key}>
            <Link
              href={i.href}
              className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition ${
                i.active
                  ? "bg-zinc-950 font-medium text-white"
                  : "text-zinc-700 hover:bg-zinc-100"
              }`}
              aria-current={i.active ? "true" : undefined}
            >
              <span className="line-clamp-1">{i.label}</span>
              <span className="shrink-0 text-xs text-zinc-500">{i.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
