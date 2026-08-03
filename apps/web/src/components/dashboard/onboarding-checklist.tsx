"use client";

import { DASH_CARD } from "@/components/dashboard/analytics-primitives";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";

/**
 * Firma verisi boşken grafiklerin yerine gösterilen kontrol listesi —
 * ilerleme çubuğu + sıradaki adıma CTA. Adım durumları GERÇEK veriden
 * beslenir (props), varsayım yok.
 */
export function OnboardingChecklist({
  steps,
}: {
  steps: { key: string; label: string; done: boolean; href: string }[];
}) {
  const doneCount = steps.filter((st) => st.done).length;
  const pct = Math.round((doneCount / Math.max(1, steps.length)) * 100);
  const next = steps.find((st) => !st.done);
  return (
    <section className={DASH_CARD} aria-label="Başlangıç kontrol listesi">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium text-slate-500">Başlangıç</h2>
        <span className="text-xs tabular-nums text-slate-400">
          {doneCount}/{steps.length}
        </span>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-label="Başlangıç ilerlemesi"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <ul className="mt-3 space-y-2">
        {steps.map((st) => (
          <li key={st.key} className="flex items-center gap-2">
            {st.done ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
            ) : (
              <Circle className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
            )}
            <Link
              href={st.href}
              className={cn(
                "text-sm hover:underline",
                st.done ? "text-slate-400 line-through" : "text-slate-700",
              )}
            >
              {st.label}
            </Link>
          </li>
        ))}
      </ul>
      {next ? (
        <Link
          href={next.href}
          className="mt-3 inline-flex items-center rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-800"
        >
          Sıradaki adım: {next.label}
        </Link>
      ) : null}
    </section>
  );
}
