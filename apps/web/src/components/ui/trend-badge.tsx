import { cn } from "@/lib/utils";
import { ArrowDownIcon, ArrowUpIcon } from "@heroicons/react/20/solid";

/**
 * Tailwind Plus "data-display/stats" with-trending deseni — bir metriğin
 * önceki döneme göre yüzde değişimini yeşil(↑)/kırmızı(↓) rozetle gösterir.
 */
export function TrendBadge({
  current,
  previous,
  suffix = "geçen aya göre",
  className,
}: {
  current: number;
  previous: number;
  suffix?: string;
  className?: string;
}) {
  // Önceki dönem 0 ise: artış varsa yeni, yoksa nötr.
  const pct =
    previous <= 0
      ? current > 0
        ? 100
        : 0
      : Math.round(((current - previous) / previous) * 100);
  const up = pct >= 0;

  return (
    <span className={cn("mt-1 flex items-center gap-1 text-xs", className)}>
      <span
        className={cn(
          "inline-flex items-center gap-1 font-semibold",
          up ? "text-emerald-600" : "text-rose-600",
        )}
      >
        {up ? (
          <ArrowUpIcon className="size-3.5" />
        ) : (
          <ArrowDownIcon className="size-3.5" />
        )}
        {Math.abs(pct)}%
      </span>
      <span className="text-zinc-400">{suffix}</span>
    </span>
  );
}
