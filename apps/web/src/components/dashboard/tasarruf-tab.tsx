"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { InfoTooltip } from "./info-tooltip";
import type { Period } from "./period-toggle";
import { SavingsCriteriaDialog } from "./savings-criteria-dialog";
import { DASH } from "@/lib/dashboard/strings";
import type {
  SatinalmaAnalytics,
  TimeSavingsData,
} from "@/hooks/use-company-dashboard";
import {
  ChartCard,
  DashboardEmptyState,
} from "@/components/dashboard/analytics-primitives";

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
  /** Global dönem — sayfa başındaki TEK seçici (kart içi seçiciler kalktı). */
  period: Period;
  /** Zaman alt bölümü + kriter modalı verisi (time-savings endpoint'i). */
  savings?: TimeSavingsData;
  /** Trend + tutarlı kategori kırılımı (analytics ucu). */
  analytics?: SatinalmaAnalytics;
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

export function TasarrufTab({ data, period, savings, analytics }: Props) {
  // Maliyet kırılımında çeyrek agregatı yok — yıl gösterilir (etiketli, uydurma yok).
  const costPeriod: "month" | "year" = period === "month" ? "month" : "year";
  const [section, setSection] = useState<"cost" | "time">("cost");
  const [criteriaOpen, setCriteriaOpen] = useState(false);

  const metrics = costPeriod === "month" ? data.month : data.year;
  const topRows =
    costPeriod === "month" ? data.topSavingsMonth : data.topSavingsYear;
  const categoryRows =
    costPeriod === "month" ? data.categoryMonth : data.categoryYear;
  const currencyRows =
    costPeriod === "month" ? data.currencyMonth : data.currencyYear;

  return (
    <div className="space-y-6">
      {/* Maliyet / Zaman alt bölümleri + kriter modalı (dönem seçici sayfa başında TEK). */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg bg-zinc-100 p-1">
          {(
            [
              ["cost", DASH.savingsTabCost],
              ["time", DASH.savingsTabTime],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSection(key)}
              className={
                section === key
                  ? "rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 shadow-sm"
                  : "rounded-md px-3 py-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-800"
              }
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setCriteriaOpen(true)}
          className="text-xs font-semibold text-zinc-700 underline hover:text-zinc-900"
        >
          Hesaplama Kriterlerini İncele
        </button>
      </div>
      <SavingsCriteriaDialog
        open={criteriaOpen}
        onClose={() => setCriteriaOpen(false)}
        params={savings?.params}
      />
      {period === "quarter" ? (
        <p className="text-xs text-zinc-400">{DASH.quarterCostNote}</p>
      ) : null}

      {section === "time" ? (
        <TimeSection savings={savings} />
      ) : (
      <>
      {/* Tasarruf trendi: aylık bar + kümülatif çizgi (yalnız TRY ihaleler). */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          title="Tasarruf Trendi"
          subtitle="Aylık tasarruf (bar) + kümülatif (çizgi) — TRY ihaleler; hedef verisi platformda yok"
          ariaLabel="Aylık tasarruf trendi"
          className="lg:col-span-2"
        >
          {analytics && analytics.savingsTrend.some((p) => p.value > 0) ? (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={analytics.savingsTrend}>
                  <CartesianGrid vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <YAxis tickLine={false} axisLine={false} width={48} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <Tooltip formatter={(v, n) => [formatTRY(Number(v ?? 0)), n === "value" ? "Aylık" : "Kümülatif"]} />
                  <Bar dataKey="value" fill="#2563eb" radius={[3, 3, 0, 0]} />
                  <Line type="monotone" dataKey="cumulative" stroke="#1e3a8a" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <DashboardEmptyState
              title="Henüz tasarruf verisi yok"
              body="İlk ihaleni sonuçlandırdığında (hedef fiyatlı kalemlerle) aylık tasarruf burada birikecek."
              ctaLabel="İhale Aç"
              ctaHref="/company/satinalma/ihalelerim/yeni"
            />
          )}
        </ChartCard>
        <ChartCard
          title="Bütçe vs Gerçekleşen"
          ariaLabel="Bütçe karşılaştırması"
        >
          {/* TODO: bütçe varlığı platformda yok — bütçe girişi eklendiğinde
              bullet chart burada çizilecek. Sahte veri basılmaz. */}
          <DashboardEmptyState
            title="Bütçe verisi yok"
            body="Platformda henüz bütçe tanımı tutulmuyor — bütçe girişi geldiğinde bu kart bullet chart olarak dolacak."
          />
        </ChartCard>
      </div>

      {/* 3 metrik kartı */}
      <section className="card p-6">
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
      <section className="card p-6">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-zinc-950">
              En Yüksek Tasarruflu 5 İhalem
            </h2>
            <InfoTooltip content={TOOLTIP_TOP5} />
          </div>
          <span className="flex items-center gap-2 text-xs text-slate-500">
            <span aria-hidden className="h-2 w-2 rounded-full bg-success-500" />
            En yüksek tasarruflu ihale
          </span>
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
          rows={categoryRows.map((r) => {
            const amt = analytics?.categorySavings.find(
              (c) => c.label === r.label,
            )?.amount;
            return {
              label: r.label,
              percent: r.percent,
              amountLabel: amt != null ? formatTRY(amt) : undefined,
            };
          })}
          color="brand"
        />
        <BreakdownCard
          title="Ana Para Birimi Bazlı Tasarrufum"
          tooltip={TOOLTIP_CURRENCY}
          rows={currencyRows}
          color="indigo"
        />
      </div>
      </>
      )}
    </div>
  );
}

/** Zaman alt bölümü — adım bazlı NET dakika kırılımı + ölçülen medyanlar. */
function TimeSection({ savings }: { savings?: TimeSavingsData }) {
  if (!savings) {
    return (
      <div className="h-40 animate-pulse rounded-xl bg-zinc-200/60" aria-hidden />
    );
  }
  const rows = savings.breakdown.filter((r) => r.minutes > 0);
  const total = savings.savedMinutes;
  const fmtH = (min: number) =>
    min >= 90 ? `~${(min / 60).toFixed(1)} sa` : `~${Math.round(min)} dk`;
  const m = savings.measured;
  const fmtMeasured = (h: number | null) =>
    h == null ? "—" : h >= 48 ? `${(h / 24).toFixed(1)} gün` : `${h.toFixed(1)} sa`;
  return (
    <div className="space-y-6">
      <section className="card p-6">
        <h2 className="text-base font-semibold tracking-[-0.01em] text-slate-950">
          {DASH.timeBreakdownTitle}
        </h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          {DASH.timeBreakdownHint}
        </p>
        {rows.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            Bu dönemde hesaba katılacak tamamlanmış iş yok.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {rows.map((r) => (
              <li key={r.key} className="flex items-center gap-3">
                <span className="w-44 shrink-0 text-sm text-slate-600">
                  {r.label}
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
                  <span
                    className="block h-full rounded-full bg-zinc-900"
                    style={{
                      width: `${Math.min(100, (r.minutes / Math.max(1, savings.estimatedMailMinutes)) * 100)}%`,
                    }}
                  />
                </span>
                <span className="w-20 shrink-0 text-right font-mono text-sm tabular-nums text-slate-900">
                  {fmtH(r.minutes)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {total > 0 ? (
          <p className="mt-4 border-t border-zinc-100 pt-3 text-sm text-slate-600">
            Net kazanım:{" "}
            <strong className="text-slate-950">{fmtH(total)}</strong>{" "}
            (sistemde geçen {fmtH(savings.systemMinutes)} düşülmüş)
          </p>
        ) : null}
      </section>

      <section className="card p-6">
        <h2 className="text-base font-semibold tracking-[-0.01em] text-slate-950">
          {DASH.timeMeasuredTitle}
        </h2>
        <dl className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {(
            [
              [DASH.timeMeasuredInvite, m.inviteToFirstBidHours],
              [DASH.timeMeasuredAward, m.closeToAwardHours],
              [DASH.timeMeasuredOrder, m.awardToOrderHours],
            ] as const
          ).map(([label, v]) => (
            <div key={label}>
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-950">
                {fmtMeasured(v)}
              </dd>
            </div>
          ))}
        </dl>
      </section>
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
      <p className="flex items-center gap-2 text-sm font-medium text-slate-600">
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
  rows,
  color,
}: {
  title: string;
  tooltip: string;
  rows: Array<{ label: string; percent?: number; amountLabel?: string }>;
  color: "brand" | "indigo";
}) {
  const fill =
    color === "brand"
      ? "bg-zinc-900"
      : "bg-zinc-500";

  return (
    <section className="card p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <InfoTooltip content={tooltip} />
          <h3 className="text-sm font-semibold text-zinc-950">
            {title}
          </h3>
        </div>
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
                  {r.amountLabel ? (
                    <span className="mr-1.5 text-slate-500">
                      {r.amountLabel}
                    </span>
                  ) : null}
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
                  <div className="h-full w-full bg-[repeating-linear-gradient(45deg,transparent_0_4px,var(--color-zinc-200)_4px_8px)]" />
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
