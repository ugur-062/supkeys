"use client";

import { useSupplierTenderStats } from "@/hooks/use-supplier-tenders";
import { cn } from "@/lib/utils";
import {
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

export function SupplierKpiGrid() {
  const stats = useSupplierTenderStats();

  const value = (n: number | undefined) =>
    typeof n === "number" ? String(n) : "—";

  const ongoingOrders = stats.data?.ongoingOrders;
  const wonTenders = stats.data?.wonTenders;
  const submittedBids = stats.data?.submittedBids;
  const activeInvitations = stats.data?.activeInvitations;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        label="Devam Eden Siparişler"
        value={value(ongoingOrders)}
        hint="Aktif siparişleriniz"
        icon={Package}
        iconClass="bg-brand-50 text-brand-600"
        isEmpty={ongoingOrders === undefined || ongoingOrders === 0}
      />
      <KpiCard
        label="Kazandığınız İhaleler"
        value={value(wonTenders)}
        hint="Toplam kazanılan"
        icon={Trophy}
        iconClass="bg-success-50 text-success-600"
        isEmpty={wonTenders === undefined || wonTenders === 0}
      />
      <KpiCard
        label="Teklif Verdiğiniz İhaleler"
        value={value(submittedBids)}
        hint="Verilmiş teklif sayısı"
        icon={FileText}
        iconClass="bg-indigo-50 text-indigo-600"
        isEmpty={submittedBids === undefined || submittedBids === 0}
      />
      <KpiCard
        label="Davet Edildiğiniz İhaleler"
        value={value(activeInvitations)}
        hint="Aktif davetler"
        icon={Mail}
        iconClass="bg-warning-50 text-warning-600"
        isEmpty={activeInvitations === undefined || activeInvitations === 0}
      />
    </div>
  );
}
