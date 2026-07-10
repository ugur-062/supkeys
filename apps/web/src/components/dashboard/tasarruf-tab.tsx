"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { InfoTooltip } from "./info-tooltip";
import { PeriodToggle, type Period } from "./period-toggle";

export interface SavingsMetrics {
  totalSavings: number; // TRY
  totalVolume: number; // TRY
  averageSavingsRate: number; // %, 0..100
}

export interface TopSavingTender {
  rank: number;
  tenderNumber: string;
  title: string;
  amount: number; // TRY tasarruf
}

export interface CategoryBreakdownRow {
  label: string;
  /** Yüzde 0..100 */
  percent: number;
}

export interface CurrencyBreakdownRow {
  /** "TRY" gibi kod veya "Ana Para Birimi 2" placeholder */
  label: string;
  /** undefined → veri yok (kesik çizgi placeholder) */
  percent?: number;
}

export interface TasarrufTabData {
  month: SavingsMetrics;
  year: SavingsMetrics;
  topSavingsMonth: TopSavingTender[];
  topSavingsYear: TopSavingTender[];
  categoryMonth: CategoryBreakdownRow[];
  categoryYear: CategoryBreakdownRow[];
  currencyMonth: CurrencyBreakdownRow[];
  currencyYear: CurrencyBreakdownRow[];
}

interface Props {
  data: TasarrufTabData;
}

const TOOLTIP_SAVINGS =
  "İhalelerdeki tüm kalemler için, kalem bazında En iyi ilk teklif ve En iyi son teklif arasındaki farkın, ilgili kalem miktarıyla çarpılıp toplanması ile elde edilir.";
const TOOLTIP_VOLUME =
  "Kazandırılan ihalelerde, kazanan kalemlerin (birim fiyat × miktar) toplamı.";
const TOOLTIP_RATE =
  "Toplam tasarruf / toplam işlem hacmi oranı. Genel verimlilik göstergesi.";
const TOOLTIP_TOP5 =
  "Seçilen dönemde, kalem-bazlı tasarruf hesabıyla bulduğumuz en yüksek tasarruflu 5 ihale.";
const TOOLTIP_CATEGORY =
  "Kategori bazında ortalama tasarruf oranı (en az 1 kazandırılmış ihalesi olan kategoriler).";
const TOOLTIP_CURRENCY =
  "İhale ana para birimine göre tasarruf oranı (TRY equivalent baz alınır).";

