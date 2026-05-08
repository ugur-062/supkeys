"use client";

import { AdminShell } from "@/components/layout/admin-shell";
import { RequireAdminAuth } from "@/components/providers/auth-hydration";
import {
  useAdminTenantDetail,
  type AdminTenantDetail,
} from "@/hooks/use-admin-tenants";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  Building2,
  ChevronLeft,
  FileText,
  Package,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

const TENDER_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Taslak",
  IN_APPROVAL: "Onayda (Yayın)",
  OPEN_FOR_BIDS: "Tekliflere Açık",
  IN_AWARD: "Kazandırma",
  IN_AWARD_APPROVAL: "Onayda (Kazandırma)",
  AWARDED: "Kazandırıldı",
  CANCELLED: "İptal",
  CLOSED_NO_AWARD: "Kazandırılmadı",
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: "Bekliyor",
  IN_DELIVERY: "Teslimatta",
  ACCEPTED: "Kabul Edildi",
  IN_PROGRESS: "Üretimde",
  DELIVERED: "Teslim Edildi",
  COMPLETED: "Tamamlandı",
  CANCELLED: "İptal",
};

const ROLE_LABELS: Record<string, string> = {
  COMPANY_ADMIN: "Firma Yöneticisi",
  BUYER: "Satınalmacı",
  APPROVER: "Onaylayıcı",
};

