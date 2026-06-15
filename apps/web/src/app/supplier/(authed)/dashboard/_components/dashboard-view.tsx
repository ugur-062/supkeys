"use client";

import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { PanelCard } from "@/components/supplier/panel-card";
import { Button } from "@/components/ui/button";
import { TcmbRatesWidget } from "@/components/tcmb-rates-widget";
import { useSupplierAuth } from "@/hooks/use-supplier-auth";
import {
  type SupplierActivity,
  useSupplierDashboardStats,
  useSupplierRecentActivity,
} from "@/hooks/use-supplier-dashboard";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Award,
  Briefcase,
  Clock,
  FileText,
  Package,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";

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
  icon: typeof Briefcase;
  gradient: string;
  iconBg: string;
  iconColor: string;
  href: string;
  hint?: string;
}

function KpiCard({
  label,
  value,
  icon: Icon,
  gradient,
  iconBg,
  iconColor,
  href,
  hint,
}: KpiCardProps) {
  return (
    <Link href={href} className="block group">
      <div
        className={`${gradient} border border-slate-200/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all h-full`}
      >
        <div className="flex items-start justify-between mb-3">
          <div
            className={`${iconBg} ${iconColor} h-10 w-10 rounded-xl flex items-center justify-center`}
          >
            <Icon className="h-5 w-5" />
          </div>
          <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
        </div>
        <p className="text-3xl font-display font-bold text-brand-900 tabular-nums">
          {value}
        </p>
        <p className="text-xs text-slate-600 font-medium mt-1">{label}</p>
        {hint ? (
          <p className="text-[11px] text-slate-500 mt-2">{hint}</p>
        ) : null}
      </div>
    </Link>
  );
}

function toActivityRow(activity: SupplierActivity) {
  if (activity.type === "invitation") {
    return {
      href: `/supplier/ihaleler/${activity.data.tender.id}`,
      icon: Briefcase,
      iconBgClass: "bg-blue-50",
      iconClass: "text-blue-600",
      label: `Yeni davet: ${activity.data.tender.title}`,
      sublabel: activity.data.tender.tenderNumber,
      timestamp: activity.timestamp,
    };
  }
  if (activity.type === "bid") {
    return {
      href: `/supplier/ihaleler/${activity.data.tender.id}`,
      icon: FileText,
      iconBgClass: "bg-violet-50",
      iconClass: "text-violet-600",
      label: `Teklifim: ${activity.data.tender.title}`,
      sublabel: `${activity.data.tender.tenderNumber} · v${activity.data.version}`,
      timestamp: activity.timestamp,
    };
  }
  return {
    href: `/supplier/siparisler/${activity.data.id}`,
    icon: Package,
    iconBgClass: "bg-emerald-50",
    iconClass: "text-emerald-600",
    label: `${activity.data.orderNumber}`,
    sublabel: activity.data.tenant.name,
    timestamp: activity.timestamp,
  };
}

export function SupplierDashboardView() {
  const { supplierUser, supplier } = useSupplierAuth();
  const { data: stats, isLoading } = useSupplierDashboardStats();
  const { data: activities = [] } = useSupplierRecentActivity(8);

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
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Welcome header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="mb-1 font-display text-2xl font-bold leading-tight text-brand-900 sm:text-3xl">
            Hoş geldin, {supplierUser?.firstName ?? "—"}
          </h1>
          <p className="text-sm text-slate-500">
            {supplier?.companyName
              ? `${supplier.companyName} hesabına genel bakış`
              : "Hesabınıza genel bakış"}
            {today && (
              <>
                <span className="mx-2 text-slate-300">·</span>
                <span>{today}</span>
              </>
            )}
          </p>
        </div>
        <Link href="/supplier/ihaleler" className="flex-shrink-0">
          <Button variant="primary">
            İhaleleri Görüntüle
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </header>

      {/* Action items banner */}
      {actionItems.length > 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-bold text-amber-900 text-sm mb-2">
                Aksiyon Bekleyen İşler
              </h4>
              <ul className="space-y-1.5">
                {actionItems.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className="text-sm text-amber-700 hover:text-amber-900 hover:underline inline-flex items-center gap-1.5"
                    >
                      <ArrowRight className="h-3 w-3" />
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Aktif Davetler"
          value={isLoading ? "…" : activeInvitations}
          icon={Briefcase}
          gradient="bg-gradient-to-br from-blue-50 via-blue-100/40 to-white"
          iconBg="bg-blue-100"
          iconColor="text-blue-600"
          href="/supplier/ihaleler?tab=active"
          hint="Henüz teklif vermediğin"
        />
        <KpiCard
          label="Aktif Tekliflerim"
          value={isLoading ? "…" : activeBids}
          icon={Clock}
          gradient="bg-gradient-to-br from-amber-50 via-amber-100/40 to-white"
          iconBg="bg-amber-100"
          iconColor="text-amber-600"
          href="/supplier/ihaleler?tab=active"
          hint="Verilmiş + değerlendirilen"
        />
        <KpiCard
          label="Kazanılan İhale"
          value={isLoading ? "…" : wonTenders}
          icon={Award}
          gradient="bg-gradient-to-br from-emerald-50 via-emerald-100/40 to-white"
          iconBg="bg-emerald-100"
          iconColor="text-emerald-600"
          href="/supplier/ihaleler?tab=past"
          hint="Toplam kazanım"
        />
        <KpiCard
          label="Aktif Sipariş"
          value={isLoading ? "…" : pendingOrders}
          icon={Package}
          gradient="bg-gradient-to-br from-violet-50 via-violet-100/40 to-white"
          iconBg="bg-violet-100"
          iconColor="text-violet-600"
          href="/supplier/siparisler"
          hint="Teslimat bekleyen"
        />
      </div>

      {/* 2-kolon: Performans + sidebar (TCMB + activity) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <PanelCard title="Performans" subtitle="Son 30 gün ve toplam özet">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-xl bg-violet-50/50 border border-violet-100 p-4">
                <p className="text-xs text-violet-700 uppercase tracking-wide font-semibold">
                  Son 30 Gün Teklif
                </p>
                <p className="text-2xl font-bold text-brand-900 tabular-nums mt-1">
                  {stats?.last30Days?.bidsSubmitted ?? 0}
                </p>
              </div>
              <div className="rounded-xl bg-emerald-50/50 border border-emerald-100 p-4">
                <p className="text-xs text-emerald-700 uppercase tracking-wide font-semibold">
                  Toplam Gelir
                </p>
                <p className="text-2xl font-bold text-brand-900 tabular-nums mt-1">
                  {formatTRY(totalRevenue)}
                </p>
              </div>
              <div className="rounded-xl bg-blue-50/50 border border-blue-100 p-4">
                <p className="text-xs text-blue-700 uppercase tracking-wide font-semibold">
                  Bağlı Alıcı
                </p>
                <p className="text-2xl font-bold text-brand-900 tabular-nums mt-1">
                  {stats?.buyers?.active ?? 0}
                </p>
              </div>
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
                icon={Briefcase}
                label="Aktif Davetlerim"
              />
              <QuickLink
                href="/supplier/siparisler"
                icon={Package}
                label="Siparişlerim"
              />
              <QuickLink
                href="/supplier/profil"
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

function QuickLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof Briefcase;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-slate-50 transition-colors text-sm"
    >
      <Icon className="h-4 w-4 text-slate-500" />
      <span className="text-brand-900 font-medium flex-1">{label}</span>
      <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
    </Link>
  );
}