export function TasarrufTab({ data }: Props) {
  const [globalPeriod, setGlobalPeriod] = useState<Period>("month");
  const [topPeriod, setTopPeriod] = useState<Period>("month");
  const [categoryPeriod, setCategoryPeriod] = useState<Period>("month");
  const [currencyPeriod, setCurrencyPeriod] = useState<Period>("month");

  const metrics = globalPeriod === "month" ? data.month : data.year;
  const topRows =
    topPeriod === "month" ? data.topSavingsMonth : data.topSavingsYear;
  const categoryRows =
    categoryPeriod === "month" ? data.categoryMonth : data.categoryYear;
  const currencyRows =
    currencyPeriod === "month" ? data.currencyMonth : data.currencyYear;

  return (
    <div className="space-y-6">
      {/* Sağ üstte global dönem filtre */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <PeriodToggle value={globalPeriod} onChange={setGlobalPeriod} />
        <button
          type="button"
          className="text-xs font-semibold text-zinc-700 hover:text-zinc-900"
        >
          Hesaplama Kriterlerini İncele
        </button>
      </div>

      {/* 3 metrik kartı */}
      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-zinc-950/5">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <Metric
            label="Toplam Tasarrufum"
            value={formatTRY(metrics.totalSavings)}
            tooltip={TOOLTIP_SAVINGS}
            accent="success"
          />
          <Metric
            label="Toplam İşlem Hacmim"
            value={formatTRY(metrics.totalVolume)}
            tooltip={TOOLTIP_VOLUME}
            accent="brand"
          />
          <Metric
            label="Ortalama Tasarruf Oranım"
            value={formatPercent(metrics.averageSavingsRate)}
            tooltip={TOOLTIP_RATE}
            accent="indigo"
          />
        </div>
      </section>

      {/* En Yüksek Tasarruflu 5 İhalem */}
      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-zinc-950/5">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-zinc-950">
              En Yüksek Tasarruflu 5 İhalem
            </h2>
            <InfoTooltip content={TOOLTIP_TOP5} />
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <span
                aria-hidden
                className="h-2 w-2 rounded-full bg-success-500"
              />
              En yüksek tasarruflu ihale
            </span>
            <PeriodToggle value={topPeriod} onChange={setTopPeriod} />
          </div>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Sol — sıralı liste */}
          <ul className="divide-y divide-slate-100">
            {topRows.map((r) => (
              <li
                key={r.tenderNumber}
                className="flex items-center gap-3 py-3"
              >
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold text-zinc-700">
                  {r.rank}
                </span>
                <span className="tabular-nums text-xs text-slate-500">
                  #{r.tenderNumber}
                </span>
                <span className="flex-1 truncate text-sm text-zinc-900">
                  {r.title}
                </span>
                <span className="font-mono text-sm font-semibold text-success-700">
                  {formatTRY(r.amount)}
                </span>
              </li>
            ))}
          </ul>

          {/* Sağ — bar chart */}
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topRows.map((r) => ({
                  rank: r.rank,
                  amount: r.amount,
                }))}
                margin={{ top: 20, right: 20, bottom: 8, left: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-slate-200, #e2e8f0)"
                />
                <XAxis
                  dataKey="rank"
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => abbreviateTRY(Number(v))}
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                  width={70}
                />
                <Tooltip
                  cursor={{ fill: "rgba(59,107,255,0.06)" }}
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    fontSize: 12,
                  }}
                  formatter={(v) => [formatTRY(Number(v)), "Tasarruf"]}
                  labelFormatter={(rank) => `#${String(rank)}. İhale`}
                />
                <Bar
                  dataKey="amount"
                  fill="var(--color-success-500, #10b981)"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
            <p className="mt-1 text-right text-xs font-medium text-slate-500">
              Tasarruf Tutarı
            </p>
          </div>
        </div>
      </section>

      {/* 2 yatay-bar kart */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BreakdownCard
          title="Ana Kategori Bazlı Tasarrufum"
          tooltip={TOOLTIP_CATEGORY}
          period={categoryPeriod}
          onPeriodChange={setCategoryPeriod}
          rows={categoryRows.map((r) => ({ label: r.label, percent: r.percent }))}
          color="brand"
        />
        <BreakdownCard
          title="Ana Para Birimi Bazlı Tasarrufum"
          tooltip={TOOLTIP_CURRENCY}
          period={currencyPeriod}
          onPeriodChange={setCurrencyPeriod}
          rows={currencyRows}
          color="indigo"
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────────────────────

function Metric({
  label,
  value,
  tooltip,
  accent,
}: {
  label: string;
  value: string;
  tooltip: string;
  accent: "brand" | "success" | "indigo";
}) {
  const accentColor: Record<typeof accent, string> = {
    brand: "text-zinc-900",
    success: "text-success-700",
    indigo: "text-zinc-700",
  };
  return (
    <div>
      <p className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
        <InfoTooltip content={tooltip} />
        <span>{label}</span>
      </p>
      <p
        className={`mt-2 text-2xl font-bold tabular-nums ${accentColor[accent]}`}
      >
        {value}
      </p>
    </div>
  );
}

function BreakdownCard({
  title,
  tooltip,
  period,
  onPeriodChange,
  rows,
  color,
}: {
  title: string;
  tooltip: string;
  period: Period;
  onPeriodChange: (p: Period) => void;
  rows: Array<{ label: string; percent?: number }>;
  color: "brand" | "indigo";
}) {
  const fill =
    color === "brand"
      ? "bg-zinc-900"
      : "bg-zinc-500";

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-zinc-950/5">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <InfoTooltip content={tooltip} />
          <h3 className="text-sm font-semibold text-zinc-950">
            {title}
          </h3>
        </div>
        <PeriodToggle value={period} onChange={onPeriodChange} />
      </header>

      <ul className="space-y-4">
        {rows.map((r, i) => {
          const hasData = typeof r.percent === "number";
          return (
            <li key={i}>
              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-slate-700" title={r.label}>
                  {r.label}
                </span>
                <span className="font-mono font-semibold text-zinc-900">
                  {hasData ? `${(r.percent as number).toFixed(2)}%` : "—"}
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                {hasData ? (
                  <div
                    className={`h-full ${fill} transition-[width] duration-300`}
                    style={{ width: `${Math.min(100, r.percent as number)}%` }}
                  />
                ) : (
                  <div className="h-full w-full bg-[repeating-linear-gradient(45deg,transparent_0_4px,#e2e8f0_4px_8px)]" />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function formatTRY(amount: number): string {
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatPercent(p: number): string {
  if (!Number.isFinite(p)) return "—";
  return `%${p.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}`;
}

function abbreviateTRY(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(0)}Mr ₺`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M ₺`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K ₺`;
  return `${n} ₺`;
}