function DetailContent() {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : null;
  const query = useAdminTenantDetail(id);

  if (query.isLoading || !query.data) {
    return (
      <div className="space-y-6 max-w-[1200px]">
        <div className="h-6 bg-slate-200 rounded animate-pulse w-32" />
        <div className="h-24 bg-slate-200 rounded-2xl animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-24 bg-slate-200 rounded-2xl animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <Building2 className="h-12 w-12 text-slate-300 mx-auto mb-3" />
        <p className="font-semibold text-admin-text">Tenant bulunamadı</p>
        <Link
          href="/admin/tenants"
          className="text-sm text-brand-600 hover:underline mt-2 inline-block"
        >
          ← Listeye dön
        </Link>
      </div>
    );
  }

  const t = query.data;

  return (
    <div className="space-y-6 max-w-[1200px]">
      <Link
        href="/admin/tenants"
        className="text-sm text-admin-text-muted hover:text-brand-600 inline-flex items-center gap-1"
      >
        <ChevronLeft className="h-4 w-4" />
        Tüm Tenant'lar
      </Link>

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="h-16 w-16 rounded-2xl bg-brand-50 flex items-center justify-center flex-shrink-0">
          <Building2 className="h-8 w-8 text-brand-500" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-display font-bold text-admin-text">
            {t.name}
          </h1>
          <p className="text-sm text-admin-text-muted mt-1">
            VKN: {t.taxNumber ?? "—"}
            {t.city ? ` · ${t.city}` : ""} · Kayıt:{" "}
            {format(new Date(t.createdAt), "d MMMM yyyy", { locale: tr })}
          </p>
        </div>
      </div>

      {/* Mini KPI'lar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MiniStat
          icon={Users}
          label="Kullanıcı"
          value={t._count.users}
          accent="brand"
        />
        <MiniStat
          icon={Truck}
          label="Aktif Tedarikçi"
          value={t._count.supplierRelations}
          accent="purple"
        />
        <MiniStat
          icon={FileText}
          label="İhale"
          value={t._count.tenders}
          accent="indigo"
        />
        <MiniStat
          icon={Package}
          label="Sipariş"
          value={t._count.orders}
          accent="success"
        />
      </div>

      {/* Toplam Harcama */}
      <div className="rounded-2xl p-6 text-white bg-gradient-to-r from-success-500 to-success-600">
        <p className="text-xs uppercase opacity-85 font-semibold tracking-wide">
          Toplam Harcama (Tamamlanan Siparişler)
        </p>
        <p className="text-3xl font-display font-bold mt-2">
          {Number(t.analytics.totalSpendCompleted).toLocaleString("tr-TR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{" "}
          TRY
        </p>
        <p className="text-xs opacity-85 mt-1">
          Yalnızca COMPLETED durumundaki siparişlerin toplam tutarı
        </p>
      </div>

      {/* Status dağılımları */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatusDistributionCard
          title="İhale Durumları"
          rows={t.analytics.tendersByStatus}
          labels={TENDER_STATUS_LABELS}
          emptyText="Henüz ihale yok"
        />
        <StatusDistributionCard
          title="Sipariş Durumları"
          rows={t.analytics.ordersByStatus}
          labels={ORDER_STATUS_LABELS}
          emptyText="Henüz sipariş yok"
        />
      </div>

      {/* Son ihaleler */}
      <RecentTendersBlock recentTenders={t.analytics.recentTenders} />

      {/* Kullanıcılar */}
      <UsersBlock users={t.users} />
    </div>
  );
}

interface MiniStatProps {
  icon: LucideIcon;
  label: string;
  value: number;
  accent: "brand" | "purple" | "indigo" | "success";
}

const ACCENT_CLASSES = {
  brand: { bg: "bg-brand-50", icon: "text-brand-600" },
  purple: { bg: "bg-purple-50", icon: "text-purple-600" },
  indigo: { bg: "bg-indigo-50", icon: "text-indigo-600" },
  success: { bg: "bg-success-50", icon: "text-success-600" },
};

function MiniStat({ icon: Icon, label, value, accent }: MiniStatProps) {
  const styles = ACCENT_CLASSES[accent];
  return (
    <div className="admin-card p-4">
      <div
        className={cn(
          "h-9 w-9 rounded-lg flex items-center justify-center mb-2",
          styles.bg,
        )}
      >
        <Icon className={cn("h-4 w-4", styles.icon)} />
      </div>
      <p className="text-xs uppercase text-admin-text-muted font-semibold tracking-wide">
        {label}
      </p>
      <p className="text-xl font-bold text-admin-text mt-1">
        {value.toLocaleString("tr-TR")}
      </p>
    </div>
  );
}

function StatusDistributionCard({
  title,
  rows,
  labels,
  emptyText,
}: {
  title: string;
  rows: Array<{ status: string; count: number }>;
  labels: Record<string, string>;
  emptyText: string;
}) {
  return (
    <div className="admin-card p-5">
      <h3 className="font-bold text-admin-text mb-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-admin-text-muted">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.status}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-admin-text">
                {labels[r.status] ?? r.status}
              </span>
              <span className="font-mono font-semibold text-admin-text">
                {r.count}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RecentTendersBlock({
  recentTenders,
}: {
  recentTenders: AdminTenantDetail["analytics"]["recentTenders"];
}) {
  return (
    <div className="admin-card">
      <div className="px-5 py-4 border-b border-surface-border">
        <h3 className="font-bold text-admin-text">Son İhaleler</h3>
      </div>
      <div className="divide-y divide-surface-border">
        {recentTenders.length === 0 ? (
          <p className="p-5 text-sm text-admin-text-muted">İhale yok</p>
        ) : (
          recentTenders.map((t) => (
            <div
              key={t.id}
              className="px-5 py-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="font-mono text-xs text-admin-text-muted">
                  {t.tenderNumber}
                </p>
                <p className="font-semibold text-admin-text truncate">
                  {t.title}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-xs text-admin-text-muted">
                  {TENDER_STATUS_LABELS[t.status] ?? t.status}
                </span>
                <span className="text-xs text-admin-text-muted whitespace-nowrap">
                  {format(new Date(t.createdAt), "d MMM yyyy", { locale: tr })}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function UsersBlock({ users }: { users: AdminTenantDetail["users"] }) {
  return (
    <div className="admin-card">
      <div className="px-5 py-4 border-b border-surface-border">
        <h3 className="font-bold text-admin-text">
          Kullanıcılar ({users.length})
        </h3>
      </div>
      <div className="divide-y divide-surface-border">
        {users.map((u) => (
          <div
            key={u.id}
            className="px-5 py-3 flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <p className="font-semibold text-admin-text truncate">
                {u.firstName} {u.lastName}
              </p>
              <p className="text-xs text-admin-text-muted truncate">
                {u.email} · {ROLE_LABELS[u.role] ?? u.role}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <span
                className={cn(
                  "inline-flex px-2 py-0.5 rounded-md text-xs font-semibold",
                  u.isActive
                    ? "bg-success-50 text-success-700 border border-success-200"
                    : "bg-slate-100 text-slate-600 border border-slate-200",
                )}
              >
                {u.isActive ? "Aktif" : "Pasif"}
              </span>
              {u.lastLoginAt ? (
                <p className="text-xs text-admin-text-muted mt-1">
                  Son giriş:{" "}
                  {format(new Date(u.lastLoginAt), "d MMM HH:mm", {
                    locale: tr,
                  })}
                </p>
              ) : (
                <p className="text-xs text-admin-text-muted mt-1">Hiç giriş yok</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminTenantDetailPage() {
  return (
    <RequireAdminAuth>
      <AdminShell>
        <DetailContent />
      </AdminShell>
    </RequireAdminAuth>
  );
}
