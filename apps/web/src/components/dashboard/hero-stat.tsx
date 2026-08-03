"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

/**
 * Panel üst şeridi — İKİ panelde de ortak (Satınalma: zaman tasarrufu,
 * Satış: kazanma oranı). Kural: en fazla 1 ana sayı + 3 destek verisi;
 * kırılım/grafik detayları sekmelere gider. Sparkline dekoratiftir
 * (aria-hidden); ana sayı aria-label ile okunur. Veri yoksa "0" değil,
 * kısa açıklama + yönlendirme gösterilir.
 */
export interface HeroStatProps {
  /** Dev tipografili ana metin — ör. "~142 saat kazandın". */
  headline: string;
  /** Ekran okuyucu için tam cümle. */
  ariaLabel: string;
  /** En fazla 3 destek verisi — "·" ile birleştirilir. */
  supports: string[];
  /** Küçük ama okunur "tahmini" ibaresi (Satış'ta boş geçilebilir). */
  note?: string;
  /** Son 6 ay trendi — dekoratif sparkline. */
  spark: { key: string; value: number }[];
  /** Sağ-alt link: "Nasıl hesaplanıyor?" */
  onHowClick?: () => void;
  howLabel?: string;
  /** Veri yoksa: başlık + açıklama + yönlendirme (sayı gösterilmez). */
  empty?: { title: string; body: string; ctaLabel: string; ctaHref: string };
  className?: string;
}

export function HeroStat({
  headline,
  ariaLabel,
  supports,
  note,
  spark,
  onHowClick,
  howLabel = "Nasıl hesaplanıyor?",
  empty,
  className,
}: HeroStatProps) {
  if (empty) {
    return (
      <section
        className={cn(
          "card flex flex-wrap items-center justify-between gap-4 p-6",
          className,
        )}
      >
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-[-0.01em] text-slate-950">
            {empty.title}
          </h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-slate-500">
            {empty.body}
          </p>
        </div>
        <Link
          href={empty.ctaHref}
          className="inline-flex shrink-0 items-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
        >
          {empty.ctaLabel}
        </Link>
      </section>
    );
  }

  const hasSpark = spark.some((s) => s.value > 0);
  return (
    <section
      className={cn("card p-6", className)}
      aria-label={ariaLabel}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p
            className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl"
            aria-hidden
          >
            {headline}
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            {supports.slice(0, 3).join(" · ")}
          </p>
          {note ? (
            <p className="mt-1 text-xs text-slate-400">{note}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-1 sm:w-48 sm:items-end">
          {hasSpark ? (
            <div className="h-14 w-full sm:w-48" aria-hidden>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={spark}>
                  <defs>
                    <linearGradient id="heroSpark" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#18181b" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="#18181b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#18181b"
                    strokeWidth={1.5}
                    fill="url(#heroSpark)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : null}
          {onHowClick ? (
            <button
              type="button"
              onClick={onHowClick}
              className="text-xs font-semibold text-slate-500 underline transition hover:text-slate-900 sm:text-right"
            >
              {howLabel}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
