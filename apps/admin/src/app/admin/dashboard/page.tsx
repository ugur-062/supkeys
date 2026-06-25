"use client";

import { AdminShell } from "@/components/layout/admin-shell";
import { PageHeader } from "@/components/list";
import { RequireAdminAuth } from "@/components/providers/auth-hydration";
import {
  useAdminOverview,
  useAdminRecentActivity,
  useAdminTenderTrend,
  type OverviewStats,
  type RecentActivity,
} from "@/hooks/use-admin-stats";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  AlertTriangle,
  Building2,
  FileText,
  Mail,
  Package,
  TrendingDown,
  TrendingUp,
  Truck,
  type LucideIcon,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { MembershipAlertsCard } from "./_components/membership-alerts-card";

// Performans audit P-8 — recharts (~150KB gzip) trend chart bileşeninde,
// initial bundle'a dahil değil. Admin dashboard ilk render'da KPI'lar +
// recent activity hızlıca görünür, chart sonra yüklenir.
const TrendChart = dynamic(
  () => import("./_components/trend-chart").then((m) => m.TrendChart),
  {
    ssr: false,
    loading: () => (
      <div className="admin-card p-5">
        <div style={{ width: "100%", height: 240 }}>
          <div className="h-full w-full bg-slate-100 rounded animate-pulse" />
        </div>
      </div>
    ),
  },
);

type AccentColor = "brand" | "purple" | "indigo" | "success";

const ACCENT_CLASSES: Record<
  AccentColor,
  { bg: string; icon: string; hover: string }
> = {
  brand: {
    bg: "bg-zinc-100",
    icon: "text-zinc-600",
    hover: "hover:border-zinc-300",
  },
  purple: {
    bg: "bg-zinc-100",
    icon: "text-zinc-600",
    hover: "hover:border-zinc-300",
  },
  indigo: {
    bg: "bg-zinc-100",
    icon: "text-zinc-600",
    hover: "hover:border-zinc-300",
  },
  success: {
    bg: "bg-success-50",
    icon: "text-success-600",
    hover: "hover:border-success-300",
  },
};

function DashboardContent() {
  const overviewQ = useAdminOverview();
  const trendQ = useAdminTenderTrend(30);
  const activityQ = useAdminRecentActivity(8);

  return (
    <div className="space-y-6 max-w-[1400px]">
      <PageHeader
        title="Sistem Geneli"
        description="Rothern ekosistem sağlığı ve son aktiviteler."
        action={
          <div className="flex items-center gap-2 text-xs text-admin-text-muted">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success-500 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success-500" />
            </span>
            Canlı (60sn yenileme)
          </div>
        }
      />

      {/* KPI Grid */}
      {overviewQ.isLoading || !overviewQ.data ? (
        <KpiGridSkeleton />
      ) : (
        <KpiGrid overview={overviewQ.data} />
      )}

      {/* Health Row */}
      {overviewQ.data ? <HealthRow overview={overviewQ.data} /> : null}

      {/* V2-6.5 — Üyelik bitiş uyarıları */}
      <MembershipAlertsCard />

      {/* Trend Chart */}
      <TrendChart trend={trendQ.data ?? []} loading={trendQ.isLoading} />

      {/* Recent Activity */}
      {activityQ.data ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <RecentRegistrationsCard
            registrations={activityQ.data.recentRegistrations}
          />
          <RecentTendersCard tenders={activityQ.data.recentTenders} />
        </div>
      ) : null}
    </div>
  );
}

