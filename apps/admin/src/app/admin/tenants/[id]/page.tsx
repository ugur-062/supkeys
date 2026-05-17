"use client";

import { AdminShell } from "@/components/layout/admin-shell";
import { RequireAdminAuth } from "@/components/providers/auth-hydration";
import {
  useAdminTenantDetail,
  useUpdateAdminTenant,
  type AdminTenantDetail,
} from "@/hooks/use-admin-tenants";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  Building2,
  Calendar,
  Check,
  ChevronLeft,
  FileText,
  Package,
  Pencil,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

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

      {/* Üyelik + BUYER kontenjanı */}
      <div className="grid gap-4 md:grid-cols-2">
        <MembershipCard tenantId={t.id} tenant={t} />
        <BuyerSeatCard tenantId={t.id} tenant={t} />
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

function MembershipCard({
  tenantId,
  tenant,
}: {
  tenantId: string;
  tenant: AdminTenantDetail;
}) {
  const mutation = useUpdateAdminTenant(tenantId);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualValue, setManualValue] = useState(
    tenant.membershipEndAt
      ? format(new Date(tenant.membershipEndAt), "yyyy-MM-dd")
      : "",
  );

  useEffect(() => {
    setManualValue(
      tenant.membershipEndAt
        ? format(new Date(tenant.membershipEndAt), "yyyy-MM-dd")
        : "",
    );
  }, [tenant.membershipEndAt]);

  const now = Date.now();
  const endsAt = tenant.membershipEndAt
    ? new Date(tenant.membershipEndAt)
    : null;
  const expired = endsAt !== null && endsAt.getTime() < now;
  const daysLeft = endsAt
    ? Math.ceil((endsAt.getTime() - now) / (24 * 3600 * 1000))
    : null;
  const soon = !expired && daysLeft !== null && daysLeft <= 14;

  const extend = (months: number) => {
    mutation.mutate(
      { extendMonths: months },
      {
        onSuccess: () => {
          toast.success(`Üyelik ${months} ay uzatıldı`);
        },
        onError: (err: unknown) => {
          toast.error(err instanceof Error ? err.message : "Hata");
        },
      },
    );
  };

  const saveManual = () => {
    if (!manualValue) {
      mutation.mutate(
        { membershipEndAt: null },
        {
          onSuccess: () => {
            toast.success("Üyelik sınırsız yapıldı");
            setManualOpen(false);
          },
          onError: (err: unknown) => {
            toast.error(err instanceof Error ? err.message : "Hata");
          },
        },
      );
      return;
    }
    const parsed = new Date(manualValue);
    if (Number.isNaN(parsed.getTime())) {
      toast.error("Geçerli bir tarih girin");
      return;
    }
    mutation.mutate(
      { membershipEndAt: parsed.toISOString() },
      {
        onSuccess: () => {
          toast.success("Üyelik tarihi güncellendi");
          setManualOpen(false);
        },
        onError: (err: unknown) => {
          toast.error(err instanceof Error ? err.message : "Hata");
        },
      },
    );
  };

  return (
    <div className="admin-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-brand-600" />
            <h3 className="font-bold text-admin-text">Üyelik Süresi</h3>
          </div>
          <p className="mt-1 text-xs text-admin-text-muted">
            Süre dolduğunda tenant kullanıcıları giriş yapamaz.
          </p>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-[11px] uppercase tracking-wide text-admin-text-muted font-semibold">
          Bitiş Tarihi
        </p>
        <p
          className={cn(
            "mt-1 font-display text-2xl font-bold",
            expired
              ? "text-danger-600"
              : soon
                ? "text-warning-600"
                : "text-admin-text",
          )}
        >
          {endsAt
            ? format(endsAt, "d MMMM yyyy", { locale: tr })
            : "Sınırsız"}
        </p>
        {endsAt ? (
          <p
            className={cn(
              "mt-0.5 text-xs",
              expired
                ? "text-danger-600 font-semibold"
                : soon
                  ? "text-warning-700"
                  : "text-admin-text-muted",
            )}
          >
            {expired
              ? `${Math.abs(daysLeft ?? 0)} gün önce sona erdi`
              : `${daysLeft} gün kaldı`}
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {[1, 3, 6, 12].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => extend(m)}
            disabled={mutation.isPending}
            className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-100 disabled:opacity-50"
          >
            +{m} ay
          </button>
        ))}
        <button
          type="button"
          onClick={() => setManualOpen((o) => !o)}
          disabled={mutation.isPending}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-admin-text transition hover:bg-slate-50 disabled:opacity-50"
        >
          {manualOpen ? "Kapat" : "Tarih Belirle"}
        </button>
      </div>

      {manualOpen ? (
        <div className="mt-3 flex items-center gap-2">
          <input
            type="date"
            value={manualValue}
            onChange={(e) => setManualValue(e.target.value)}
            disabled={mutation.isPending}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          <button
            type="button"
            onClick={saveManual}
            disabled={mutation.isPending}
            className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" />
            Kaydet
          </button>
          <span className="text-xs text-admin-text-muted">
            (boş bırak = sınırsız)
          </span>
        </div>
      ) : null}

      {expired ? (
        <p className="mt-3 rounded-lg bg-danger-50 px-3 py-2 text-xs text-danger-700">
          Üyelik sona erdi — tenant kullanıcıları giriş yapamıyor.
        </p>
      ) : soon ? (
        <p className="mt-3 rounded-lg bg-warning-50 px-3 py-2 text-xs text-warning-700">
          Üyelik 2 hafta içinde sona eriyor. Süreyi uzatmayı düşünün.
        </p>
      ) : null}
    </div>
  );
}

