"use client";

import { Badge } from "@/components/catalyst/badge";
import { Select } from "@/components/catalyst/select";
import { AdminShell } from "@/components/layout/admin-shell";
import { RequireAdminAuth } from "@/components/providers/auth-hydration";
import { Button } from "@/components/ui/button";
import {
  ORDER_STATUS_OPTIONS,
  useAdminOrderDetail,
  useAdminSetOrderStatus,
  useAdminSetPaymentStatus,
  type AdminOrderDetail,
} from "@/hooks/use-admin-interventions";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

const ORDER_STATUS: Record<string, { label: string; color: "zinc" | "blue" | "amber" | "green" | "red" }> = {
  PENDING: { label: "Bekliyor", color: "amber" },
  ACCEPTED: { label: "Kabul Edildi", color: "blue" },
  IN_DELIVERY: { label: "Teslimatta", color: "blue" },
  IN_PROGRESS: { label: "Üretimde", color: "blue" },
  DELIVERED: { label: "Teslim Edildi", color: "green" },
  COMPLETED: { label: "Tamamlandı", color: "green" },
  CANCELLED: { label: "İptal", color: "red" },
};

function fmtAmount(v: string | null, currency: string) {
  if (v == null) return "—";
  return `${Number(v).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function fmtDate(v: string | null) {
  return v ? format(new Date(v), "d MMM yyyy HH:mm", { locale: tr }) : "—";
}

function OrderDetail() {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : null;
  const query = useAdminOrderDetail(id);
  const setStatus = useAdminSetOrderStatus(id ?? "");
  const [newStatus, setNewStatus] = useState("");
  const [statusReason, setStatusReason] = useState("");

  if (query.isLoading || !query.data) {
    return (
      <div className="space-y-4 max-w-[900px]">
        <div className="h-6 w-40 bg-slate-200 rounded animate-pulse" />
        <div className="h-32 bg-slate-200 rounded-2xl animate-pulse" />
      </div>
    );
  }

  const o = query.data;
  const meta = ORDER_STATUS[o.status] ?? { label: o.status, color: "zinc" as const };

  const applyStatus = () => {
    if (!newStatus || newStatus === o.status) return;
    if (
      (newStatus === "CANCELLED" || newStatus === "REJECTED") &&
      statusReason.trim().length < 3
    ) {
      toast.error("İptal/red için sebep girin");
      return;
    }
    setStatus.mutate(
      { status: newStatus, reason: statusReason.trim() || undefined },
      {
        onSuccess: () => {
          toast.success("Sipariş durumu güncellendi");
          setNewStatus("");
          setStatusReason("");
        },
        onError: (e: unknown) =>
          toast.error(e instanceof Error ? e.message : "Hata"),
      },
    );
  };

  return (
    <div className="space-y-6 max-w-[900px]">
      <Link
        href={`/admin/tenants/${o.tenant.id}`}
        className="text-sm text-admin-text-muted hover:text-brand-600 inline-flex items-center gap-1"
      >
        <ChevronLeft className="h-4 w-4" />
        {o.tenant.name}
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <code className="font-mono text-sm text-admin-text-muted">
              {o.orderNumber}
            </code>
            <Badge color={meta.color}>{meta.label}</Badge>
          </div>
          <h1 className="text-2xl font-display font-bold text-admin-text mt-1">
            {fmtAmount(o.totalAmount, o.currency)}
          </h1>
        </div>
        {/* Durum override — admin superuser */}
        <div className="flex items-end gap-2">
          <div className="w-40">
            <label className="block text-xs font-semibold text-admin-text-muted mb-1">
              Durum değiştir
            </label>
            <Select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              aria-label="Yeni durum"
            >
              <option value="">— seç —</option>
              {ORDER_STATUS_OPTIONS.filter((s) => s !== o.status).map((s) => (
                <option key={s} value={s}>
                  {ORDER_STATUS[s]?.label ?? s}
                </option>
              ))}
            </Select>
          </div>
          <Button
            type="button"
            disabled={!newStatus || setStatus.isPending}
            onClick={applyStatus}
          >
            Uygula
          </Button>
        </div>
      </div>

      {newStatus === "CANCELLED" || newStatus === "REJECTED" ? (
        <input
          className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm"
          value={statusReason}
          onChange={(e) => setStatusReason(e.target.value)}
          placeholder={`${ORDER_STATUS[newStatus]?.label} sebebi...`}
        />
      ) : null}

      <div className="admin-card p-5 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <Meta label="Alıcı" value={o.tenant.name} />
        <Meta label="Tedarikçi" value={o.supplier.companyName} />
        <Meta
          label="İhale"
          value={`${o.tender.tenderNumber}`}
          href={`/admin/tenders/${o.tender.id}`}
        />
        <Meta label="Oluşturma" value={fmtDate(o.createdAt)} />
        {o.acceptedAt ? <Meta label="Kabul" value={fmtDate(o.acceptedAt)} /> : null}
        {o.completedAt ? <Meta label="Tamamlanma" value={fmtDate(o.completedAt)} /> : null}
        {o.cancelledAt ? (
          <Meta label="İptal" value={`${fmtDate(o.cancelledAt)} · ${o.cancelReason ?? ""}`} />
        ) : null}
        {o.bid ? (
          <Meta
            label="Kazanan Teklif"
            value={`${fmtAmount(o.bid.totalAmount, o.bid.currency)}${o.bid.version > 1 ? ` (v${o.bid.version})` : ""}`}
          />
        ) : null}
      </div>

      {/* Ödemeler */}
      <PaymentsCard orderId={o.id} payments={o.payments} />

      {o.notes ? (
        <div className="admin-card p-5">
          <p className="text-xs uppercase tracking-wide text-admin-text-muted font-semibold mb-1">
            Notlar
          </p>
          <p className="text-sm text-admin-text whitespace-pre-wrap">{o.notes}</p>
        </div>
      ) : null}
    </div>
  );
}

const PAYMENT_STATUS: Record<string, { label: string; color: "amber" | "green" | "red" }> = {
  AWAITING_CONFIRMATION: { label: "Onay bekliyor", color: "amber" },
  CONFIRMED: { label: "Onaylı", color: "green" },
  REJECTED: { label: "Reddedildi", color: "red" },
};

function PaymentsCard({
  orderId,
  payments,
}: {
  orderId: string;
  payments: AdminOrderDetail["payments"];
}) {
  const setPayment = useAdminSetPaymentStatus(orderId);
  if (payments.length === 0) return null;

  const act = (paymentId: string, status: "CONFIRMED" | "REJECTED") => {
    const reason =
      status === "REJECTED"
        ? window.prompt("Red sebebi:") ?? undefined
        : undefined;
    setPayment.mutate(
      { paymentId, status, reason },
      {
        onSuccess: () => toast.success("Ödeme durumu güncellendi"),
        onError: (e: unknown) =>
          toast.error(e instanceof Error ? e.message : "Hata"),
      },
    );
  };

  return (
    <div className="admin-card overflow-hidden">
      <div className="px-5 py-3 border-b border-surface-border">
        <h3 className="font-bold text-admin-text text-sm">
          Ödemeler ({payments.length})
        </h3>
      </div>
      <div className="divide-y divide-surface-border">
        {payments.map((p) => {
          const st = PAYMENT_STATUS[p.status] ?? { label: p.status, color: "amber" as const };
          return (
            <div key={p.id} className="px-5 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-admin-text">
                  {fmtAmount(p.amount, p.currency)} · {p.method}
                  {p.chequeNo ? ` · Çek ${p.chequeNo}` : ""}
                </p>
                <p className="text-xs text-admin-text-muted">
                  {fmtDate(p.markedPaidAt)}
                  {p.note ? ` · ${p.note}` : ""}
                  {p.rejectReason ? ` · Red: ${p.rejectReason}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Badge color={st.color}>{st.label}</Badge>
                {p.status !== "CONFIRMED" ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={setPayment.isPending}
                    onClick={() => act(p.id, "CONFIRMED")}
                  >
                    Onayla
                  </Button>
                ) : null}
                {p.status !== "REJECTED" ? (
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    disabled={setPayment.isPending}
                    onClick={() => act(p.id, "REJECTED")}
                  >
                    Reddet
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Meta({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-admin-text-muted font-semibold">
        {label}
      </p>
      {href ? (
        <Link href={href} className="text-brand-600 hover:underline mt-0.5 inline-block">
          {value}
        </Link>
      ) : (
        <p className="text-admin-text mt-0.5">{value}</p>
      )}
    </div>
  );
}

export default function AdminOrderDetailPage() {
  return (
    <RequireAdminAuth>
      <AdminShell>
        <OrderDetail />
      </AdminShell>
    </RequireAdminAuth>
  );
}
