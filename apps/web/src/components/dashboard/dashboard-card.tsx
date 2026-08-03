"use client";

import {
  DashboardKpiCard,
  type KpiAccent,
} from "@/components/dashboard/dashboard-kpi-card";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import type { ReactNode } from "react";

/**
 * Ortak KPI kartı — DashboardKpiCard'ın sparkline/değişim destekli üst
 * katmanı (kopya değil, sarmalayıcı). Değişim yüzdesi ve trend YALNIZ
 * gerçek veri varsa çizilir; geçmişi olmayan sayaçlarda kart sade kalır
 * (uydurma trend yok). İki panel de bunu kullanır.
 */
export function DashboardCard({
  label,
  value,
  hint,
  href,
  accent,
  warning,
  titleAfter,
  /** Geçen döneme göre değişim (%) — veri varsa. */
  changePct,
  /** Mini sparkline — veri varsa. */
  spark,
}: {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
  accent?: KpiAccent;
  warning?: boolean;
  titleAfter?: ReactNode;
  changePct?: number | null;
  spark?: { key: string; value: number }[];
}) {
  const changeText =
    changePct == null
      ? undefined
      : `${changePct >= 0 ? "+" : ""}%${Math.abs(Math.round(changePct))} geçen döneme göre`;
  const showSpark = !!spark && spark.some((s) => s.value > 0);
  return (
    <div className="relative">
      <DashboardKpiCard
        label={label}
        value={value}
        hint={changeText ?? hint}
        href={href}
        accent={accent}
        warning={warning}
        titleAfter={titleAfter}
      />
      {showSpark ? (
        <div
          className="pointer-events-none absolute right-4 bottom-4 h-8 w-20 opacity-70"
          aria-hidden
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark}>
              <Area
                type="monotone"
                dataKey="value"
                stroke="#a1a1aa"
                strokeWidth={1.25}
                fill="transparent"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </div>
  );
}
