// Sunucu VE istemci uyumlu: hook yok; `hrefBuilder` sunucu bileşeninden,
// `onChange` istemci bileşeninden gelir (product-index sunucu, galeri istemci).
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

/**
 * 7 YUVALI sayfa aralığı: toplam ≤ 7 → hepsi; aksi hâlde her zaman 7 yuva
 * (1 … 4 5 6 … 20 / 1 2 3 4 5 … 20 / 1 … 16 17 18 19 20) — düğme sayısı
 * değişmediği için sayfalar arası düzen zıplamaz.
 */
export function pageSlots(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "…", total];
  if (current >= total - 3) return [1, "…", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "…", current - 1, current, current + 1, "…", total];
}

/**
 * SAYFALAMA — `hrefBuilder` verilirse gerçek bağlantılar (SEO: bot yalnız
 * <a href> izler, `rel=prev/next`), yoksa `onChange` ile buton. Tek sayfada
 * çizilmez. Aktif sayfa siyah, `aria-current="page"`.
 */
export function Pagination({
  page,
  total,
  pageSize,
  hrefBuilder,
  onChange,
  className,
}: {
  page: number;
  total: number;
  pageSize: number;
  hrefBuilder?: (page: number) => string;
  onChange?: (page: number) => void;
  className?: string;
}) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  if (last <= 1) return null;
  const slots = pageSlots(page, last);
  const item = (p: number, label: React.ReactNode, opts: { rel?: "prev" | "next"; ariaLabel?: string; active?: boolean } = {}) => {
    const cls = cn(
      "tnum inline-flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-sm font-medium transition",
      opts.active ? "bg-zinc-950 text-white" : "text-zinc-700 hover:bg-zinc-100",
    );
    if (hrefBuilder) {
      return (
        <Link href={hrefBuilder(p)} rel={opts.rel} aria-label={opts.ariaLabel} aria-current={opts.active ? "page" : undefined} className={cls}>
          {label}
        </Link>
      );
    }
    return (
      <button type="button" onClick={() => onChange?.(p)} aria-label={opts.ariaLabel} aria-current={opts.active ? "page" : undefined} className={cls}>
        {label}
      </button>
    );
  };
  return (
    <nav aria-label="Sayfalama" className={cn("flex items-center justify-center gap-1", className)}>
      {page > 1 ? item(page - 1, <ChevronLeft aria-hidden className="size-4" />, { rel: "prev", ariaLabel: "Önceki sayfa" }) : <span className="size-9" aria-hidden />}
      {slots.map((s, i) =>
        s === "…" ? (
          <span key={`e${i}`} aria-hidden className="inline-flex h-9 min-w-9 items-center justify-center text-sm text-zinc-400">
            …
          </span>
        ) : (
          <span key={s}>{item(s, s, { active: s === page, ariaLabel: `Sayfa ${s}` })}</span>
        ),
      )}
      {page < last ? item(page + 1, <ChevronRight aria-hidden className="size-4" />, { rel: "next", ariaLabel: "Sonraki sayfa" }) : <span className="size-9" aria-hidden />}
    </nav>
  );
}
