"use client";

import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { EmptyPanel } from "@/components/dashboard/empty-panel";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { OnboardingCard } from "@/components/dashboard/onboarding-card";
import { useAuth, useMe } from "@/hooks/use-auth";
import {
  useTenantDashboardStats,
  useTenantRecentActivity,
  type TenantActivity,
} from "@/hooks/use-tenant-dashboard";
import { TENDER_STATUS_META } from "@/lib/tenders/labels";
import type { TenderStatus } from "@/lib/tenders/types";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  Activity,
  Calendar,
  CheckSquare,
  FileText,
  Package,
  TrendingUp,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";

function formatTRY(amount: number): string {
  if (!Number.isFinite(amount) || amount === 0) return "₺0";
  return amount.toLocaleString("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  });
}

export default function DashboardPage() {
  const { user } = useAuth();
  useMe();

  const [todayLabel, setTodayLabel] = useState<string>("");
  useEffect(() => {
    setTodayLabel(format(new Date(), "d MMMM yyyy, EEEE", { locale: tr }));
  }, []);

  const statsQuery = useTenantDashboardStats();
  const activityQuery = useTenantRecentActivity(10);

  const stats = statsQuery.data;
  const activities = activityQuery.data ?? [];

  const allEmpty =
    !!stats &&
    stats.tenders.active === 0 &&
    stats.tenders.inAward === 0 &&
    stats.suppliers.active === 0 &&
    stats.orders.pending === 0;

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <header>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="font-display font-bold text-3xl text-brand-900 leading-tight">
            Hoş geldin, {user?.firstName ?? "Supkeys kullanıcısı"} 👋
          </h1>
          <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-success-50 text-success-700 font-semibold border border-success-500/20">
            <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-success-500" />
            Aktif
          </span>
        </div>
        <p className="text-slate-500 text-sm">
          {user?.tenant.name
            ? `${user.tenant.name} hesabına genel bakış`
            : "Panele genel bakış"}
          {todayLabel && (
            <>
              <span className="mx-2 text-slate-300">·</span>
              <span>{todayLabel}</span>
            </>
          )}
        </p>
      </header>

      {/* KPI grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Aktif İhaleler"
          value={stats?.tenders.active}
          icon={FileText}
          accent="brand"
          hint="Yayında ve teklif kabul ediyor"
        />
        <KpiCard
          label="Kazandırma Aşamasında"
          value={stats?.tenders.inAward}
          icon={CheckSquare}
          accent="warning"
          hint="Süresi dolmuş, kazandırma bekleyen"
        />
        <KpiCard
          label="Aktif Tedarikçiler"
          value={stats?.suppliers.active}
          icon={Users}
          accent="indigo"
          hint="Onaylı listenizde"
        />
        <KpiCard
          label="Bekleyen Siparişler"
          value={stats?.orders.pending}
          icon={Package}
          accent="success"
          hint="Tedarikçi henüz kabul etmedi"
        />
      </div>

      {/* Son 30 gün özeti */}
      {stats ? (
        <section className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50/60 via-white to-indigo-50/40 p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-brand-600" />
            <h2 className="text-xs font-bold text-brand-900 uppercase tracking-wider">
              Son 30 Gün
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">
                Tamamlanan İhale
              </p>
              <p className="text-2xl font-bold text-brand-900 tabular-nums mt-1">
                {stats.last30Days.completedTenders}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">
                Gelen Teklif
              </p>
              <p className="text-2xl font-bold text-brand-900 tabular-nums mt-1">
                {stats.last30Days.bidsReceived}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">
                Toplam Harcama
              </p>
              <p className="text-2xl font-bold text-brand-900 tabular-nums mt-1">
                {formatTRY(stats.last30Days.totalSpend)}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {/* Onboarding — yeni hesap (hiç veri yok) ise */}
      {allEmpty ? (
        <OnboardingCard
          heading="Supkeys'e hoş geldin"
          subtitle="İlk değerini almak için 3 hızlı adım"
          steps={[
            {
              title: "İlk tedarikçini ekle",
              description:
                "Mevcut tedarikçilerini davet et veya tedarikçi havuzundan keşfet.",
              ctaLabel: "Tedarikçi Ekle",
              ctaHref: "/dashboard/tedarikciler",
              duration: "2dk",
            },
            {
              title: "İlk ihaleni aç",
              description:
                "Talebini yayınla, tekliflerini topla, tasarruf et.",
              ctaLabel: "İhale Oluştur",
              ctaHref: "/dashboard/ihaleler/yeni",
              duration: "5dk",
            },
            {
              title: "Ekibine üye davet et",
              description:
                "Satın almacı veya onaylayıcı kullanıcılar ekle.",
              ctaLabel: "Davet Gönder",
              ctaHref: "/dashboard/ayarlar",
              duration: "1dk",
            },
          ]}
        />
      ) : null}

      {/* Alt grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {stats && stats.tenders.active === 0 && stats.tenders.inAward === 0 ? (
          <EmptyPanel
            heading="Yaklaşan İhaleler"
            subtitle="Kapanışı yaklaşan ihaleler burada görünecek."
            icon={Calendar}
            iconAccent="brand"
            emptyTitle="Aktif ihale yok"
            emptyDescription="İlk ihaleni oluşturarak tasarrufa başla."
            ctaLabel="İlk ihalemi aç"
            ctaHref="/dashboard/ihaleler/yeni"
          />
        ) : (
          <section className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
            <header className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-display font-bold text-base text-brand-900">
                  Aktif İhaleleriniz
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Yayında ve kazandırmayı bekleyen ihaleler
                </p>
              </div>
            </header>
            <ActiveTendersSummary stats={stats!} />
          </section>
        )}

        <section className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
          <header className="mb-4 flex items-center gap-2">
            <Activity className="h-4 w-4 text-indigo-600" />
            <h2 className="font-display font-bold text-base text-brand-900">
              Son Aktiviteler
            </h2>
          </header>
          <ActivityFeed
            rows={activities.map(toActivityRow)}
            emptyMessage="Henüz aktivite yok"
            emptyIcon={Activity}
          />
        </section>
      </div>
    </div>
  );
}

function ActiveTendersSummary({
  stats,
}: {
  stats: NonNullable<ReturnType<typeof useTenantDashboardStats>["data"]>;
}) {
  const items = [
    {
      label: "Yayında",
      value: stats.tenders.active,
      href: "/dashboard/ihaleler?tab=open",
      tone: "bg-success-50 text-success-700",
    },
    {
      label: "Kazandırma",
      value: stats.tenders.inAward,
      href: "/dashboard/ihaleler?tab=in-award",
      tone: "bg-warning-50 text-warning-700",
    },
    {
      label: "Taslak",
      value: stats.tenders.draft,
      href: "/dashboard/ihaleler?tab=draft",
      tone: "bg-slate-100 text-slate-700",
    },
    {
      label: "Tamamlandı",
      value: stats.tenders.awarded,
      href: "/dashboard/ihaleler?tab=awarded",
      tone: "bg-brand-50 text-brand-700",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((it) => (
        <a
          key={it.label}
          href={it.href}
          className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-100 hover:border-brand-300 hover:bg-slate-50 transition"
        >
          <span className="text-sm text-slate-600">{it.label}</span>
          <span
            className={`inline-flex min-w-[2.5rem] items-center justify-center px-2.5 py-1 rounded-md text-sm font-bold tabular-nums ${it.tone}`}
          >
            {it.value}
          </span>
        </a>
      ))}
    </div>
  );
}

function toActivityRow(activity: TenantActivity) {
  if (activity.type === "tender") {
    const statusMeta =
      TENDER_STATUS_META[activity.data.status as TenderStatus];
    return {
      href: `/dashboard/ihaleler/${activity.data.id}`,
      icon: FileText,
      iconBgClass: "bg-brand-50",
      iconClass: "text-brand-600",
      label: `${activity.data.tenderNumber} — ${activity.data.title}`,
      sublabel: `İhale · ${statusMeta?.label ?? activity.data.status}`,
      timestamp: activity.timestamp,
    };
  }
  if (activity.type === "bid") {
    return {
      href: `/dashboard/ihaleler/${activity.data.tender.id}/teklif/${activity.data.id}`,
      icon: TrendingUp,
      iconBgClass: "bg-success-50",
      iconClass: "text-success-600",
      label: `${activity.data.supplier.companyName} teklif verdi`,
      sublabel: `${activity.data.tender.tenderNumber} · v${activity.data.version}`,
      timestamp: activity.timestamp,
    };
  }
  return {
    href: `/dashboard/siparisler/${activity.data.id}`,
    icon: Package,
    iconBgClass: "bg-purple-50",
    iconClass: "text-purple-600",
    label: `${activity.data.orderNumber} oluşturuldu`,
    sublabel: activity.data.supplier.companyName,
    timestamp: activity.timestamp,
  };
}
