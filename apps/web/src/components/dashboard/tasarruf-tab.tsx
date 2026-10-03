"use client";

import { useTranslations } from "next-intl";
import { useHasCompanyPermission } from "@/hooks/use-company-auth";
import { axisScaleMax, useFormatMoney } from "@/components/ui/money";
import { useFormatPercent } from "@/i18n/domain";
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
  /** Tasarruf tutarı (rapor biriminde) — yüzdeyle AYNI pencereden. */
  amount?: number;
}

export interface CurrencyBreakdownRow {
  /** "TRY" gibi kod veya "Ana Para Birimi 2" placeholder */
  label: string;
  /** undefined → veri yok (kesik çizgi placeholder) */
  percent?: number;
}

export interface TasarrufTabData {
  /** Tutarların birimi — firmanın rapor para birimi (eski yanıtta yok → TRY). */
  currency?: string;
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
  /** Tasarruf trendi (analytics ucu). Kategori tutarı `data` satırından gelir. */
  analytics?: SatinalmaAnalytics;
}

export function TasarrufTab({ data, period, analytics }: Props) {
  const t = useTranslations("web.panel.shell.tasarrufTab");
  // "Satın Alma Talebi Aç" yalnız talep açma izniyle — menü CTA'sıyla aynı
  // kural (paket kapısı panoyu zaten Gold'a bağlar; rol kontrolü içinde).
  // İzinsiz üye CTA'dan "yetki gerektirir" duvarına düşüyordu (arayüz testi T3).
  const canCreateBuyListing = useHasCompanyPermission("buy:listing:manage");
  // Tutar/yüzde arayüz dilinin biçimiyle (tr-TR sabitti; kısaltma "Mr/M/K"
  // yerine dilin kısaltması — `formatCompactMoney`).
  const { money, axis, axisWidth } = useFormatMoney();
  const pct = useFormatPercent();
  // Tutarlar FİRMANIN RAPOR BİRİMİNDE (2026-09-27; sunucu çevirir). Adlar
  // (`formatTRY`) tarihsel.
  const cur = data.currency ?? analytics?.currency ?? "TRY";
  const formatTRY = (amount: number) => (Number.isFinite(amount) ? money(amount, cur) : "—");
  const formatPercent = (p: number) => (Number.isFinite(p) ? pct(p, { maximumFractionDigits: 2 }) : "—");
  // Maliyet kırılımında çeyrek agregatı yok — yıl gösterilir (etiketli, uydurma yok).
  const costPeriod: "month" | "year" = period === "month" ? "month" : "year";

  const metrics = costPeriod === "month" ? data.month : data.year;
  // Tasarrufu olmayan (0,00) talep "en yüksek tasarruflu" sıralamasına girmez
  // (arayüz testi D-297; uç da süzer — eski yanıta karşı burada da).
  const topRows = (
    costPeriod === "month" ? data.topSavingsMonth : data.topSavingsYear
  ).filter((r) => r.amount > 0);
  // Eksen tek gösterim ("9.000 ₺" ile "18 B ₺" yan yana çıkmaz): ölçek en büyük tutardan.
  const topScaleMax = axisScaleMax(topRows.map((r) => r.amount));
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

      {/* Tasarruf trendi: aylık bar + kümülatif çizgi (rapor biriminde, tüm talepler). */}
      <div className="grid grid-cols-1 gap-4">
        <ChartCard
          title={t("tasarrufTrendi")}
          subtitle={t("aylikTasarrufBarKumulatifCizgiCur", { currency: cur })}
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
              ctaLabel={canCreateBuyListing ? t("satinAlmaTalebiAc") : undefined}
              ctaHref={canCreateBuyListing ? "/company/satinalma/taleplerim/yeni" : undefined}
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

        {topRows.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">{t("top5Bos")}</p>
        ) : (
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
                  stroke="var(--color-slate-200, #e2e8f0)"
                />
                <XAxis
                  dataKey="rank"
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => axis(Number(v), cur, topScaleMax)}
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                  width={axisWidth(cur, topScaleMax, 70)}
                />
                <Tooltip
                  cursor={{ fill: "rgba(59,107,255,0.06)" }}
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    fontSize: 12,
                  }}
                  formatter={(v) => [formatTRY(Number(v)), t("tasarrufTutari")]}
                  labelFormatter={(rank) => t("satinAlmaTalebi", { String: String(rank) })}
                />
                <Bar
                  dataKey="amount"
                  fill="var(--color-success-500, #10b981)"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
            <p className="mt-1 text-right text-xs font-medium text-slate-500">
              {t("tasarrufTutari")}
            </p>
          </div>
        </div>
        )}
      </section>

      {/* 2 yatay-bar kart */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BreakdownCard
          title={t("anaKategoriBazliTasarrufum")}
          tooltip={t("tooltipCategory")}
          // Tutar yüzdeyle aynı satırdan (aynı dönem penceresi). Eskiden
          // analytics'in seçili-dönem tutarı eşleniyordu → çeyrek/özel aralıkta
          // yıl yüzdesinin yanında çeyrek tutarı çıkıyordu.
          rows={categoryRows.map((r) => ({
            label: r.label,
            percent: r.percent,
            amountLabel: r.amount != null ? formatTRY(r.amount) : undefined,
          }))}
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
  const pct = useFormatPercent();
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
                  {hasData ? pct(r.percent as number, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
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
