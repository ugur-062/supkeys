"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
} from "recharts";

/**
 * KPI kartının arka plan sparkline'ı — AYRI DOSYA, çünkü recharts modül
 * seviyesinde import ediliyor.
 *
 * `KpiCard` ile aynı dosyada dururken, yalnız sayı gösteren bir sayfa bile
 * (yeni pano) grafik kütüphanesini rota paketine sokuyordu. Burada dururken
 * `KpiCard` onu TEMBEL yükler: seri yoksa recharts hiç inmez.
 */
export function KpiSparkline({
  spark,
  stroke,
  valueSuffix,
}: {
  spark: { key: string; value: number; label?: string }[];
  stroke: string;
  valueSuffix?: string;
}) {
  return (
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
                  {valueSuffix ?? ""}
                </span>
              </div>
            );
          }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={stroke}
          strokeWidth={1.25}
          fill={stroke}
          fillOpacity={0.12}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