function KpiGrid({ overview }: { overview: OverviewStats }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        icon={Building2}
        label="Tenant"
        value={overview.tenants.total}
        sub={`${overview.tenants.newThisMonth} yeni bu ay`}
        delta={overview.tenants.deltaPercent}
        accent="brand"
        href="/admin/tenants"
      />
      <KpiCard
        icon={Truck}
        label="Tedarikçi"
        value={overview.suppliers.total}
        sub={`${overview.suppliers.newThisMonth} yeni bu ay`}
        delta={overview.suppliers.deltaPercent}
        accent="purple"
        href="/admin/suppliers"
      />
      <KpiCard
        icon={FileText}
        label="İhale"
        value={overview.tenders.total}
        sub={`${overview.tenders.openForBids} aktif · ${overview.tenders.thisMonth} bu ay`}
        delta={overview.tenders.deltaPercent}
        accent="indigo"
      />
      <KpiCard
        icon={Package}
        label="Sipariş"
        value={overview.orders.total}
        sub={`${overview.orders.pending} bekliyor · ${overview.orders.inDelivery} teslimatta`}
        delta={overview.orders.deltaPercent}
        accent="success"
      />
    </div>
  );
}

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: number;
  sub: string;
  delta: number;
  accent: AccentColor;
  href?: string;
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  delta,
  accent,
  href,
}: KpiCardProps) {
  const styles = ACCENT_CLASSES[accent];
  const card = (
    <div
      className={cn(
        "admin-card p-5 transition-colors h-full",
        href && styles.hover,
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div
          className={cn(
            "h-10 w-10 rounded-xl flex items-center justify-center",
            styles.bg,
          )}
        >
          <Icon className={cn("h-5 w-5", styles.icon)} />
        </div>
        {delta !== 0 ? (
          <div
            className={cn(
              "flex items-center gap-1 text-xs font-semibold",
              delta > 0 ? "text-success-600" : "text-danger-600",
            )}
          >
            {delta > 0 ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {Math.abs(delta)}%
          </div>
        ) : null}
      </div>
      <p className="text-xs uppercase text-admin-text-muted font-semibold tracking-wide">
        {label}
      </p>
      <p className="text-2xl font-bold text-admin-text mt-1">
        {value.toLocaleString("tr-TR")}
      </p>
      <p className="text-xs text-admin-text-muted mt-1">{sub}</p>
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {card}
    </Link>
  ) : (
    card
  );
}

function KpiGridSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="admin-card p-5 h-32">
          <div className="h-10 w-10 rounded-xl bg-slate-200 animate-pulse mb-3" />
          <div className="h-3 bg-slate-200 rounded animate-pulse w-20 mb-2" />
          <div className="h-7 bg-slate-200 rounded animate-pulse w-16" />
        </div>
      ))}
    </div>
  );
}

