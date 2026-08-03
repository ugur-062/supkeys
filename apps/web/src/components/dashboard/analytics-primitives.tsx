"use client";

import { cn } from "@/lib/utils";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Minus,
} from "lucide-react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
} from "recharts";

/**
 * Pano yeniden tasarımı — ortak primitive'ler (panelden bağımsız, props'la
 * beslenir): TrendBadge, KpiCard, ChartCard, DashboardEmptyState,
 * FunnelChart. (ActionCenter kendi dosyasına taşındı — action-center.tsx.)
 * Kart standardı: rounded-xl border-slate-200
 * bg-white p-5 shadow-sm; başlık text-sm font-medium text-slate-500.
 * Kural: sahte veri yok — seri boşsa EmptyState, delta yoksa rozet çizilmez.
 */

export const DASH_CARD = "rounded-xl border border-slate-200 bg-white p-5 shadow-sm";

// ── TrendBadge ─────────────────────────────────────────────────────────────
export function TrendBadge({
  pct,
  className,
}: {
  /** null → önceki dönem verisi yok, rozet çizilmez. */
  pct: number | null | undefined;
  className?: string;
}) {
  if (pct == null) return null;
  const up = pct > 0;
  const flat = pct === 0;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold",
        flat
          ? "bg-slate-100 text-slate-600"
          : up
            ? "bg-emerald-50 text-emerald-700"
            : "bg-rose-50 text-rose-700",
        className,
      )}
      aria-label={`Önceki döneme göre yüzde ${Math.abs(pct)} ${flat ? "değişim yok" : up ? "artış" : "azalış"}`}
    >
      <Icon className="h-3 w-3" aria-hidden />%{Math.abs(pct)}
    </span>
  );
}

