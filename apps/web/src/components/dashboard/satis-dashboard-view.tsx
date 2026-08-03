"use client";

import { cn } from "@/lib/utils";
import { ActionCenter } from "@/components/dashboard/action-center";
import {
  ChartCard,
  DashboardEmptyState,
  FunnelChart,
  KpiCard,
} from "@/components/dashboard/analytics-primitives";
import { useSatisAnalytics } from "@/hooks/use-company-dashboard";
import { PeriodControls } from "@/components/dashboard/period-controls";
import { useDashboardParams } from "@/hooks/use-dashboard-params";
import {
  Area,
  AreaChart,
  Bar as RBar,
  BarChart as RBarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer as RContainer,
  Tooltip as RTooltip,
  XAxis as RXAxis,
  YAxis as RYAxis,
} from "recharts";
import { TcmbRatesChip } from "@/components/tcmb-rates-widget";
import { ErrorState } from "@/components/ui/error-state";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import {
  useSatisActivity,
  useSatisStats,
  type SatisActivityRow,
} from "@/hooks/use-company-dashboard";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  Activity,
  ArrowRight,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  FileText,
  Package,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { formatMoney } from "@/components/ui/money";
import Link from "next/link";
import { useEffect, useState, type ComponentType } from "react";

/** P1 (denetim §8.1): tek para formatı — sembol SONDA, kuruş görünür. */
function formatTRY(amount: number): string {
  if (!Number.isFinite(amount)) return "—";
  return formatMoney(amount, "TRY");
}

/** Beyaz panel kartı — eski tedarikçi PanelCard'ının zinc/Catalyst portu. */
function PanelCard({
  title,
  subtitle,
  children,
  padding = "md",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  padding?: "sm" | "md";
}) {
  return (
    <section className="card">
      <header className="border-b border-zinc-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-zinc-950">{title}</h2>
        {subtitle ? (
          <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>
        ) : null}
      </header>
      <div className={padding === "sm" ? "p-2" : "p-5"}>{children}</div>
    </section>
  );
}

