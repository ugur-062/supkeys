import Link from "next/link";

/**
 * Sayfalama — bağlantı tabanlı (buton değil), çünkü tarayıcı botu yalnız
 * <a href> izler. `rel="prev"/"next"` bot için sıralama ipucu.
 */
export function Pagination({
  page,
  total,
  pageSize,
  basePath,
  params,
}: {
  page: number;
  total: number;
  pageSize: number;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  if (lastPage <= 1) return null;

  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    if (p > 1) sp.set("sayfa", String(p));
    const q = sp.toString();
    return q ? `${basePath}?${q}` : basePath;
  };

  return (
    <nav
      aria-label="Sayfalama"
      className="mt-10 flex items-center justify-between border-t border-zinc-200 pt-6"
    >
      {page > 1 ? (
        <Link
          href={href(page - 1)}
          rel="prev"
          className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          ← Önceki
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-zinc-500">
        Sayfa {page} / {lastPage}
      </span>
      {page < lastPage ? (
        <Link
          href={href(page + 1)}
          rel="next"
          className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Sonraki →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