function HealthRow({ overview }: { overview: OverviewStats }) {
  const stale = overview.approvalRequests.staleOver3Days;
  const failureRate = overview.emails.failureRate;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div
        className={cn(
          "admin-card p-5 border",
          stale > 0 ? "border-warning-200" : "border-surface-border",
        )}
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-xs uppercase text-admin-text-muted font-semibold tracking-wide">
              Onay Süreçleri
            </p>
            <p className="text-2xl font-bold text-admin-text mt-1">
              {overview.approvalRequests.totalPending}
            </p>
            <p className="text-xs text-admin-text-muted mt-1">
              aktif onay sürecinde
            </p>
          </div>
          <AlertTriangle
            className={cn(
              "h-5 w-5",
              stale > 0 ? "text-warning-500" : "text-slate-300",
            )}
          />
        </div>
        {stale > 0 ? (
          <div className="mt-3 pt-3 border-t border-warning-200 text-sm text-warning-700">
            <strong>{stale}</strong> onay 3+ gündür bekliyor
          </div>
        ) : null}
      </div>

      <div
        className={cn(
          "admin-card p-5 border",
          failureRate > 5 ? "border-danger-200" : "border-surface-border",
        )}
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-xs uppercase text-admin-text-muted font-semibold tracking-wide">
              E-posta (Son 24 saat)
            </p>
            <p className="text-2xl font-bold text-admin-text mt-1">
              {overview.emails.sentLast24h}
            </p>
            <p className="text-xs text-admin-text-muted mt-1">gönderildi</p>
          </div>
          <Mail
            className={cn(
              "h-5 w-5",
              failureRate > 5 ? "text-danger-500" : "text-success-500",
            )}
          />
        </div>
        {overview.emails.failedLast24h > 0 ? (
          <div
            className={cn(
              "mt-3 pt-3 border-t text-sm",
              failureRate > 5
                ? "border-danger-200 text-danger-700"
                : "border-surface-border text-admin-text-muted",
            )}
          >
            <strong>{overview.emails.failedLast24h}</strong> başarısız (
            {failureRate}%)
          </div>
        ) : null}

        {/* V2-1 — Resend webhook breakdown */}
        <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-surface-border text-xs">
          <div>
            <p className="text-success-700 font-bold text-base">
              {overview.emails.deliveredLast24h}
            </p>
            <p className="text-admin-text-muted">Teslim</p>
          </div>
          <div>
            <p className="text-zinc-900 font-bold text-base">
              {overview.emails.openedLast24h}
            </p>
            <p className="text-admin-text-muted">Açılan</p>
          </div>
          <div>
            <p
              className={cn(
                "font-bold text-base",
                overview.emails.bouncedLast24h > 0
                  ? "text-danger-700"
                  : "text-admin-text-muted",
              )}
            >
              {overview.emails.bouncedLast24h}
            </p>
            <p className="text-admin-text-muted">Bounce</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function RecentRegistrationsCard({
  registrations,
}: {
  registrations: RecentActivity["recentRegistrations"];
}) {
  return (
    <div className="admin-card">
      <div className="px-5 py-4 border-b border-surface-border flex items-center justify-between">
        <h3 className="font-bold text-admin-text">Son Kayıtlar</h3>
        <Link
          href="/admin/tenants"
          className="text-xs text-brand-600 hover:underline font-semibold"
        >
          Tümünü Gör →
        </Link>
      </div>
      <div className="divide-y divide-surface-border">
        {registrations.length === 0 ? (
          <p className="p-6 text-sm text-admin-text-muted text-center">
            Yeni kayıt yok
          </p>
        ) : (
          registrations.map((r) => (
            <Link
              key={r.id}
              href={`/admin/tenants/${r.id}`}
              className="block px-5 py-3 hover:bg-surface-subtle transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-admin-text truncate">
                    {r.name}
                  </p>
                  <p className="text-xs text-admin-text-muted truncate">
                    {r.users[0]?.email ?? "—"}
                  </p>
                </div>
                <span className="text-xs text-admin-text-muted ml-3 flex-shrink-0">
                  {format(new Date(r.createdAt), "d MMM HH:mm", { locale: tr })}
                </span>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

function RecentTendersCard({
  tenders,
}: {
  tenders: RecentActivity["recentTenders"];
}) {
  return (
    <div className="admin-card">
      <div className="px-5 py-4 border-b border-surface-border">
        <h3 className="font-bold text-admin-text">Son İhaleler</h3>
      </div>
      <div className="divide-y divide-surface-border">
        {tenders.length === 0 ? (
          <p className="p-6 text-sm text-admin-text-muted text-center">
            Yeni ihale yok
          </p>
        ) : (
          tenders.map((t) => (
            <div
              key={t.id}
              className="px-5 py-3 hover:bg-surface-subtle transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-xs text-admin-text-muted">
                    {t.tenderNumber}
                  </p>
                  <p className="font-semibold text-admin-text truncate">
                    {t.title}
                  </p>
                  <p className="text-xs text-admin-text-muted truncate">
                    {t.tenant.name}
                  </p>
                </div>
                <TenderStatusBadge status={t.status} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const TENDER_STATUS_META: Record<
  string,
  { label: string; cls: string }
> = {
  DRAFT: {
    label: "Taslak",
    cls: "bg-slate-50 text-slate-700 border-slate-200",
  },
  IN_APPROVAL: {
    label: "Onayda",
    cls: "bg-warning-50 text-warning-700 border-warning-200",
  },
  OPEN_FOR_BIDS: {
    label: "Açık",
    cls: "bg-success-50 text-success-700 border-success-200",
  },
  IN_AWARD: {
    label: "Kazandırma",
    cls: "bg-zinc-100 text-zinc-700 border-zinc-200",
  },
  IN_AWARD_APPROVAL: {
    label: "Onayda",
    cls: "bg-warning-50 text-warning-700 border-warning-200",
  },
  AWARDED: {
    label: "Kazandırıldı",
    cls: "bg-brand-50 text-brand-700 border-brand-200",
  },
  CANCELLED: {
    label: "İptal",
    cls: "bg-slate-100 text-slate-600 border-slate-200",
  },
  CLOSED_NO_AWARD: {
    label: "Kapatıldı",
    cls: "bg-slate-100 text-slate-600 border-slate-200",
  },
};

function TenderStatusBadge({ status }: { status: string }) {
  const meta = TENDER_STATUS_META[status] ?? {
    label: status,
    cls: "bg-slate-50 text-slate-700 border-slate-200",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border whitespace-nowrap flex-shrink-0",
        meta.cls,
      )}
    >
      {meta.label}
    </span>
  );
}

export default function AdminDashboardPage() {
  return (
    <RequireAdminAuth>
      <AdminShell>
        <DashboardContent />
      </AdminShell>
    </RequireAdminAuth>
  );
}