/** current vs previous → yüzde değişim rozeti. */
function TrendBadge({ current, previous }: { current: number; previous: number }) {
  if (previous <= 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return null;
  const up = pct > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-semibold ${
        up ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
      }`}
    >
      {up ? (
        <TrendingUp className="h-3 w-3" aria-hidden="true" />
      ) : (
        <TrendingDown className="h-3 w-3" aria-hidden="true" />
      )}
      {up ? "+" : ""}
      {pct}%
    </span>
  );
}

const ACTIVITY_META: Record<
  SatisActivityRow["type"],
  { icon: ComponentType<{ className?: string }>; bg: string; fg: string }
> = {
  invitation: { icon: Briefcase, bg: "bg-blue-50", fg: "text-blue-600" },
  bid: { icon: FileText, bg: "bg-violet-50", fg: "text-violet-600" },
  order: { icon: Package, bg: "bg-emerald-50", fg: "text-emerald-600" },
};

function ActivityFeed({ rows }: { rows: SatisActivityRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-sm text-zinc-400">
        <Activity className="h-5 w-5" aria-hidden="true" />
        Henüz aktivite yok
      </div>
    );
  }
  return (
    <ul className="divide-y divide-zinc-50">
      {rows.map((r, i) => {
        const meta = ACTIVITY_META[r.type];
        const Icon = meta.icon;
        return (
          <li key={`${r.href}-${r.at}-${i}`}>
            <Link
              href={r.href}
              className="flex items-center gap-3 px-1 py-2.5 transition hover:bg-zinc-50"
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${meta.bg} ${meta.fg}`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-zinc-900">
                  {r.title}
                </span>
                <span className="block truncate text-xs text-zinc-500">
                  {r.subtitle}
                </span>
              </span>
              <time className="shrink-0 text-xs text-zinc-400">
                {format(new Date(r.at), "d MMM", { locale: tr })}
              </time>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Aktivite akışı sayfalama çubuğu — tek sayfa varsa hiç görünmez. */
function ActivityPager({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  const btn =
    "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900 disabled:pointer-events-none disabled:opacity-40";
  return (
    <div className="mt-2 flex items-center justify-between border-t border-zinc-100 pt-3">
      <button
        type="button"
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
        className={btn}
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Önceki
      </button>
      <span className="text-xs text-zinc-400 tabular-nums">
        Sayfa {page} / {totalPages}
      </span>
      <button
        type="button"
        onClick={() => onPage(page + 1)}
        disabled={page >= totalPages}
        className={btn}
      >
        Sonraki
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * Satış panosu — karşılama + CTA, aksiyon merkezi, 4 KPI, Performans
 * (trendli), Son Aktiviteler; tek kolon (sağ ray + Hızlı Erişim kaldırıldı,
 * kur bilgisi başlıktaki çipte). Görsel dil: zinc/Catalyst.
 */
export function SatisDashboardView() {
  const { company } = useCompanyAuth();
  const stats = useSatisStats();
  const [activityPage, setActivityPage] = useState(1);
  const activity = useSatisActivity(8, activityPage);
  const activityTotalPages = Math.max(
    1,
    Math.ceil((activity.data?.total ?? 0) / (activity.data?.pageSize ?? 8)),
  );

  // Hydration-safe tarih (sunucu/istemci farkı olmasın).
  const [todayLabel, setTodayLabel] = useState("");
  useEffect(() => {
    setTodayLabel(format(new Date(), "d MMMM yyyy, EEEE", { locale: tr }));
  }, []);

  const s = stats.data;
  const loading = stats.isLoading;
  // Faz 3 — dönem + sekme + karşılaştır + özel aralık URL'de (satınalma ile
  // ortak useDashboardParams; geri tuşu çalışır, sayfa paylaşılabilir).
  const { period, from, to, compare, tab, setParams } = useDashboardParams(
    "teklif",
    ["teklif", "gelir", "musteri"],
  );
  const analytics = useSatisAnalytics({ period, from, to });
  const [activityType, setActivityType] = useState<
    "all" | "invitation" | "bid" | "order"
  >("all");
  // §10.1: yüklemede "0 teklif" yanılgısı yok — sayaç "—" gösterir.
  const val = (n: number | undefined) => (loading ? "—" : (n ?? 0));

  return (
    <div className="space-y-8">
      {/* Karşılama başlığı — satınalma paneliyle aynı biçim */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="mb-1.5 text-2xl font-semibold leading-tight tracking-tight text-zinc-950">
            Satış paneli
          </h1>
          <p className="text-[15px] text-zinc-500">
            {company?.name ?? "Rothern"}
            {todayLabel ? (
              <>
                <span className="mx-2 text-zinc-300">·</span>
                <span>{todayLabel}</span>
              </>
            ) : null}
          </p>
        </div>
        {/* Kur çipi başlıkta; kazanma-oranı şeridi raporlar hub'ına taşındı. */}
        <div className="flex flex-wrap items-center gap-3">
          <TcmbRatesChip />
          <PeriodControls
            period={period}
            from={from}
            to={to}
            compare={compare}
            onChange={setParams}
          />
          <Link
            href="/company/satis/acik-ihaleler"
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            İhaleleri Görüntüle
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </header>

      {/* Aksiyon merkezi — "bugün ne yapmalıyım" (Faz 2: veri + sıralama
          backend'de, metin haritası ACTION_ROWS'ta). */}
      <ActionCenter portal="satis" />


      {/* Hata → retry: aksi halde tüm KPI'lar sessizce 0 görünüp yanıltır. */}
      {stats.isError && !s ? (
        <ErrorState
          title="Veri alınamadı"
          onRetry={() => void stats.refetch()}
        />
      ) : null}

      {/* Sekmeler: Teklif / Gelir / Müşteri (satınalma ile aynı dil). */}
      <div
        role="tablist"
        aria-label="Satış panosu bölümleri"
        className="flex gap-1 border-b border-zinc-950/10"
      >
        {(
          [
            ["teklif", "Teklif"],
            ["gelir", "Gelir"],
            ["musteri", "Müşteri"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setParams({ tab: key })}
            className={cn(
              "-mb-px border-b-2 px-5 py-2.5 text-sm font-medium transition-colors",
              tab === key
                ? "border-emerald-600 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-700",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "gelir" ? (
        <SatisGelirTab analytics={analytics.data} loading={analytics.isLoading} />
      ) : tab === "musteri" ? (
        <SatisMusteriTab analytics={analytics.data} loading={analytics.isLoading} />
      ) : (
      <>
      {/* KPI grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Vurgu kuralı (Faz 4.4): davet VARLIĞI değil, yanıt BEKLEYEN davet
            vurgular — nedeni alt metinde. */}
        <KpiCard
          label="Aktif Davetler"
          value={val(s?.invitations.active)}
          href="/company/satis/acik-ihaleler"
          accent="emerald"
          attention={(analytics.data?.actions.unansweredInvites ?? 0) > 0}
          hint={
            (analytics.data?.actions.unansweredInvites ?? 0) > 0
              ? `${analytics.data!.actions.unansweredInvites} davet teklifini bekliyor`
              : undefined
          }
        />
        <KpiCard
          label="Aktif Tekliflerim"
          value={val(s?.bids.active)}
          href="/company/satis/tekliflerim"
          accent="emerald"
          deltaPct={compare ? analytics.data?.deltas.bidsSubmitted : undefined}
          spark={analytics.data?.kpiSeries.bidsSubmitted}
        />
        <KpiCard
          label="Kazanılan İhale"
          value={val(s?.wonTenders)}
          href="/company/satis/tekliflerim"
          accent="emerald"
          spark={analytics.data?.kpiSeries.won}
        />
        <KpiCard
          label="Aktif Sipariş"
          value={val(s?.orders.pending)}
          href="/company/satis/siparisler?status=PENDING"
          accent="emerald"
          deltaPct={compare ? analytics.data?.deltas.orders : undefined}
          spark={analytics.data?.kpiSeries.orders}
        />
      </div>

      {/* Tek kolon — sağ ray (TCMB + Hızlı Erişim) kaldırıldı. */}
      <div className="space-y-6">
          <PanelCard title="Performans" subtitle="Son 30 gün ve toplam özet">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-4">
                <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                  Son 30 Gün Teklif
                  {s ? (
                    <TrendBadge
                      current={s.last30Days.bidsSubmitted}
                      previous={s.last30Days.prevBidsSubmitted}
                    />
                  ) : null}
                </p>
                <p className="mt-1 text-2xl font-bold text-zinc-950 tabular-nums">
                  {val(s?.last30Days.bidsSubmitted)}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-4">
                <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                  Toplam Gelir
                  {s ? (
                    <TrendBadge
                      current={s.revenue.last30}
                      previous={s.revenue.prev30}
                    />
                  ) : null}
                </p>
                <p className="mt-1 text-2xl font-bold text-zinc-950 tabular-nums">
                  {loading ? "…" : formatTRY(s?.revenue.total ?? 0)}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-4">
                <p className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                  Bağlı Müşteri
                </p>
                <p className="mt-1 text-2xl font-bold text-zinc-950 tabular-nums">
                  {val(s?.buyers.active)}
                </p>
              </div>
            </div>
          </PanelCard>

          <PanelCard
            title="Son Aktiviteler"
            subtitle="Davetler, teklifler ve siparişlerden"
          >
            {/* Tür filtresi — yüklü sayfa üstünde istemci tarafı süzme. */}
            <div className="mb-3 flex gap-1 rounded-lg bg-zinc-100 p-1 sm:w-fit">
              {(
                [
                  ["all", "Tümü"],
                  ["invitation", "Davet"],
                  ["bid", "Teklif"],
                  ["order", "Sipariş"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActivityType(key)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-semibold transition",
                    activityType === key
                      ? "bg-white text-zinc-900 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-800",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* Sayfa geçişinde placeholderData önceki sayfayı tutar — soluk göster. */}
            <div className={activity.isPlaceholderData ? "opacity-60" : undefined}>
              <ActivityFeed
                rows={(activity.data?.rows ?? []).filter(
                  (r) => activityType === "all" || r.type === activityType,
                )}
              />
            </div>
            <ActivityPager
              page={activityPage}
              totalPages={activityTotalPages}
              onPage={setActivityPage}
            />
          </PanelCard>
      </div>
      </>
      )}
    </div>
  );
}

/** Gelir sekmesi — trend + kazanma yığını + TL pipeline. */
function SatisGelirTab({
  analytics,
  loading,
}: {
  analytics?: import("@/hooks/use-company-dashboard").SatisAnalytics;
  loading: boolean;
}) {
  if (loading || !analytics) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-hidden>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-64 animate-pulse rounded-xl bg-zinc-200/60" />
        ))}
      </div>
    );
  }
  const AXIS = { fontSize: 11, fill: "#94a3b8" };
  const hasRevenue = analytics.revenueTrend.some((p) => p.value > 0);
  const hasWinLoss = analytics.winLoss.some(
    (w) => w.won + w.lost + w.pending > 0,
  );
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ChartCard
        title="Gelir Trendi"
        rangeBadge="son 12 ay"
        subtitle="Aylık gelir (alan) + yılbaşından beri kümülatif (çizgi) — TRY satışlar"
        ariaLabel="Aylık gelir trendi"
        href="/company/satis/siparisler"
        className="lg:col-span-2"
      >
        {hasRevenue ? (
          <div className="h-56">
            <RContainer width="100%" height="100%">
              <ComposedChart data={analytics.revenueTrend}>
                <CartesianGrid vertical={false} stroke="#e2e8f0" />
                <RXAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS} />
                <RYAxis tickLine={false} axisLine={false} width={56} tick={AXIS} />
                <RTooltip
                  formatter={(v, n) => [
                    formatMoney(Number(v ?? 0), "TRY"),
                    n === "value" ? "Aylık" : "Kümülatif",
                  ]}
                />
                <Area type="monotone" dataKey="value" stroke="#059669" strokeWidth={1.5} fill="#059669" fillOpacity={0.12} isAnimationActive={false} />
                <Line type="monotone" dataKey="cumulative" stroke="#065f46" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </RContainer>
          </div>
        ) : (
          <DashboardEmptyState
            title="Henüz gelir verisi yok"
            body="İlk satışın siparişe dönüştüğünde aylık gelir burada birikecek."
            ctaLabel="Açık İhalelere Göz At"
            ctaHref="/company/satis/acik-ihaleler"
          />
        )}
      </ChartCard>

      <ChartCard
        title="Kazanma / Kaybetme Dağılımı"
        rangeBadge="son 12 ay"
        subtitle="Aylık karara bağlanan teklifler (kazanıldı · kaybedildi · beklemede)"
        ariaLabel="Aylık kazanma kaybetme dağılımı"
        href="/company/satis/tekliflerim"
      >
        {hasWinLoss ? (
          <div className="h-52">
            <RContainer width="100%" height="100%">
              <RBarChart data={analytics.winLoss}>
                <CartesianGrid vertical={false} stroke="#e2e8f0" />
                <RXAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS} />
                <RYAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} tick={AXIS} />
                <RTooltip
                  formatter={(v, n) => [
                    Number(v ?? 0),
                    n === "won" ? "Kazanıldı" : n === "lost" ? "Kaybedildi" : "Beklemede",
                  ]}
                />
                <RBar dataKey="won" stackId="w" fill="#059669" />
                <RBar dataKey="lost" stackId="w" fill="#e11d48" />
                <RBar dataKey="pending" stackId="w" fill="#cbd5e1" radius={[3, 3, 0, 0]} />
              </RBarChart>
            </RContainer>
          </div>
        ) : (
          <DashboardEmptyState
            title="Henüz karar verisi yok"
            body="Tekliflerin karara bağlandıkça aylık kazanma/kaybetme dağılımı burada görünecek."
          />
        )}
      </ChartCard>

      <ChartCard
        title="Pipeline"
        subtitle="Davet adet; sonraki aşamalar TL (teklifsiz davetin tutarı bilinemez)"
        ariaLabel="Satış pipeline hunisi"
      >
        {analytics.pipeline.some((p) => p.count > 0) ? (
          <FunnelChart
            accent="emerald"
            stages={analytics.pipeline.map((p) => ({
              key: p.key,
              label:
                p.amountTry != null
                  ? `${p.label} (${formatMoney(p.amountTry, "TRY")})`
                  : p.label,
              count: p.count,
            }))}
          />
        ) : (
          <DashboardEmptyState
            title="Pipeline boş"
            body="Davet alıp teklif verdikçe aşamalar burada dolacak."
            ctaLabel="Açık İhalelere Göz At"
            ctaHref="/company/satis/acik-ihaleler"
          />
        )}
      </ChartCard>
    </div>
  );
}

/** Müşteri sekmesi — Pareto + kategori kazanma + yanıt süresi + kaçırılan. */
function SatisMusteriTab({
  analytics,
  loading,
}: {
  analytics?: import("@/hooks/use-company-dashboard").SatisAnalytics;
  loading: boolean;
}) {
  if (loading || !analytics) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-hidden>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-64 animate-pulse rounded-xl bg-zinc-200/60" />
        ))}
      </div>
    );
  }
  const AXIS = { fontSize: 11, fill: "#94a3b8" };
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ChartCard
        title="Müşteri Konsantrasyonu"
        rangeBadge="son 12 ay"
        subtitle="En iyi 5 müşterinin gelir payı (son 12 ay, TRY)"
        ariaLabel="Müşteri konsantrasyonu Pareto"
        right={
          analytics.pareto.concentrationWarning ? (
            <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
              ⚠ Konsantrasyon riski
            </span>
          ) : undefined
        }
      >
        {analytics.pareto.rows.length > 0 ? (
          <ul className="space-y-2.5">
            {analytics.pareto.rows.map((r) => (
              <li key={r.name}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate text-slate-600" title={r.name}>
                    {r.name}
                  </span>
                  <span className="tabular-nums text-slate-900">
                    {formatMoney(r.amount, "TRY")}
                    <span
                      className={cn(
                        "ml-1.5 font-semibold",
                        r.sharePct > 40 ? "text-amber-600" : "text-slate-400",
                      )}
                    >
                      %{r.sharePct}
                    </span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      r.sharePct > 40 ? "bg-amber-500" : "bg-emerald-600",
                    )}
                    style={{ width: `${Math.max(2, r.sharePct)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <DashboardEmptyState
            title="Henüz müşteri geliri yok"
            body="Satışların tamamlandıkça müşteri dağılımı burada görünecek."
          />
        )}
      </ChartCard>

      <ChartCard
        title="Kategori Bazlı Kazanma Oranı"
        rangeBadge="son 12 ay"
        subtitle="Hangi kategorilerde güçlüyüz (karara bağlanan teklifler, son 12 ay)"
        ariaLabel="Kategori bazlı kazanma oranı"
      >
        {analytics.categoryWinRate.length > 0 ? (
          <ul className="space-y-2.5">
            {analytics.categoryWinRate.map((c) => (
              <li key={c.label}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate text-slate-600" title={c.label}>
                    {c.label}
                  </span>
                  <span className="tabular-nums text-slate-900">
                    <strong>%{c.winPct}</strong>
                    <span className="ml-1 text-slate-400">
                      ({c.decided} teklif)
                    </span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-600"
                    style={{ width: `${Math.max(2, c.winPct)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <DashboardEmptyState
            title="Henüz karar verisi yok"
            body="Tekliflerin sonuçlandıkça kategori bazlı gücün burada görünecek."
          />
        )}
      </ChartCard>

      <ChartCard
        title="Teklif Yanıt Süresi"
        rangeBadge="son 12 ay"
        subtitle="Davetten teklife geçen ortalama süre (saat, aylık)"
        ariaLabel="Teklif yanıt süresi trendi"
      >
        {analytics.responseTrend.some((p) => p.value != null) ? (
          <div className="h-48">
            <RContainer width="100%" height="100%">
              <AreaChart data={analytics.responseTrend}>
                <CartesianGrid vertical={false} stroke="#e2e8f0" />
                <RXAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS} />
                <RYAxis tickLine={false} axisLine={false} width={34} tick={AXIS} />
                <RTooltip formatter={(v) => [`${Number(v ?? 0)} sa`, "Ortalama"]} />
                <Area type="monotone" dataKey="value" stroke="#059669" strokeWidth={1.5} fill="#059669" fillOpacity={0.1} connectNulls isAnimationActive={false} />
              </AreaChart>
            </RContainer>
          </div>
        ) : (
          <DashboardEmptyState
            title="Henüz yanıt verisi yok"
            body="Davetlere teklif verdikçe ortalama yanıt süren burada görünecek."
          />
        )}
      </ChartCard>

      <ChartCard
        title="Kaçırılan Fırsatlar"
        rangeBadge="son 12 ay"
        subtitle="Teklif verilmeden süresi dolan davetler (son 12 ay)"
        ariaLabel="Kaçırılan fırsatlar"
        href="/company/satis/acik-ihaleler"
      >
        {analytics.missed.count > 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-1">
            <p className="text-4xl font-semibold tracking-tight tabular-nums text-rose-600">
              {analytics.missed.count}
            </p>
            <p className="text-sm text-slate-500">davet teklifsiz kapandı</p>
            {/* TODO: toplam tutar bilinemez — teklif verilmedi, ihale toplam
                değeri platformda tutulmuyor. */}
            <p className="text-xs text-slate-400">
              Tutar hesaplanamaz — teklif verilmeden kapanan ihalenin değeri
              bilinmez.
            </p>
          </div>
        ) : (
          <DashboardEmptyState
            title="Kaçırılan fırsat yok"
            body="Son 12 ayda teklifsiz kapanan davetli ihalen bulunmuyor."
          />
        )}
      </ChartCard>
    </div>
  );
}
