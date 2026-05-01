"use client";

import { useSupplierApplicationStats } from "@/hooks/use-supplier-applications";
import {
  CheckCircle2,
  Clock,
  ListChecks,
  Mail,
  XCircle,
} from "lucide-react";

interface KpiCardProps {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}

function KpiCard({ label, value, icon: Icon, accent }: KpiCardProps) {
  return (
    <div className="admin-card p-4 flex items-center gap-3">
      <div
        className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${accent}`}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-admin-text-muted uppercase tracking-wide">
          {label}
        </div>
        <div className="text-2xl font-display font-bold text-admin-text">
          {value}
        </div>
      </div>
    </div>
  );
}

export function SupplierStatsCards() {
  const stats = useSupplierApplicationStats();
  const total = stats.data?.total ?? 0;
  const pendingEmail = stats.data?.byStatus.PENDING_EMAIL_VERIFICATION ?? 0;
  const review = stats.data?.byStatus.PENDING_REVIEW ?? 0;
  const approved = stats.data?.byStatus.APPROVED ?? 0;
  const rejected = stats.data?.byStatus.REJECTED ?? 0;

  const display = (n: number) => (stats.isLoading ? "…" : n.toString());

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <KpiCard
        label="Toplam"
        value={display(total)}
        icon={ListChecks}
        accent="bg-slate-100 text-slate-700"
      />
      <KpiCard
        label="E-posta Bekliyor"
        value={display(pendingEmail)}
        icon={Mail}
        accent="bg-warning-50 text-warning-600"
      />
      <KpiCard
        label="İncelemede"
        value={display(review)}
        icon={Clock}
        accent="bg-brand-100 text-brand-700"
      />
      <KpiCard
        label="Onaylanan"
        value={display(approved)}
        icon={CheckCircle2}
        accent="bg-success-50 text-success-600"
      />
      <KpiCard
        label="Reddedilen"
        value={display(rejected)}
        icon={XCircle}
        accent="bg-danger-50 text-danger-600"
      />
    </div>
  );
}
