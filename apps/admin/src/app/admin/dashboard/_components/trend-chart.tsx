"use client";

import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Activity } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface TrendChartProps {
  trend: Array<{ date: string; count: number }>;
  loading: boolean;
}

/**
 * Performans audit P-8 — recharts (~150KB gzip) yalnızca bu component
 * mount edildiğinde yüklensin diye ayrı dosyada. Admin dashboard sayfası
 * `next/dynamic` ile import eder; initial JS chunk küçülür.
 */
export function TrendChart({ trend, loading }: TrendChartProps) {
  const data = trend.map((t) => ({
    label: format(new Date(t.date), "d MMM", { locale: tr }),
    count: t.count,
  }));

  return (
    <div className="admin-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-bold text-admin-text">
            İhale Oluşturma Trendi
          </h3>
          <p className="text-xs text-admin-text-muted mt-0.5">
            Son 30 gün, günlük yeni ihale sayısı
          </p>
        </div>
        <Activity className="h-4 w-4 text-admin-text-muted" />
      </div>
      <div style={{ width: "100%", height: 240 }}>
        {loading ? (
          <div className="h-full w-full bg-slate-100 rounded animate-pulse" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#64748b" }}
                tickMargin={8}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#64748b" }}
                allowDecimals={false}
                width={32}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "12px",
                }}
                labelStyle={{ color: "#0f172a", fontWeight: 600 }}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#2563eb"
                strokeWidth={2}
                dot={{ fill: "#2563eb", r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
