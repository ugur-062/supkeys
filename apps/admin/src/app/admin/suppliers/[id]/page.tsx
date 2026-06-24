"use client";

import { Button } from "@/components/ui/button";
import { AdminShell } from "@/components/layout/admin-shell";
import { RequireAdminAuth } from "@/components/providers/auth-hydration";
import { UserRecoveryActions } from "@/components/user-recovery-actions";
import {
  useAdminSupplierDetail,
  useSupplierUserRecovery,
  useUpdateSupplierUser,
  type AdminSupplierDetail,
} from "@/hooks/use-admin-suppliers";
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
import { toast } from "sonner";
import { SupplierManagementCard } from "./_components/supplier-management-card";

const BID_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Taslak",
  SUBMITTED: "Gönderildi",
  WITHDRAWN: "Geri Çekildi",
  REJECTED: "Reddedildi",
  AWARDED_PARTIAL: "Kısmi Kazandı",
  AWARDED_FULL: "Tam Kazandı",
  LOST: "Kaybetti",
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

function DetailContent() {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : null;
  const query = useAdminSupplierDetail(id);
  const userMutation = useUpdateSupplierUser(id ?? "");
  const recovery = useSupplierUserRecovery(id ?? "");

  const toggleUser = (userId: string, isActive: boolean) =>
    userMutation.mutate(
      { userId, isActive },
      {
        onSuccess: () =>
          toast.success(isActive ? "Kullanıcı aktifleştirildi" : "Kullanıcı pasifleştirildi"),
        onError: (e: unknown) =>
          toast.error(e instanceof Error ? e.message : "Güncelleme hatası"),
      },
    );

  const recoveryToast = {
    onSuccess: () => toast.success("İşlem tamamlandı"),
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "İşlem başarısız"),
  };

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
        <Truck className="h-12 w-12 text-slate-300 mx-auto mb-3" />
        <p className="font-semibold text-admin-text">Tedarikçi bulunamadı</p>
        <Link
          href="/admin/suppliers"
          className="text-sm text-brand-600 hover:underline mt-2 inline-block"
        >
          ← Listeye dön
        </Link>
      </div>
    );
  }

  const s = query.data;

  return (
    <div className="space-y-6 max-w-[1200px]">
      <Link
        href="/admin/suppliers"
        className="text-sm text-admin-text-muted hover:text-brand-600 inline-flex items-center gap-1"
      >
        <ChevronLeft className="h-4 w-4" />
        Tüm Tedarikçiler
      </Link>

      <div className="flex items-start gap-4">
        <div className="h-16 w-16 rounded-2xl bg-zinc-100 flex items-center justify-center flex-shrink-0">
          <Truck className="h-8 w-8 text-zinc-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-display font-bold text-admin-text">
              {s.companyName}
            </h1>
            <span
              className={cn(
                "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border",
                s.membership === "PREMIUM"
                  ? "bg-warning-50 text-warning-700 border-warning-200"
                  : "bg-slate-50 text-slate-700 border-slate-200",
              )}
            >
              {s.membership}
            </span>
            {s.isBlocked ? (
              <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-semibold bg-danger-50 text-danger-700 border border-danger-200">
                Engelli
              </span>
            ) : null}
          </div>
          <p className="text-sm text-admin-text-muted mt-1">
            VKN: {s.taxNumber}
            {s.city ? ` · ${s.city}` : ""} · Kayıt:{" "}
            {format(new Date(s.createdAt), "d MMMM yyyy", { locale: tr })}
          </p>
        </div>
      </div>

      {/* Yönetim — üyelik, engel, düzenle */}
      <SupplierManagementCard supplier={s} />

      {/* Mini KPI'lar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MiniStat
          icon={Users}
          label="Kullanıcı"
          value={s._count.users}
          accent="brand"
        />
        <MiniStat
          icon={Building2}
          label="Aktif Alıcı"
          value={s._count.tenantRelations}
          accent="purple"
        />
        <MiniStat
          icon={FileText}
          label="Teklif"
          value={s._count.bids}
          accent="indigo"
        />
        <MiniStat
          icon={Package}
          label="Sipariş"
          value={s._count.orders}
          accent="success"
        />
      </div>

      {/* Win Rate */}
      <div className="rounded-2xl p-6 text-white bg-zinc-900">
        <p className="text-xs uppercase opacity-85 font-semibold tracking-wide">
          Kazanma Oranı
        </p>
        <p className="text-3xl font-display font-bold mt-2">
          %{s.analytics.winRatePercent}
        </p>
        <p className="text-xs opacity-85 mt-1">
          Sonuçlanmış (kazanan + kaybeden) tekliflere göre hesaplanır
        </p>
      </div>

      {/* Toplam Gelir */}
      <div className="rounded-2xl p-6 text-white bg-gradient-to-r from-success-500 to-success-600">
        <p className="text-xs uppercase opacity-85 font-semibold tracking-wide">
          Toplam Gelir (Tamamlanan Siparişler)
        </p>
        <p className="text-3xl font-display font-bold mt-2">
          {Number(s.analytics.totalRevenueCompleted).toLocaleString("tr-TR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{" "}
          TRY
        </p>
        <p className="text-xs opacity-85 mt-1">
          Yalnızca COMPLETED durumundaki siparişlerin toplam tutarı
        </p>
      </div>

      {/* Teklif + Sipariş dağılımı */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatusDistributionCard
          title="Teklif Durumları"
          rows={s.analytics.bidsByStatus}
          labels={BID_STATUS_LABELS}
          emptyText="Henüz teklif yok"
        />
        <StatusDistributionCard
          title="Sipariş Durumları"
          rows={s.analytics.ordersByStatus}
          labels={ORDER_STATUS_LABELS}
          emptyText="Henüz sipariş yok"
        />
      </div>

      {/* Kullanıcılar */}
      <div className="admin-card">
        <div className="px-5 py-4 border-b border-surface-border">
          <h3 className="font-bold text-admin-text">
            Kullanıcılar ({s.users.length})
          </h3>
        </div>
        <div className="divide-y divide-surface-border">
          {s.users.map((u) => (
            <div
              key={u.id}
              className="px-5 py-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="font-semibold text-admin-text truncate">
                  {u.firstName} {u.lastName}
                </p>
                <p className="text-xs text-admin-text-muted truncate">
                  {u.email}
                  {u.phone ? ` · ${u.phone}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="text-right">
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
                    <p className="text-xs text-admin-text-muted mt-1">
                      Hiç giriş yok
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  variant={u.isActive ? "ghost" : "secondary"}
                  size="sm"
                  onClick={() => toggleUser(u.id, !u.isActive)}
                  disabled={userMutation.isPending}
                >
                  {u.isActive ? "Pasifleştir" : "Aktifleştir"}
                </Button>
                <UserRecoveryActions
                  email={u.email}
                  emailVerified={!!u.emailVerifiedAt}
                  twoFaEnabled={u.twoFactorEnabled}
                  pending={recovery.verifyEmail.isPending || recovery.reset2fa.isPending}
                  onVerifyEmail={() => recovery.verifyEmail.mutate(u.id, recoveryToast)}
                  onReset2fa={() => recovery.reset2fa.mutate(u.id, recoveryToast)}
                  onChangeEmail={(email) =>
                    recovery.changeEmail.mutateAsync({ userId: u.id, email })
                  }
                />
              </div>
            </div>
          ))}
        </div>
      </div>
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
  purple: { bg: "bg-zinc-100", icon: "text-zinc-600" },
  indigo: { bg: "bg-zinc-100", icon: "text-zinc-600" },
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
  rows: AdminSupplierDetail["analytics"]["bidsByStatus"];
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

export default function AdminSupplierDetailPage() {
  return (
    <RequireAdminAuth>
      <AdminShell>
        <DetailContent />
      </AdminShell>
    </RequireAdminAuth>
  );
}
