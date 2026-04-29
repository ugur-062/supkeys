"use client";

import { useDemoRequestStats } from "@/hooks/use-demo-requests";
import { CheckCircle2, Inbox, ListChecks, Sparkles } from "lucide-react";

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

export function StatsCards() {
  const stats = useDemoRequestStats();

  const total = stats.data?.total ?? 0;
  const newCount = stats.data?.byStatus.NEW ?? 0;
  const demoDone = stats.data?.byStatus.DEMO_DONE ?? 0;
  const won = stats.data?.byStatus.WON ?? 0;

  const display = (n: number) => (stats.isLoading ? "…" : n.toString());

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <KpiCard
        label="Toplam"
        value={display(total)}
        icon={ListChecks}
        accent="bg-slate-100 text-slate-700"
      />
      <KpiCard
        label="Yeni"
        value={display(newCount)}
        icon={Inbox}
        accent="bg-brand-100 text-brand-700"
      />
      <KpiCard
        label="Demo Yapıldı"
        value={display(demoDone)}
        icon={Sparkles}
        accent="bg-indigo-50 text-indigo-700"
      />
      <KpiCard
        label="Kazanıldı"
        value={display(won)}
        icon={CheckCircle2}
        accent="bg-success-50 text-success-600"
      />
    </div>
  );
}
