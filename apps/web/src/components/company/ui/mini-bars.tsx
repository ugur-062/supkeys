/**
 * Günlük mini çubuk grafiği (SVG, bağımlılık yok) — Ziyaret Edenler ve
 * Genel Bakış ziyaretçi kartı. Her çubukta erişilebilir başlık (gün · sayı).
 */
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@rothern/i18n";
import { intlLocale } from "@/i18n/format";

export function MiniBars({
  data,
  height = 48,
  accent = "blue",
  className,
  ariaLabel,
}: {
  data: { date: string; views: number }[];
  height?: number;
  accent?: "blue" | "emerald" | "zinc";
  className?: string;
  ariaLabel?: string;
}) {
  const t = useTranslations("web.panel.trade.miniBars");
  const locale = useLocale() as Locale;
  const max = Math.max(1, ...data.map((d) => d.views));
  const n = Math.max(1, data.length);
  const w = 100;
  // Çubuk yuvası görünüm genişliğinden türer; aralık yuvanın en çok %25'i.
  // Sabit 2 birim aralık + 1 birim taban genişlikle 90 çubuk 100 birime
  // sığmıyor, 34. çubuktan sonrası çizim alanının DIŞINA düşüyordu
  // (arayüz testi O-042: "90 gün" grafiği boş görünüyordu).
  const slot = w / n;
  const gap = Math.min(2, slot * 0.25);
  const bw = slot - gap;
  const fill = accent === "blue" ? "#2563eb" : accent === "emerald" ? "#059669" : "#71717a";
  const fmt = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    return d.toLocaleDateString(intlLocale(locale), { day: "numeric", month: "short", timeZone: "UTC" });
  };
  return (
    <svg
      role="img"
      aria-label={ariaLabel ?? t("gunlukGoruntulenme")}
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
            x={i * slot}
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