function BuyerSeatCard({
  tenantId,
  tenant,
}: {
  tenantId: string;
  tenant: AdminTenantDetail;
}) {
  const mutation = useUpdateAdminTenant(tenantId);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(tenant.buyerSeatLimit));
  const usage = tenant.buyerSeatUsage;

  useEffect(() => {
    setValue(String(tenant.buyerSeatLimit));
  }, [tenant.buyerSeatLimit]);

  const isOver = usage.used > usage.limit;
  const isAtLimit = usage.used >= usage.limit && !isOver;

  const save = () => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 1000) {
      toast.error("0–1000 arası bir sayı girin");
      return;
    }
    if (parsed === tenant.buyerSeatLimit) {
      setEditing(false);
      return;
    }
    mutation.mutate(
      { buyerSeatLimit: parsed },
      {
        onSuccess: () => {
          toast.success("Kontenjan güncellendi");
          setEditing(false);
        },
        onError: (err: unknown) => {
          const msg =
            err instanceof Error ? err.message : "Güncelleme başarısız";
          toast.error(msg);
        },
      },
    );
  };

  return (
    <div className="admin-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-brand-600" />
            <h3 className="font-bold text-admin-text">Satın Almacı Kontenjanı</h3>
          </div>
          <p className="mt-1 text-xs text-admin-text-muted">
            Aktif satın almacı + bekleyen davetler kontenjandan düşer.
            COMPANY_ADMIN ve APPROVER sayılmaz.
          </p>
        </div>
        {!editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-100"
          >
            <Pencil className="h-3.5 w-3.5" />
            Düzenle
          </button>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-admin-text-muted font-semibold">
            Kullanım
          </p>
          <p
            className={cn(
              "mt-1 font-display text-2xl font-bold",
              isOver
                ? "text-danger-600"
                : isAtLimit
                  ? "text-warning-600"
                  : "text-admin-text",
            )}
          >
            {usage.used}
            <span className="text-admin-text-muted">/{usage.limit}</span>
          </p>
          <p className="mt-0.5 text-xs text-admin-text-muted">
            {usage.active} aktif · {usage.pending} bekleyen
          </p>
        </div>

        <div className="min-w-[200px] flex-1">
          <p className="text-[11px] uppercase tracking-wide text-admin-text-muted font-semibold">
            Kontenjan
          </p>
          {editing ? (
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={1000}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                disabled={mutation.isPending}
                className="w-24 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
              <button
                type="button"
                onClick={save}
                disabled={mutation.isPending}
                className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                Kaydet
              </button>
              <button
                type="button"
                onClick={() => {
                  setValue(String(tenant.buyerSeatLimit));
                  setEditing(false);
                }}
                disabled={mutation.isPending}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-admin-text transition hover:bg-slate-50 disabled:opacity-50"
              >
                Vazgeç
              </button>
            </div>
          ) : (
            <p className="mt-1 font-display text-2xl font-bold text-admin-text">
              {tenant.buyerSeatLimit}
            </p>
          )}
        </div>
      </div>

      {isOver ? (
        <p className="mt-3 rounded-lg bg-danger-50 px-3 py-2 text-xs text-danger-700">
          Kullanım kontenjandan fazla. Kontenjanı arttırın veya fazla
          kullanıcıyı pasifleştirin.
        </p>
      ) : isAtLimit ? (
        <p className="mt-3 rounded-lg bg-warning-50 px-3 py-2 text-xs text-warning-700">
          Kontenjan dolu — bu firma yeni satın almacı davet edemez.
        </p>
      ) : null}
    </div>
  );
}

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
