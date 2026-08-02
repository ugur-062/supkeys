"use client";

import { ActionStrip } from "@/components/dashboard/action-strip";
import { DashboardKpiCard } from "@/components/dashboard/dashboard-kpi-card";
import { TcmbRatesWidget } from "@/components/tcmb-rates-widget";
import { InvitedPendingBanner } from "@/components/dashboard/invited-pending-banner";
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
    <section className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-950/5">
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
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold ${
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

function QuickLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition hover:bg-zinc-50"
    >
      <Icon className="h-4 w-4 text-zinc-500" aria-hidden="true" />
      <span className="flex-1 font-medium text-zinc-900">{label}</span>
      <ArrowRight className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
    </Link>
  );
}

/**
 * Satış panosu — eski tedarikçi paneli ana sayfasının birebir paritesi:
 * karşılama + CTA, aksiyon banner'ı, 4 KPI, Performans (trendli), Son
 * Aktiviteler, TCMB kurları + Hızlı Erişim. Görsel dil: zinc/Catalyst.
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
  const val = (n: number | undefined) => (loading ? "…" : (n ?? 0));

  return (
    <div className="mx-auto max-w-7xl space-y-8">
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
        <Link
          href="/company/satis/acik-ihaleler"
          className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
        >
          İhaleleri Görüntüle
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </header>

      {/* Uyarı: davet edilip teklif verilmemiş açık ihaleler (yoksa görünmez) */}
      <InvitedPendingBanner
        count={s?.invitations.active ?? 0}
        href="/company/satis/acik-ihaleler"
      />

      {/* Bugün ne yapmalıyım? — bekleyen işler (yoksa görünmez) */}
      <ActionStrip portal="satis" />

      {/* Hata → retry: aksi halde tüm KPI'lar sessizce 0 görünüp yanıltır. */}
      {stats.isError && !s ? (
        <ErrorState
          title="Veri alınamadı"
          onRetry={() => void stats.refetch()}
        />
      ) : null}

      {/* KPI grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardKpiCard
          label="Aktif Davetler"
          value={val(s?.invitations.active)}
          hint="Henüz teklif vermediğin"
          href="/company/satis/acik-ihaleler"
          accent="success"
        />
        <DashboardKpiCard
          label="Aktif Tekliflerim"
          value={val(s?.bids.active)}
          hint="Verilmiş + değerlendirilen"
          href="/company/satis/tekliflerim"
          accent="warning"
        />
        <DashboardKpiCard
          label="Kazanılan İhale"
          value={val(s?.wonTenders)}
          hint="Toplam kazanım"
          href="/company/satis/tekliflerim"
        />
        <DashboardKpiCard
          label="Aktif Sipariş"
          value={val(s?.orders.pending)}
          hint="Teslimat bekleyen"
          href="/company/satis/siparisler"
          accent="indigo"
        />
      </div>

      {/* 2 sütun: Performans + Aktivite | TCMB + Hızlı Erişim */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
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
            {/* Sayfa geçişinde placeholderData önceki sayfayı tutar — soluk göster. */}
            <div className={activity.isPlaceholderData ? "opacity-60" : undefined}>
              <ActivityFeed rows={activity.data?.rows ?? []} />
            </div>
            <ActivityPager
              page={activityPage}
              totalPages={activityTotalPages}
              onPage={setActivityPage}
            />
          </PanelCard>
        </div>

        <div className="space-y-4">
          <TcmbRatesWidget />
          <PanelCard title="Hızlı Erişim" padding="sm">
            <div className="space-y-1">
              <QuickLink
                href="/company/satis/acik-ihaleler"
                icon={Briefcase}
                label="Açık İhaleler"
              />
              <QuickLink
                href="/company/satis/siparisler"
                icon={Package}
                label="Satışlarım"
              />
              <QuickLink
                href="/company/satis/profilim"
                icon={TrendingUp}
                label="Firma Profilim"
              />
            </div>
          </PanelCard>
        </div>
      </div>
    </div>
  );
}
