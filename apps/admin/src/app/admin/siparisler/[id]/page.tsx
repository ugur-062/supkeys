"use client";

import { Badge } from "@/components/catalyst/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import { AdminShell } from "@/components/layout/admin-shell";
import { Button } from "@/components/ui/button";
import { PromptDialog } from "@/components/ui/prompt-dialog";
import {
  useAdminOrderDetail,
  useCancelOrder,
} from "@/hooks/use-admin-inspection";
import { safeFormat } from "@/lib/date";
import { fmtMoney, ORDER_STATUS, PAYMENT_STATUS } from "@/lib/status-labels";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-admin-text-muted text-xs font-medium">{label}</dt>
      <dd className="text-admin-text text-sm">{value || "—"}</dd>
    </div>
  );
}

const CANCELABLE = new Set(["PENDING", "ACCEPTED", "CREATED", "IN_DELIVERY"]);

function OrderInspection({ id }: { id: string }) {
  const { data: o, isLoading, isError, refetch } = useAdminOrderDetail(id);
  const cancel = useCancelOrder(id);
  const [dialog, setDialog] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="text-admin-text-muted h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (isError || !o) {
    return (
      <div className="space-y-4 py-16 text-center">
        <p className="text-admin-text-muted text-sm">Sipariş yüklenemedi.</p>
        <Button variant="secondary" onClick={() => void refetch()}>
          Tekrar dene
        </Button>
      </div>
    );
  }

  const meta = ORDER_STATUS[o.status] ?? {
    label: o.status,
    color: "zinc" as const,
  };
  const confirmed = o.payments
    .filter((p) => p.status === "CONFIRMED")
    .reduce((s, p) => s + p.amount, 0);

  return (
    <div className="max-w-[1100px] space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href={`/admin/firmalar/${o.buyer.id}?tab=siparisler`}
            className="text-admin-text-muted hover:text-admin-text mb-2 inline-flex items-center gap-1 text-xs font-medium"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Siparişler
          </Link>
          <h1 className="text-admin-text text-2xl font-bold">
            {o.number ?? "Sipariş"}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge color={meta.color}>{meta.label}</Badge>
            <span className="text-admin-text text-sm font-semibold tabular-nums">
              {fmtMoney(o.amount, o.currency)}
            </span>
            {o.listing ? (
              <Link
                href={`/admin/ilanlar/${o.listing.id}`}
                className="text-xs text-blue-600 hover:underline"
              >
                İlan: {o.listing.title}
              </Link>
            ) : null}
          </div>
          {o.cancelReason ? (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700">
              İptal gerekçesi: {o.cancelReason}
            </p>
          ) : null}
        </div>
        {CANCELABLE.has(o.status) ? (
          <Button variant="danger" size="sm" onClick={() => setDialog(true)}>
            Siparişi İptal Et
          </Button>
        ) : null}
      </div>

      {/* Taraflar + zaman çizgisi */}
      <section className="admin-card px-5 py-4">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Row
            label="Alıcı"
            value={
              <Link
                href={`/admin/firmalar/${o.buyer.id}`}
                className="hover:underline"
              >
                {o.buyer.name}
              </Link>
            }
          />
          <Row
            label="Satıcı"
            value={
              <Link
                href={`/admin/firmalar/${o.seller.id}`}
                className="hover:underline"
              >
                {o.seller.name}
              </Link>
            }
          />
          <Row
            label="Oluşturma"
            value={safeFormat(o.createdAt, "d MMM yyyy HH:mm")}
          />
          <Row
            label="Satıcı kabulü"
            value={o.acceptedAt ? safeFormat(o.acceptedAt, "d MMM yyyy") : null}
          />
          <Row
            label="Kargoya veriliş"
            value={
              o.deliveryStartedAt
                ? safeFormat(o.deliveryStartedAt, "d MMM yyyy")
                : null
            }
          />
          <Row
            label="Teslim"
            value={o.deliveredAt ? safeFormat(o.deliveredAt, "d MMM yyyy") : null}
          />
          <Row
            label="Tamamlanma"
            value={o.completedAt ? safeFormat(o.completedAt, "d MMM yyyy") : null}
          />
          <Row label="Fatura no" value={o.invoiceNumber} />
        </dl>
      </section>

      {/* Ödemeler — "ödedim ama görünmüyor" çağrısının ekranı */}
      <section className="admin-card overflow-hidden">
        <div className="border-admin-border flex items-center justify-between border-b px-5 py-3.5">
          <h3 className="text-admin-text text-sm font-semibold">
            Ödemeler ({o.payments.length})
          </h3>
          <span className="text-admin-text-muted text-xs">
            Onaylı: <strong>{fmtMoney(confirmed, o.currency)}</strong> /{" "}
            {fmtMoney(o.amount, o.currency)}
          </span>
        </div>
        <Table dense>
          <TableHead>
            <TableRow>
              <TableHeader>Tarih</TableHeader>
              <TableHeader>Tutar</TableHeader>
              <TableHeader>Yöntem</TableHeader>
              <TableHeader>Durum</TableHeader>
              <TableHeader>Not</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {o.payments.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-admin-text-muted py-8 text-center"
                >
                  Ödeme kaydı yok
                </TableCell>
              </TableRow>
            ) : (
              o.payments.map((p) => {
                const pm = PAYMENT_STATUS[p.status] ?? {
                  label: p.status,
                  color: "zinc" as const,
                };
                return (
                  <TableRow key={p.id}>
                    <TableCell className="text-admin-text-muted text-xs whitespace-nowrap">
                      {safeFormat(p.createdAt, "d MMM yyyy HH:mm")}
                    </TableCell>
                    <TableCell className="text-admin-text text-sm font-semibold tabular-nums">
                      {fmtMoney(p.amount, o.currency)}
                    </TableCell>
                    <TableCell className="text-admin-text-muted text-xs">
                      {p.method ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge color={pm.color}>{pm.label}</Badge>
                    </TableCell>
                    <TableCell className="text-admin-text-muted max-w-[220px] truncate text-xs">
                      {p.rejectReason ?? "—"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </section>

      {/* Kalemler + belgeler */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="admin-card overflow-hidden">
          <div className="border-admin-border border-b px-5 py-3.5">
            <h3 className="text-admin-text text-sm font-semibold">
              Kalemler ({o.items.length})
            </h3>
          </div>
          <Table dense>
            <TableBody>
              {o.items.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="text-admin-text text-sm">
                    {i.name}
                  </TableCell>
                  <TableCell className="text-admin-text-muted text-xs">
                    {i.quantity.toLocaleString("tr-TR")} {i.unit}
                  </TableCell>
                  <TableCell className="text-admin-text text-right text-sm tabular-nums">
                    {fmtMoney(i.unitPrice, o.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>

        <section className="admin-card overflow-hidden">
          <div className="border-admin-border border-b px-5 py-3.5">
            <h3 className="text-admin-text text-sm font-semibold">
              Belgeler ({o.documents.length})
            </h3>
          </div>
          <div className="divide-admin-border divide-y">
            {o.documents.length === 0 ? (
              <p className="text-admin-text-muted px-5 py-6 text-center text-sm">
                Belge yok
              </p>
            ) : (
              o.documents.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between px-5 py-2.5"
                >
                  <span className="text-admin-text text-sm">{d.fileName}</span>
                  <span className="text-admin-text-muted text-xs">
                    {d.type} · {safeFormat(d.createdAt, "d MMM")}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <PromptDialog
        open={dialog}
        title="Siparişi İptal Et (yönetici)"
        label="Gerekçe (en az 10 karakter — iki tarafa da bildirilir)"
        placeholder="Örn. taraflar anlaşamadı, destek talebi #123"
        required
        confirmLabel="İptal Et"
        onConfirm={(v) => {
          cancel.mutate(
            { reason: (v || "").trim() },
            {
              onSuccess: () => toast.success("Sipariş iptal edildi"),
              onError: (e: unknown) =>
                toast.error(e instanceof Error ? e.message : "Hata"),
            },
          );
          setDialog(false);
        }}
        onClose={() => setDialog(false)}
      />
    </div>
  );
}

export default function AdminOrderPage() {
  const params = useParams<{ id: string }>();
  return (
    <AdminShell>
      {params?.id ? <OrderInspection id={params.id} /> : null}
    </AdminShell>
  );
}
