/**
 * Günlük mini çubuk grafiği (SVG, bağımlılık yok) — Ziyaret Edenler ve
 * Genel Bakış ziyaretçi kartı. Her çubukta erişilebilir başlık (gün · sayı).
 */
export function MiniBars({
  data,
  height = 48,
  accent = "blue",
  className,
  ariaLabel = "Günlük görüntülenme",
}: {
  data: { date: string; views: number }[];
  height?: number;
  accent?: "blue" | "emerald" | "zinc";
  className?: string;
  ariaLabel?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.views));
  const n = Math.max(1, data.length);
  const gap = 2;
  const w = 100;
  const bw = Math.max(1, (w - gap * (n - 1)) / n);
  const fill = accent === "blue" ? "#2563eb" : accent === "emerald" ? "#059669" : "#71717a";
  const fmt = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" });
  };
  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      className={className}
      style={{ width: "100%", height }}
    >
      {data.map((d, i) => {
        const h = d.views > 0 ? Math.max(2, (d.views / max) * (height - 2)) : 1.5;
        return (
          <rect
            key={d.date}
            x={i * (bw + gap)}
            y={height - h}
            width={bw}
            height={h}
            rx={Math.min(1.5, bw / 2)}
            fill={d.views > 0 ? fill : "#e4e4e7"}
            opacity={d.views > 0 ? 0.9 : 1}
          >
            <title>{`${fmt(d.date)} · ${d.views}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

/** Yatay oran çubuğu — "en çok bakılan ürünler" / "şehirler" listeleri. */
export function RatioBar({ value, max, accent = "blue" }: { value: number; max: number; accent?: "blue" | "emerald" | "zinc" }) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  const cls = accent === "blue" ? "bg-blue-500" : accent === "emerald" ? "bg-emerald-500" : "bg-zinc-500";
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-zinc-100" aria-hidden>
      <span className={`block h-full rounded-full ${cls}`} style={{ width: `${pct}%` }} />
    </span>
  );
}
