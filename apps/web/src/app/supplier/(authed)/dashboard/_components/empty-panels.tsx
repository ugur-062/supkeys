"use client";

import { ActivityFeed } from "@/components/dashboard/activity-feed";
import {
  useSupplierRecentActivity,
  type SupplierActivity,
} from "@/hooks/use-supplier-dashboard";
import { Activity, FileText, Mail, Package } from "lucide-react";

function toRow(activity: SupplierActivity) {
  if (activity.type === "invitation") {
    return {
      href: `/supplier/ihaleler/${activity.data.tender.id}`,
      icon: Mail,
      iconBgClass: "bg-warning-50",
      iconClass: "text-warning-600",
      label: `Yeni davet: ${activity.data.tender.title}`,
      sublabel: activity.data.tender.tenderNumber,
      timestamp: activity.timestamp,
    };
  }
  if (activity.type === "bid") {
    return {
      href: `/supplier/ihaleler/${activity.data.tender.id}`,
      icon: FileText,
      iconBgClass: "bg-indigo-50",
      iconClass: "text-indigo-600",
      label: `Teklifim: ${activity.data.tender.title} (v${activity.data.version})`,
      sublabel: `${activity.data.tender.tenderNumber} · ${activity.data.status}`,
      timestamp: activity.timestamp,
    };
  }
  return {
    href: `/supplier/siparisler/${activity.data.id}`,
    icon: Package,
    iconBgClass: "bg-success-50",
    iconClass: "text-success-600",
    label: `${activity.data.orderNumber} oluşturuldu`,
    sublabel: activity.data.tenant.name,
    timestamp: activity.timestamp,
  };
}

export function SupplierEmptyPanels() {
  const activityQuery = useSupplierRecentActivity(10);
  const activities = activityQuery.data ?? [];

  return (
    <section className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6">
      <header className="mb-4 flex items-center gap-2">
        <Activity className="h-4 w-4 text-indigo-600" />
        <h2 className="font-display font-bold text-base text-brand-900">
          Son Aktiviteler
        </h2>
      </header>
      <ActivityFeed
        rows={activities.map(toRow)}
        emptyMessage="Henüz aktivite yok"
        emptyIcon={Activity}
      />
    </section>
  );
}
