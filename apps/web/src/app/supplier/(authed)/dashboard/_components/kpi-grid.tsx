"use client";

import { useSupplierDashboardStats } from "@/hooks/use-supplier-dashboard";
import { cn } from "@/lib/utils";
import {
  Building2,
  FileText,
  type LucideIcon,
  Mail,
  Package,
  Trophy,
} from "lucide-react";

interface KpiCardProps {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  iconClass: string;
  isEmpty: boolean;
}

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  iconClass,
  isEmpty,
}: KpiCardProps) {
  return (
    <div className="card p-5 hover:shadow-card-hover transition-shadow">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-xs uppercase tracking-wider text-slate-500 font-medium">
          {label}
        </p>
        <div
          className={cn(
            "h-8 w-8 rounded-lg flex items-center justify-center",
            iconClass,
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-3xl font-display font-bold text-brand-900 tabular-nums">
          {value}
        </p>
        <div className="flex items-center gap-2">
          {isEmpty ? (
            <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[10px] font-medium">
              Henüz veri yok
            </span>
          ) : null}
          <span className="text-xs text-slate-500">{hint}</span>
        </div>
      </div>
    </div>
  );
}

function formatTRY(amount: number): string {
  if (!Number.isFinite(amount) || amount === 0) return "₺0";
  return amount.toLocaleString("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  });
}

export function SupplierKpiGrid() {
  const stats = useSupplierDashboardStats();

  const valueOf = (n: number | undefined) =>
    typeof n === "number" ? String(n) : "—";

  const activeInvitations = stats.data?.invitations.active;
  const activeBids = stats.data?.bids.active;
  const wonTenders = stats.data?.wonTenders;
  const pendingOrders = stats.data?.orders.pending;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Aktif Davetler"
          value={valueOf(activeInvitations)}
          hint="Henüz teklif vermediğiniz açık ihaleler"
          icon={Mail}
          iconClass="bg-warning-50 text-warning-600"
          isEmpty={!activeInvitations}
        />
        <KpiCard
          label="Aktif Tekliflerim"
          value={valueOf(activeBids)}
          hint="Verilmiş ve değerlendirilen teklifler"
          icon={FileText}
          iconClass="bg-indigo-50 text-indigo-600"
          isEmpty={!activeBids}
        />
        <KpiCard
          label="Kazandığım İhaleler"
          value={valueOf(wonTenders)}
          hint="Toplam kazanım sayısı"
          icon={Trophy}
          iconClass="bg-success-50 text-success-600"
          isEmpty={!wonTenders}
        />
        <KpiCard
          label="Bekleyen Siparişler"
          value={valueOf(pendingOrders)}
          hint="Henüz kabul etmediğim siparişler"
          icon={Package}
          iconClass="bg-brand-50 text-brand-600"
          isEmpty={!pendingOrders}
        />
      </div>

      {/* Performans özeti */}
      {stats.data ? (
        <section className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50/60 via-white to-emerald-50/40 p-6">
          <h2 className="text-xs font-bold text-brand-900 uppercase tracking-wider mb-4">
            Performans
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <Stat
              label="Son 30 Gün Teklif"
              value={String(stats.data.last30Days.bidsSubmitted)}
              icon={FileText}
              iconClass="text-indigo-600"
            />
            <Stat
              label="Toplam Gelir"
              value={formatTRY(stats.data.revenue.total)}
              icon={Trophy}
              iconClass="text-success-600"
            />
            <Stat
              label="Bağlı Alıcı"
              value={String(stats.data.buyers.active)}
              icon={Building2}
              iconClass="text-brand-600"
            />
          </div>
        </section>
      ) : null}
    </>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  iconClass,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  iconClass: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center flex-shrink-0 shadow-sm">
        <Icon className={cn("h-5 w-5", iconClass)} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">
          {label}
        </p>
        <p className="text-xl font-bold text-brand-900 tabular-nums mt-0.5">
          {value}
        </p>
      </div>
    </div>
  );
}
