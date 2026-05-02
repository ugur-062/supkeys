"use client";

import { useTenderStats } from "@/hooks/use-tenant-tenders";
import { cn } from "@/lib/utils";
import {
  Award,
  CheckCircle2,
  Clock,
  FileText,
  ListChecks,
  Send,
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
    <div className="card p-4 flex items-center gap-3">
      <div
        className={cn(
          "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
          accent,
        )}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-slate-500 uppercase tracking-wide">
          {label}
        </div>
        <div className="text-2xl font-display font-bold text-brand-900">
          {value}
        </div>
      </div>
    </div>
  );
}

export function TenderStatsCards() {
  const stats = useTenderStats();
  const display = (n: number) => (stats.isLoading ? "…" : n.toString());

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <KpiCard
        label="Toplam"
        value={display(stats.data?.total ?? 0)}
        icon={ListChecks}
        accent="bg-slate-100 text-slate-700"
      />
      <KpiCard
        label="Taslak"
        value={display(stats.data?.draft ?? 0)}
        icon={FileText}
        accent="bg-slate-100 text-slate-600"
      />
      <KpiCard
        label="Yayında"
        value={display(stats.data?.openForBids ?? 0)}
        icon={Send}
        accent="bg-success-50 text-success-600"
      />
      <KpiCard
        label="Kazandırma"
        value={display(stats.data?.inAward ?? 0)}
        icon={Clock}
        accent="bg-warning-50 text-warning-600"
      />
      <KpiCard
        label="Tamamlandı"
        value={display(stats.data?.awarded ?? 0)}
        icon={Award}
        accent="bg-brand-50 text-brand-700"
      />
      <KpiCard
        label="İptal/Kapalı"
        value={display(
          (stats.data?.cancelled ?? 0) + (stats.data?.closedNoAward ?? 0),
        )}
        icon={XCircle}
        accent="bg-danger-50 text-danger-600"
      />
    </div>
  );
}

// silence unused import warning when tree-shake disabled
export const _CheckCircle2 = CheckCircle2;