// ── KpiCard ────────────────────────────────────────────────────────────────
export function KpiCard({
  label,
  value,
  href,
  deltaPct,
  spark,
  accent = "slate",
  attention = false,
  hint,
  valueTitle,
  sparkLabels,
}: {
  label: string;
  value: string | number;
  href: string;
  deltaPct?: number | null;
  /** Son 12 dönem GERÇEK seri — yoksa/boşsa sparkline çizilmez. */
  spark?: { key: string; value: number; label?: string }[];
  /** Panel ana rengi: satınalma blue, satış emerald. */
  accent?: "blue" | "emerald" | "slate";
  /** Aksiyon gerektiren kart — sol renkli şerit. KURAL: yalnız "aksiyon
   *  bekleyen > 0" iken ver, nedenini hint ile söyle (Faz 4.4). */
  attention?: boolean;
  /** Değer altı küçük açıklama — vurgu nedeni / "yalnız TRY" gibi notlar. */
  hint?: string;
  /** Kısaltılmış değerin TAM hali (title/tooltip — Faz 4.5). */
  valueTitle?: string;
  /** Sparkline tooltip'inde değerin birimi (ör. "₺") — yoksa sayı basılır. */
  sparkLabels?: { valueSuffix?: string };
}) {
  const stroke =
    accent === "blue" ? "#2563eb" : accent === "emerald" ? "#059669" : "#64748b";
  const hasSpark = !!spark && spark.some((s) => s.value > 0);
  return (
    <Link
      href={href}
      className={cn(
        DASH_CARD,
        "group relative block overflow-hidden transition-all duration-200 hover:-translate-y-[1px] hover:border-slate-300 hover:shadow-card-hover",
        attention && "border-l-[3px] border-l-amber-500",
      )}
    >
      {hasSpark ? (
        /* Faz 4.3: dekoratif değil — gerçek 12 aylık seri + hover tooltip. */
        <div className="absolute inset-x-0 bottom-0 h-10 opacity-40">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark}>
              <RTooltip
                cursor={{ stroke: "#94a3b8", strokeWidth: 1 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0]!.payload as {
                    key: string;
                    value: number;
                    label?: string;
                  };
                  return (
                    <div className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm">
                      <span className="font-medium">{p.label ?? p.key}</span>
                      {": "}
                      <span className="tabular-nums">
                        {new Intl.NumberFormat("tr-TR").format(p.value)}
                        {sparkLabels?.valueSuffix ?? ""}
                      </span>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone" dataKey="value" stroke={stroke} strokeWidth={1.25}
                fill={stroke} fillOpacity={0.12} isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : null}
      <div className="relative">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <TrendBadge pct={deltaPct} />
        </div>
        <p
          className="mt-2 text-3xl font-semibold tracking-tight tabular-nums whitespace-nowrap text-slate-950"
          title={valueTitle}
        >
          {value}
        </p>
        {hint ? (
          <p className="mt-1 truncate text-xs text-slate-500">{hint}</p>
        ) : null}
      </div>
    </Link>
  );
}

// ── ChartCard ──────────────────────────────────────────────────────────────
export function ChartCard({
  title,
  subtitle,
  href,
  ariaLabel,
  children,
  className,
  right,
  rangeBadge,
}: {
  title: string;
  /** Grafiğin cevapladığı soru / veri notu (ör. "Yalnız TRY"). */
  subtitle?: string;
  /** Drill-down hedefi — verilirse başlıkta ok linki. */
  href?: string;
  ariaLabel: string;
  children: React.ReactNode;
  className?: string;
  right?: React.ReactNode;
  /** Faz 3: global dönem seçicisine UYAMAYAN kartın kendi aralığı (ör.
   *  "son 12 ay") — sessizce farklı aralık kullanan kart kalmasın. */
  rangeBadge?: string;
}) {
  return (
    <section className={cn(DASH_CARD, className)} aria-label={ariaLabel}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-medium text-slate-500">
            {title}
            {rangeBadge ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                {rangeBadge}
              </span>
            ) : null}
          </h3>
          {subtitle ? (
            <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>
          ) : null}
        </div>
        {right}
        {href ? (
          <Link
            href={href}
            aria-label={`${title} — listeye git`}
            className="rounded p-1 text-slate-400 transition hover:bg-slate-50 hover:text-slate-700"
          >
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        ) : null}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

// ── DashboardEmptyState (grafik alanı — eksen/grid ÇİZMEZ) ────────────────
export function DashboardEmptyState({
  title,
  body,
  ctaLabel,
  ctaHref,
  className,
}: {
  title: string;
  body: string;
  ctaLabel?: string;
  ctaHref?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-48 flex-col items-center justify-center gap-2 rounded-lg bg-slate-50 px-6 text-center",
        className,
      )}
    >
      <p className="text-sm font-medium text-slate-600">{title}</p>
      <p className="max-w-sm text-xs leading-5 text-slate-400">{body}</p>
      {ctaLabel && ctaHref ? (
        <Link
          href={ctaHref}
          className="mt-1 inline-flex items-center rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-800"
        >
          {ctaLabel}
        </Link>
      ) : null}
    </div>
  );
}

// ── ActionCenter ───────────────────────────────────────────────────────────
// ── FunnelChart (div-tabanlı — recharts funnel'ından daha okunur/erişilir) ─
export function FunnelChart({
  stages,
  accent = "blue",
  formatValue = (n) => String(n),
}: {
  stages: { key: string; label: string; count: number }[];
  accent?: "blue" | "emerald";
  formatValue?: (n: number) => string;
}) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  const bar = accent === "blue" ? "bg-blue-600" : "bg-emerald-600";
  return (
    <ol className="space-y-2" aria-label="Süreç hunisi">
      {stages.map((s, i) => {
        const prev = i > 0 ? stages[i - 1]!.count : null;
        const conv =
          prev != null && prev > 0
            ? Math.round((s.count / prev) * 100)
            : null;
        return (
          <li key={s.key}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-slate-500">{s.label}</span>
              <span className="tabular-nums text-slate-700">
                <strong className="text-sm font-semibold text-slate-950">
                  {formatValue(s.count)}
                </strong>
                {conv != null ? (
                  <span className="ml-1.5 text-slate-400">%{conv}</span>
                ) : null}
              </span>
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className={cn("h-full rounded-full", bar)}
                style={{ width: `${Math.max(2, (s.count / max) * 100)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
