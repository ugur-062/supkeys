"use client";

import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import { PanelCard } from "@/components/supplier/panel-card";
import { TrendBadge } from "@/components/ui/trend-badge";
import { TcmbRatesWidget } from "@/components/tcmb-rates-widget";
import { useSupplierAuth } from "@/hooks/use-supplier-auth";
import {
  type SupplierActivity,
  useSupplierDashboardStats,
  useSupplierRecentActivity,
} from "@/hooks/use-supplier-dashboard";
import {
  ArrowRightIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from "@heroicons/react/20/solid";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Activity, Briefcase, FileText, Package } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

function formatTRY(amount: number): string {
  if (!Number.isFinite(amount) || amount === 0) return "₺0";
  return amount.toLocaleString("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  });
}

interface KpiCardProps {
  label: string;
  value: number | string;
  href: string;
  hint?: string;
  /** Etiket başındaki küçük renkli nokta (örn. "bg-amber-500"). */
  dot?: string;
}

function KpiCard({ label, value, href, hint, dot }: KpiCardProps) {
  return (
    <Link
      href={href}
      className="group block rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5 transition hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {dot ? (
            <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
          ) : null}
          <p className="truncate text-sm font-bold text-zinc-800">{label}</p>
        </div>
        <ArrowRightIcon className="h-4 w-4 shrink-0 text-zinc-300 transition-colors group-hover:text-zinc-500" />
      </div>
      <p className="mt-3 text-3xl font-semibold tabular-nums text-zinc-950">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </Link>
  );
}

function MiniStat({
  label,
  value,
  trend,
}: {
  label: string;
  value: string | number;
  trend?: { current: number; previous: number };
}) {
  return (
    <div className="rounded-xl bg-zinc-50 p-4 ring-1 ring-zinc-950/5">
      <p className="text-sm font-bold text-zinc-800">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-950">
        {value}
      </p>
      {trend ? (
        <TrendBadge current={trend.current} previous={trend.previous} />
      ) : null}
    </div>
  );
}

function toActivityRow(activity: SupplierActivity) {
  if (activity.type === "invitation") {
    return {
      href: `/supplier/ihaleler/${activity.data.tender.id}`,
      icon: Briefcase,
      iconBgClass: "bg-zinc-100",
      iconClass: "text-zinc-600",
      label: `Yeni davet: ${activity.data.tender.title}`,
      sublabel: activity.data.tender.tenderNumber,
      timestamp: activity.timestamp,
    };
  }
  if (activity.type === "bid") {
    return {
      href: `/supplier/ihaleler/${activity.data.tender.id}`,
      icon: FileText,
      iconBgClass: "bg-zinc-100",
      iconClass: "text-zinc-600",
      label: `Teklifim: ${activity.data.tender.title}`,
      sublabel: `${activity.data.tender.tenderNumber} · v${activity.data.version}`,
      timestamp: activity.timestamp,
    };
  }
  return {
    href: `/supplier/siparisler/${activity.data.id}`,
    icon: Package,
    iconBgClass: "bg-zinc-100",
    iconClass: "text-zinc-600",
    label: `${activity.data.orderNumber}`,
    sublabel: activity.data.tenant.name,
    timestamp: activity.timestamp,
  };
}

