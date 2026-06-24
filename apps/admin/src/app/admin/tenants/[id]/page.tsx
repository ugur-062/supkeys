"use client";

import { Input } from "@/components/catalyst/input";
import { Select } from "@/components/catalyst/select";
import { AdminShell } from "@/components/layout/admin-shell";
import { RequireAdminAuth } from "@/components/providers/auth-hydration";
import { UserRecoveryActions } from "@/components/user-recovery-actions";
import {
  useAdminTenantDetail,
  useIssuePasswordReset,
  useTenantUserRecovery,
  useUpdateAdminTenant,
  useUpdateTenantUser,
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
  Copy,
  FileText,
  KeyRound,
  Package,
  Pencil,
  Power,
  ShieldOff,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EditTenantMetaModal } from "./_components/edit-tenant-meta-modal";
import { OrdersTab } from "./_components/orders-tab";
import { TendersTab } from "./_components/tenders-tab";

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
  COMPANY_ADMIN: "Yönetici",
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
      <TenantHeader tenant={t} />

      {/* Tenant aktif/pasif kontrolü */}
      <TenantActivationCard tenant={t} />

      {/* Üyelik + BUYER kontenjanı */}
      <div className="grid gap-4 md:grid-cols-2">
        <MembershipCard tenantId={t.id} tenant={t} />
        <BuyerSeatCard tenantId={t.id} tenant={t} />
      </div>

      {/* Sekmeli içerik */}
      <DetailTabs tenant={t} />
    </div>
  );
}

type TabKey = "overview" | "users" | "tenders" | "orders";

function DetailTabs({ tenant }: { tenant: AdminTenantDetail }) {
  const [tab, setTab] = useState<TabKey>("overview");
  const tabs: Array<{ key: TabKey; label: string; count?: number }> = [
    { key: "overview", label: "Genel" },
    { key: "users", label: "Kullanıcılar", count: tenant._count.users },
    { key: "tenders", label: "İhaleler", count: tenant._count.tenders },
    { key: "orders", label: "Siparişler", count: tenant._count.orders },
  ];

  return (
    <div>
      <div className="border-b border-surface-border flex gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition border-b-2 -mb-px",
              tab === t.key
                ? "border-brand-500 text-brand-700"
                : "border-transparent text-admin-text-muted hover:text-admin-text",
            )}
          >
            {t.label}
            {t.count !== undefined ? (
              <span
                className={cn(
                  "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                  tab === t.key
                    ? "bg-brand-100 text-brand-700"
                    : "bg-slate-100 text-slate-600",
                )}
              >
                {t.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "overview" ? <OverviewTab tenant={tenant} /> : null}
        {tab === "users" ? (
          <UsersBlock tenantId={tenant.id} users={tenant.users} />
        ) : null}
        {tab === "tenders" ? <TendersTab tenantId={tenant.id} /> : null}
        {tab === "orders" ? <OrdersTab tenantId={tenant.id} /> : null}
      </div>
    </div>
  );
}

