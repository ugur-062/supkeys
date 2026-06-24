"use client";

import { Badge } from "@/components/catalyst/badge";
import { AdminShell } from "@/components/layout/admin-shell";
import { RequireAdminAuth } from "@/components/providers/auth-hydration";
import { Button } from "@/components/ui/button";
import {
  ORDER_CANCELLABLE,
  useAdminCancelOrder,
  useAdminOrderDetail,
} from "@/hooks/use-admin-interventions";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
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
  const cancel = useAdminCancelOrder(query.data?.tenant.id ?? "");

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

  const onCancel = () => {
    const reason = window.prompt("İptal sebebi (en az 10 karakter):");
    if (!reason || reason.trim().length < 10) {
      if (reason !== null) toast.error("Sebep en az 10 karakter olmalı");
      return;
    }
    cancel.mutate(
      { orderId: o.id, reason: reason.trim() },
      {
        onSuccess: () => toast.success("Sipariş iptal edildi"),
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
        {ORDER_CANCELLABLE.includes(o.status) ? (
          <Button type="button" variant="danger" disabled={cancel.isPending} onClick={onCancel}>
            Siparişi İptal Et
          </Button>
        ) : null}
      </div>

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
        <Meta label="Ödeme Kaydı" value={`${o._count.payments} adet`} />
        {o.bid ? (
          <Meta
            label="Kazanan Teklif"
            value={`${fmtAmount(o.bid.totalAmount, o.bid.currency)}${o.bid.version > 1 ? ` (v${o.bid.version})` : ""}`}
          />
        ) : null}
      </div>

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
