"use client";

import { ArrowRightIcon } from "@heroicons/react/20/solid";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export type KpiAccent = "brand" | "warning" | "success" | "indigo" | "danger";

/** Etiket başındaki küçük renkli nokta — yalnızca durum vurgusu olanlarda. */
const ACCENT_DOT: Record<KpiAccent, string | null> = {
  brand: null,
  indigo: null,
  warning: "bg-warning-500",
  success: "bg-success-500",
  danger: "bg-danger-500",
};

interface DashboardKpiCardProps {
  label: string;
  value: string | number;
  hint?: string;
  /** Hint yanında ⚠️ uyarı ikonu */
  warning?: boolean;
  /** Tıklanabilir kart için href */
  href?: string;
  accent?: KpiAccent;
  /** Başlık yanında küçük (i) tooltip (opsiyonel) */
  titleAfter?: ReactNode;
}

/**
 * Dashboard KPI kartı — tedarikçi panelindeki KpiCard ile birebir aynı:
 * ring-1 ring-zinc-950/5, font-semibold zinc-950 rakam, sol şerit yok,
 * etiket başında opsiyonel durum noktası + sağ üstte → ok ikonu (href varsa).
 */
export function DashboardKpiCard({
  label,
  value,
  hint,
  warning,
  href,
  accent = "brand",
  titleAfter,
}: DashboardKpiCardProps) {
  const dot = ACCENT_DOT[accent];

  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          {dot ? (
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} />
          ) : null}
          <p className="text-sm font-bold text-zinc-800 leading-snug">
            {label}
          </p>
          {titleAfter}
        </div>
        {href ? (
          <ArrowRightIcon className="h-4 w-4 shrink-0 text-zinc-300 transition-colors group-hover:text-zinc-500" />
        ) : null}
      </div>
      <p className="mt-3 text-3xl font-semibold tabular-nums text-zinc-950">
        {value}
      </p>
      {hint ? (
        <p className="mt-1 flex items-start gap-2 text-xs text-zinc-500">
          <span className="flex-1 leading-snug">{hint}</span>
          {warning ? (
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-warning-500" />
          ) : null}
        </p>
      ) : null}
    </>
  );

  const base = `group block h-full rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5 transition${
    href ? " hover:shadow-md" : ""
  }`;

  return href ? (
    <Link href={href} className={base}>
      {inner}
    </Link>
  ) : (
    <div className={base}>{inner}</div>
  );
}