function OverviewTab({ tenant: t }: { tenant: AdminTenantDetail }) {
  return (
    <div className="space-y-6">
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

      <RecentTendersBlock recentTenders={t.analytics.recentTenders} />
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
  brand: { bg: "bg-zinc-100", icon: "text-zinc-600" },
  purple: { bg: "bg-zinc-100", icon: "text-zinc-600" },
  indigo: { bg: "bg-zinc-100", icon: "text-zinc-600" },
  success: { bg: "bg-success-50", icon: "text-success-600" },
};

function TenantHeader({ tenant }: { tenant: AdminTenantDetail }) {
  const [editOpen, setEditOpen] = useState(false);
  return (
    <>
      <div className="flex items-start gap-4">
        <div className="h-16 w-16 rounded-2xl bg-brand-50 flex items-center justify-center flex-shrink-0">
          <Building2 className="h-8 w-8 text-brand-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-display font-bold text-admin-text">
              {tenant.name}
            </h1>
            {!tenant.isActive ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-danger-200 bg-danger-50 px-2 py-0.5 text-xs font-semibold text-danger-700">
                PASİF
              </span>
            ) : null}
          </div>
          <p className="text-sm text-admin-text-muted mt-1">
            VKN: {tenant.taxNumber ?? "—"}
            {tenant.city ? ` · ${tenant.city}` : ""} · Kayıt:{" "}
            {format(new Date(tenant.createdAt), "d MMMM yyyy", { locale: tr })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700 transition hover:bg-brand-100"
        >
          <Pencil className="h-4 w-4" />
          Bilgileri Düzenle
        </button>
      </div>
      <EditTenantMetaModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        tenant={tenant}
      />
    </>
  );
}

function TenantActivationCard({ tenant }: { tenant: AdminTenantDetail }) {
  const mutation = useUpdateAdminTenant(tenant.id);
  const toggle = () => {
    const next = !tenant.isActive;
    if (
      !confirm(
        next
          ? "Tenant'ı aktif etmek istediğine emin misin?"
          : "Tenant'ı pasif yaparsan tüm kullanıcılar giriş yapamaz. Devam edilsin mi?",
      )
    )
      return;
    mutation.mutate(
      { isActive: next },
      {
        onSuccess: () =>
          toast.success(next ? "Tenant aktif edildi" : "Tenant pasifleştirildi"),
        onError: (err: unknown) =>
          toast.error(err instanceof Error ? err.message : "Hata"),
      },
    );
  };

  return (
    <div
      className={cn(
        "admin-card flex items-center justify-between gap-4 p-4",
        !tenant.isActive ? "border-danger-200 bg-danger-50/40" : "",
      )}
    >
      <div className="min-w-0">
        <p className="font-semibold text-admin-text">
          {tenant.isActive ? "Tenant aktif" : "Tenant pasif — login engellendi"}
        </p>
        <p className="mt-0.5 text-xs text-admin-text-muted">
          Pasif yaparsan tüm kullanıcılar (COMPANY_ADMIN dahil) giriş yapamaz.
        </p>
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={mutation.isPending}
        className={cn(
          "rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-50",
          tenant.isActive
            ? "border border-danger-300 bg-white text-danger-700 hover:bg-danger-50"
            : "bg-brand-600 text-white hover:bg-brand-700",
        )}
      >
        {tenant.isActive ? "Pasifleştir" : "Aktifleştir"}
      </button>
    </div>
  );
}

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
          <div className="w-44">
            <Input
              type="date"
              value={manualValue}
              onChange={(e) => setManualValue(e.target.value)}
              disabled={mutation.isPending}
            />
          </div>
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
              <div className="w-24">
                <Input
                  type="number"
                  min={0}
                  max={1000}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  disabled={mutation.isPending}
                />
              </div>
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

function UsersBlock({
  tenantId,
  users,
}: {
  tenantId: string;
  users: AdminTenantDetail["users"];
}) {
  return (
    <div className="admin-card">
      <div className="px-5 py-4 border-b border-surface-border">
        <h3 className="font-bold text-admin-text">
          Kullanıcılar ({users.length})
        </h3>
        <p className="text-xs text-admin-text-muted mt-0.5">
          Rolü değiştir, kullanıcıyı pasifleştir veya parola sıfırlama linki gönder.
        </p>
      </div>
      <div className="divide-y divide-surface-border">
        {users.map((u) => (
          <UserRow key={u.id} tenantId={tenantId} user={u} />
        ))}
      </div>
    </div>
  );
}

function UserRow({
  tenantId,
  user,
}: {
  tenantId: string;
  user: AdminTenantDetail["users"][number];
}) {
  const updateMutation = useUpdateTenantUser(tenantId);
  const resetMutation = useIssuePasswordReset(tenantId);
  const recovery = useTenantUserRecovery(tenantId);
  const [showReset, setShowReset] = useState<string | null>(null);

  const recoveryToast = {
    onSuccess: () => toast.success("İşlem tamamlandı"),
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "İşlem başarısız"),
  };

  const toggleActive = () => {
    const next = !user.isActive;
    if (
      !confirm(
        next
          ? `${user.firstName} ${user.lastName} kullanıcısını aktif etmek istediğine emin misin?`
          : `${user.firstName} ${user.lastName} kullanıcısını pasifleştir? Login yapamayacak.`,
      )
    )
      return;
    updateMutation.mutate(
      { userId: user.id, payload: { isActive: next } },
      {
        onSuccess: () =>
          toast.success(next ? "Kullanıcı aktif edildi" : "Kullanıcı pasifleştirildi"),
        onError: (err: unknown) =>
          toast.error(err instanceof Error ? err.message : "Hata"),
      },
    );
  };

  const changeRole = (newRole: "COMPANY_ADMIN" | "BUYER" | "APPROVER") => {
    if (newRole === user.role) return;
    if (!confirm(`Rolü "${ROLE_LABELS[newRole]}" olarak değiştir?`)) return;
    updateMutation.mutate(
      { userId: user.id, payload: { role: newRole } },
      {
        onSuccess: () => toast.success("Rol güncellendi"),
        onError: (err: unknown) =>
          toast.error(err instanceof Error ? err.message : "Hata"),
      },
    );
  };

  const issueReset = () => {
    if (
      !confirm(
        `${user.email} adresine parola sıfırlama linki gönderilsin mi?`,
      )
    )
      return;
    resetMutation.mutate(user.id, {
      onSuccess: (data) => {
        toast.success("Sıfırlama linki e-postayla gönderildi");
        setShowReset(data.resetUrl);
      },
      onError: (err: unknown) =>
        toast.error(err instanceof Error ? err.message : "Hata"),
    });
  };

  const copyLink = () => {
    if (!showReset) return;
    navigator.clipboard
      .writeText(showReset)
      .then(() => toast.success("Link kopyalandı"))
      .catch(() => toast.error("Kopyalanamadı"));
  };

  return (
    <div className="px-5 py-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-admin-text truncate">
            {user.firstName} {user.lastName}
          </p>
          <p className="text-xs text-admin-text-muted truncate">
            {user.email} · {ROLE_LABELS[user.role] ?? user.role}
          </p>
          {user.lastLoginAt ? (
            <p className="text-xs text-admin-text-muted mt-1">
              Son giriş:{" "}
              {format(new Date(user.lastLoginAt), "d MMM HH:mm", {
                locale: tr,
              })}
            </p>
          ) : (
            <p className="text-xs text-admin-text-muted mt-1">Hiç giriş yok</p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          <span
            className={cn(
              "inline-flex px-2 py-0.5 rounded-md text-xs font-semibold",
              user.isActive
                ? "bg-success-50 text-success-700 border border-success-200"
                : "bg-slate-100 text-slate-600 border border-slate-200",
            )}
          >
            {user.isActive ? "Aktif" : "Pasif"}
          </span>

          <div className="w-36">
            <Select
              value={user.role}
              onChange={(e) =>
                changeRole(
                  e.target.value as "COMPANY_ADMIN" | "BUYER" | "APPROVER",
                )
              }
              disabled={updateMutation.isPending}
              aria-label="Kullanıcı rolü"
            >
              <option value="COMPANY_ADMIN">Yönetici</option>
              <option value="BUYER">Satınalmacı</option>
              <option value="APPROVER">Onaylayıcı</option>
            </Select>
          </div>

          <button
            type="button"
            onClick={toggleActive}
            disabled={updateMutation.isPending}
            title={user.isActive ? "Pasifleştir" : "Aktifleştir"}
            className={cn(
              "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold transition disabled:opacity-50",
              user.isActive
                ? "border-danger-200 bg-white text-danger-700 hover:bg-danger-50"
                : "border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100",
            )}
          >
            {user.isActive ? (
              <ShieldOff className="h-3.5 w-3.5" />
            ) : (
              <Power className="h-3.5 w-3.5" />
            )}
            {user.isActive ? "Pasifleştir" : "Aktifleştir"}
          </button>

          <button
            type="button"
            onClick={issueReset}
            disabled={resetMutation.isPending || !user.isActive}
            title={
              user.isActive ? "Parola sıfırlama linki gönder" : "Pasif kullanıcı"
            }
            className="inline-flex items-center gap-1 rounded-lg border border-warning-200 bg-warning-50 px-2 py-1 text-xs font-semibold text-warning-700 transition hover:bg-warning-100 disabled:opacity-50"
          >
            <KeyRound className="h-3.5 w-3.5" />
            Parola Sıfırla
          </button>

          <UserRecoveryActions
            email={user.email}
            emailVerified={!!user.emailVerifiedAt}
            twoFaEnabled={user.twoFactorEnabled}
            pending={recovery.verifyEmail.isPending || recovery.reset2fa.isPending}
            onVerifyEmail={() => recovery.verifyEmail.mutate(user.id, recoveryToast)}
            onReset2fa={() => recovery.reset2fa.mutate(user.id, recoveryToast)}
            onChangeEmail={(email) =>
              recovery.changeEmail.mutateAsync({ userId: user.id, email })
            }
            profile={{
              firstName: user.firstName,
              lastName: user.lastName,
              phone: user.phone ?? "",
            }}
            onSaveProfile={(f) =>
              updateMutation.mutateAsync({ userId: user.id, payload: f })
            }
          />
        </div>
      </div>

      {showReset ? (
        <div className="mt-3 rounded-lg border border-warning-200 bg-warning-50 p-3 text-xs">
          <p className="font-semibold text-warning-800">
            Sıfırlama linki üretildi (60 dakika geçerli, tek kullanımlık)
          </p>
          <p className="mt-1 text-warning-700">
            E-posta gönderildi. Müşteri postayı bulamazsa aşağıdaki linki manuel
            iletebilirsin:
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-white px-2 py-1 font-mono text-[11px] text-admin-text">
              {showReset}
            </code>
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex items-center gap-1 rounded-lg border border-warning-300 bg-white px-2 py-1 font-semibold text-warning-800 hover:bg-warning-100"
            >
              <Copy className="h-3 w-3" />
              Kopyala
            </button>
            <button
              type="button"
              onClick={() => setShowReset(null)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 font-semibold text-admin-text hover:bg-slate-50"
            >
              Kapat
            </button>
          </div>
        </div>
      ) : null}
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
