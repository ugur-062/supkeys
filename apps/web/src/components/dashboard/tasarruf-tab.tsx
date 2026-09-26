"use client";

import { useTranslations } from "next-intl";
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
import type { SatinalmaAnalytics } from "@/hooks/use-company-dashboard";
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
  /** Trend + tutarlı kategori kırılımı (analytics ucu). */
  analytics?: SatinalmaAnalytics;
}

export function TasarrufTab({ data, period, analytics }: Props) {
  const t = useTranslations("web.panel.shell.tasarrufTab");
  // Maliyet kırılımında çeyrek agregatı yok — yıl gösterilir (etiketli, uydurma yok).
  const costPeriod: "month" | "year" = period === "month" ? "month" : "year";

  const metrics = costPeriod === "month" ? data.month : data.year;
  const topRows =
    costPeriod === "month" ? data.topSavingsMonth : data.topSavingsYear;
  const categoryRows =
    costPeriod === "month" ? data.categoryMonth : data.categoryYear;
  const currencyRows =
    costPeriod === "month" ? data.currencyMonth : data.currencyYear;

  return (
    <div className="space-y-6">
      {/* Zaman tasarrufu alt bölümü ve kriter penceresi KALDIRILDI (2026-09-10,
          kullanıcı kararı: "Şirketim'deki zaman tasarrufu kısımları gereksiz").
          Sekme yalnız MALİYET tasarrufunu gösterir. */}
      {period === "quarter" ? (
        <p className="text-xs text-zinc-400">{t("maliyetKiriliminda")}</p>
      ) : null}

      {/* Tasarruf trendi: aylık bar + kümülatif çizgi (yalnız TRY ihaleler). */}
      <div className="grid grid-cols-1 gap-4">
        <ChartCard
          title={t("tasarrufTrendi")}
          subtitle={t("aylikTasarrufBarKumulatifCizgi")}
          ariaLabel={t("aylikTasarrufTrendi")}
        >
          {analytics && analytics.savingsTrend.some((p) => p.value > 0) ? (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={analytics.savingsTrend}>
                  <CartesianGrid vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <YAxis tickLine={false} axisLine={false} width={48} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <Tooltip formatter={(v, n) => [formatTRY(Number(v ?? 0)), n === "value" ? t("aylik") : t("kumulatif")]} />
                  <Bar dataKey="value" fill="#2563eb" radius={[3, 3, 0, 0]} />
                  <Line type="monotone" dataKey="cumulative" stroke="#1e3a8a" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <DashboardEmptyState
              title={t("henuzTasarrufVerisiYok")}
              body={t("ilkSatinAlmaTalebiniziSonuclandirdiginizda")}
              ctaLabel={t("satinAlmaTalebiAc")}
              ctaHref="/company/satinalma/taleplerim/yeni"
            />
          )}
        </ChartCard>
        {/* "Bütçe vs Gerçekleşen" kartı KALDIRILDI (Faz 6.4): bütçe alanı
            şemada yok — kullanıcıya roadmap cümlesi gösterilmez. Bütçe girişi
            eklendiğinde kart yeniden gelir (bkz. eksik-veri listesi). */}
      </div>

      {/* 3 metrik kartı */}
      <section className="card p-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <Metric
            label={t("toplamTasarrufum")}
            value={formatTRY(metrics.totalSavings)}
            tooltip={t("tooltipSavings")}
            accent="success"
          />
          <Metric
            label={t("toplamIslemHacmim")}
            value={formatTRY(metrics.totalVolume)}
            tooltip={t("tooltipVolume")}
            accent="brand"
          />
          <Metric
            label={t("ortalamaTasarrufOranim")}
            value={formatPercent(metrics.averageSavingsRate)}
            tooltip={t("tooltipRate")}
            accent="indigo"
          />
        </div>
      </section>

      {/* En Yüksek Tasarruflu 5 İhalem */}
      <section className="card p-6">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-zinc-950">
              {t("enYuksekTasarruflu5Satin")}
            </h2>
            <InfoTooltip content={t("tooltipTop5")} />
          </div>
          <span className="flex items-center gap-2 text-xs text-slate-500">
            <span aria-hidden className="h-2 w-2 rounded-full bg-success-500" />
            {t("enYuksekTasarruflu")}
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
                <span className="tabular-nums text-sm font-semibold text-success-700">
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
                  stroke={t("varColorSlate200E2e8f0")}
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
                  labelFormatter={(rank) => t("satinAlmaTalebi", { String: String(rank) })}
                />
                <Bar
                  dataKey="amount"
                  fill={t("varColorSuccess50010b981")}
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
            <p className="mt-1 text-right text-xs font-medium text-slate-500">
              {t("tasarrufTutari")}
            </p>
          </div>
        </div>
      </section>

      {/* 2 yatay-bar kart */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BreakdownCard
          title={t("anaKategoriBazliTasarrufum")}
          tooltip={t("tooltipCategory")}
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
          title={t("anaParaBirimiBazliTasarrufum")}
          tooltip={t("tooltipCurrency")}
          rows={currencyRows}
          color="indigo"
        />
      </div>
    </div>
  );
}

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
                <span className="tabular-nums font-semibold text-zinc-900">
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
