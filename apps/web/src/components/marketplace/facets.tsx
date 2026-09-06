import Link from "next/link";

/**
 * Bağlantı tabanlı süzgeç çipi — `PublicListPage`nin JS'siz `chips` modu
 * (bugün hiçbir liste kullanmıyor; üç dizin de istemci kabuğunda — PROMPT 4).
 * `FacetGroup` (bağlantı listesi) kaldırıldı: yerine `filter-primitives`.
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