export function SupplierDashboardView() {
  const { supplier } = useSupplierAuth();
  const { data: stats, isLoading } = useSupplierDashboardStats();
  const { data: activities = [] } = useSupplierRecentActivity(8);
  const [actionsDismissed, setActionsDismissed] = useState(false);

  const today = format(new Date(), "d MMMM yyyy, EEEE", { locale: tr });

  const activeInvitations = stats?.invitations?.active ?? 0;
  const activeBids = stats?.bids?.active ?? 0;
  const wonTenders = stats?.wonTenders ?? 0;
  const pendingOrders = stats?.orders?.pending ?? 0;
  const totalRevenue = stats?.revenue?.total ?? 0;

  // Aksiyon bekleyen işler — frontend compute (basit heuristik).
  const actionItems: { label: string; href: string }[] = [];
  if (activeInvitations > 0) {
    actionItems.push({
      label: `${activeInvitations} aktif davete teklif bekleniyor`,
      href: "/supplier/ihaleler?tab=active",
    });
  }
  if (pendingOrders > 0) {
    actionItems.push({
      label: `${pendingOrders} sipariş için teslimat başlatılmadı`,
      href: "/supplier/siparisler?status=PENDING",
    });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      {/* Welcome header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Heading>Tedarikçi Paneli</Heading>
          <Text className="mt-1">
            {supplier?.companyName ?? "—"}
            <span className="mx-2 text-zinc-300">·</span>
            <span>{today}</span>
          </Text>
        </div>
        <Link href="/supplier/ihaleler" className="flex-shrink-0">
          <Button>
            İhaleleri Görüntüle
            <ArrowRightIcon data-slot="icon" />
          </Button>
        </Link>
      </header>

      {/* Action items — minimal tek satır, kapatılabilir */}
      {actionItems.length > 0 && !actionsDismissed ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
          <ExclamationTriangleIcon className="size-4 shrink-0 text-amber-500" />
          <div className="flex flex-1 flex-wrap items-center gap-x-1 text-amber-800">
            {actionItems.map((item, i) => (
              <span key={item.label} className="inline-flex items-center">
                <Link href={item.href} className="font-medium hover:underline">
                  {item.label}
                </Link>
                {i < actionItems.length - 1 ? (
                  <span className="mx-1 text-amber-300">·</span>
                ) : null}
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setActionsDismissed(true)}
            aria-label="Kapat"
            className="shrink-0 rounded p-0.5 text-amber-500 transition-colors hover:bg-amber-100 hover:text-amber-700"
          >
            <XMarkIcon className="size-4" />
          </button>
        </div>
      ) : null}

      {/* KPI Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Aktif Davetler"
          value={isLoading ? "…" : activeInvitations}
          href="/supplier/ihaleler?tab=active"
          hint="Henüz teklif vermediğin"
          dot="bg-green-500"
        />
        <KpiCard
          label="Aktif Tekliflerim"
          value={isLoading ? "…" : activeBids}
          href="/supplier/ihaleler?tab=active"
          hint="Verilmiş + değerlendirilen"
          dot="bg-amber-500"
        />
        <KpiCard
          label="Kazanılan İhale"
          value={isLoading ? "…" : wonTenders}
          href="/supplier/ihaleler?tab=past"
          hint="Toplam kazanım"
        />
        <KpiCard
          label="Aktif Sipariş"
          value={isLoading ? "…" : pendingOrders}
          href="/supplier/siparisler"
          hint="Teslimat bekleyen"
        />
      </div>

      {/* 2-kolon: Performans + sidebar (TCMB + activity) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <PanelCard title="Performans" subtitle="Son 30 gün ve toplam özet">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MiniStat
                label="Son 30 Gün Teklif"
                value={stats?.last30Days?.bidsSubmitted ?? 0}
                trend={{
                  current: stats?.last30Days?.bidsSubmitted ?? 0,
                  previous: stats?.last30Days?.prevBidsSubmitted ?? 0,
                }}
              />
              <MiniStat
                label="Toplam Gelir"
                value={formatTRY(totalRevenue)}
                trend={{
                  current: stats?.revenue?.last30 ?? 0,
                  previous: stats?.revenue?.prev30 ?? 0,
                }}
              />
              <MiniStat
                label="Bağlı Müşteri"
                value={stats?.buyers?.active ?? 0}
              />
            </div>
          </PanelCard>

          <PanelCard
            title="Son Aktiviteler"
            subtitle="Davetler, teklifler ve siparişlerden"
          >
            <ActivityFeed
              rows={activities.map(toActivityRow)}
              emptyMessage="Henüz aktivite yok"
              emptyIcon={Activity}
              maxHeightClass="max-h-80"
              hideIcon
            />
          </PanelCard>
        </div>

        <div className="space-y-4">
          <TcmbRatesWidget />

          {/* Hızlı linkler */}
          <PanelCard title="Hızlı Erişim" padding="sm">
            <div className="space-y-1">
              <QuickLink
                href="/supplier/ihaleler?tab=active"
                label="Aktif Davetlerim"
              />
              <QuickLink href="/supplier/siparisler" label="Siparişlerim" />
              <QuickLink href="/supplier/profil" label="Firma Profilim" />
            </div>
          </PanelCard>
        </div>
      </div>
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-zinc-50"
    >
      <span className="flex-1 font-medium text-zinc-950">{label}</span>
      <ArrowRightIcon className="h-3.5 w-3.5 text-zinc-400" />
    </Link>
  );
}
