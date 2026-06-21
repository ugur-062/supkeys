"use client";

/**
 * Faz 3 madde 16 — Sipariş direkt ödeme paneli.
 *
 * Hem alıcı (/dashboard) hem tedarikçi (/supplier) sipariş detayında kullanılır.
 * Akış: alıcı kayıt ekler ("ödedim") → tedarikçi onaylar ("aldım") / reddeder.
 *  - Alıcı: ödeme açıkken kayıt ekler; AWAITING kaydı siler.
 *  - Tedarikçi: AWAITING kaydı onaylar/reddeder.
 */
import { AttachmentList } from "@/components/attachments/attachment-list";
import { AttachmentUpload } from "@/components/attachments/attachment-upload";
import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/ui/button";
import {
  useConfirmOrderPayment,
  useRejectOrderPayment,
} from "@/hooks/use-supplier-orders";
import {
  useCreateOrderPayment,
  useDeleteOrderPayment,
} from "@/hooks/use-tenant-orders";
import { formatPrice } from "@/lib/format-currency";
import {
  computePaymentTotals,
  isPaymentOpen,
  paymentClosedReason,
} from "@/lib/orders/payments";
import {
  ORDER_PAYMENT_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
} from "@/lib/tenders/labels";
import type {
  Currency,
  OrderDetail,
  OrderPayment,
  OrderPaymentStatus,
} from "@/lib/tenders/types";
import axios from "axios";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { CheckCircle2, Landmark, Trash2, Wallet, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { RecordPaymentModal } from "./record-payment-modal";
import { RejectPaymentModal } from "./reject-payment-modal";

function getErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as
      | { message?: string | string[] }
      | undefined;
    if (Array.isArray(data?.message)) return data.message.join(", ");
    return data?.message ?? fallback;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

const STATUS_BADGE: Record<
  OrderPaymentStatus,
  "amber" | "green" | "red"
> = {
  AWAITING_CONFIRMATION: "amber",
  CONFIRMED: "green",
  REJECTED: "red",
};

interface Props {
  surface: "tenant" | "supplier";
  order: OrderDetail;
  /** Alıcı tarafında aksiyon yetkisi (creator gate). Tedarikçide kullanılmaz. */
  canAct?: boolean;
  /** Popup/dialog içinde kullanılırken dış kart kabuğunu (border/padding) kaldırır. */
  bare?: boolean;
}

export function OrderPaymentsCard({
  surface,
  order,
  canAct = true,
  bare = false,
}: Props) {
  const currency = order.currency as Currency;
  const payments = order.payments ?? [];
  const totals = computePaymentTotals(payments, order.totalAmount);
  const open = isPaymentOpen(order.tender.paymentTiming, order.status);

  const createPayment = useCreateOrderPayment();
  const deletePayment = useDeleteOrderPayment();
  const confirmPayment = useConfirmOrderPayment();
  const rejectPayment = useRejectOrderPayment();

  const [recordOpen, setRecordOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const isTenant = surface === "tenant";

  const handleDelete = (paymentId: string) => {
    deletePayment.mutate(
      { orderId: order.id, paymentId },
      {
        onSuccess: () => toast.success("Ödeme kaydı silindi"),
        onError: (err) => toast.error(getErrorMessage(err, "Silinemedi")),
      },
    );
  };

  const handleConfirm = (paymentId: string) => {
    confirmPayment.mutate(
      { orderId: order.id, paymentId },
      {
        onSuccess: () => toast.success("Ödeme onaylandı"),
        onError: (err) => toast.error(getErrorMessage(err, "Onaylanamadı")),
      },
    );
  };

  const hasBankInfo = !!order.bankAccountHolder || !!order.bankIban;

  return (
    <div
      className={
        bare
          ? "space-y-4"
          : "bg-white border border-slate-200 rounded-xl p-5 space-y-4"
      }
    >
      {/* Tedarikçi ödeme bilgileri — alıcıya "nereye ödeyeceğini" gösterir */}
      {isTenant && hasBankInfo ? (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-3">
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
            <Landmark className="h-3.5 w-3.5" />
            Tedarikçi Ödeme Bilgileri
          </p>
          <div className="mt-2 space-y-1 text-sm">
            {order.bankAccountHolder ? (
              <p className="text-zinc-900">
                <span className="text-slate-500">Hesap Sahibi: </span>
                {order.bankAccountHolder}
              </p>
            ) : null}
            {order.bankIban ? (
              <p className="font-mono text-zinc-900 break-all">
                <span className="font-sans text-slate-500">IBAN: </span>
                {order.bankIban}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Özet */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryStat
          label="Onaylanan"
          value={formatPrice(totals.confirmed, currency)}
          valueClass="text-success-700"
        />
        <SummaryStat
          label="Bekleyen"
          value={formatPrice(totals.pending, currency)}
          valueClass="text-amber-600"
        />
        <SummaryStat
          label="Kalan"
          value={formatPrice(totals.remaining, currency)}
          valueClass="text-zinc-900"
        />
      </div>

      {/* Kayıt listesi */}
      {payments.length > 0 ? (
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {payments.map((p) => (
            <PaymentRow
              key={p.id}
              payment={p}
              currency={currency}
              canDelete={isTenant && canAct && p.status === "AWAITING_CONFIRMATION"}
              canRespond={!isTenant && p.status === "AWAITING_CONFIRMATION"}
              onDelete={() => handleDelete(p.id)}
              deleting={
                deletePayment.isPending &&
                deletePayment.variables?.paymentId === p.id
              }
              onConfirm={() => handleConfirm(p.id)}
              confirming={
                confirmPayment.isPending &&
                confirmPayment.variables?.paymentId === p.id
              }
              onReject={() => setRejectingId(p.id)}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500 border-t border-slate-100 pt-4">
          Henüz ödeme kaydı yok.
        </p>
      )}

      {/* Alıcı: kayıt ekleme */}
      {isTenant ? (
        open && canAct ? (
          <div className="flex justify-end pt-1">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setRecordOpen(true)}
              disabled={totals.remaining <= 0}
            >
              <Wallet className="h-4 w-4" />
              Ödeme Kaydet
            </Button>
          </div>
        ) : !open ? (
          <p className="text-xs text-slate-500 pt-1">
            {paymentClosedReason(order.tender.paymentTiming)}
          </p>
        ) : null
      ) : null}

      {/* Ödeme dekontu — alıcı opsiyonel yükler, ikisi de görür */}
      <div className="border-t border-slate-100 pt-4 space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
          Ödeme Dekontu
        </p>
        <AttachmentList
          surface={surface}
          scope="ORDER_PAYMENT_PROOF"
          scopeRefId={order.id}
          canDelete={isTenant && canAct}
          emptyText="Henüz dekont yüklenmedi"
        />
        {isTenant && canAct && open ? (
          <AttachmentUpload
            surface="tenant"
            scope="ORDER_PAYMENT_PROOF"
            scopeRefId={order.id}
            hint="Ödeme dekontu/makbuzu (opsiyonel) — PDF, görsel, max 50 MB"
          />
        ) : null}
      </div>

      <RecordPaymentModal
        open={recordOpen}
        onClose={() => setRecordOpen(false)}
        loading={createPayment.isPending}
        orderNumber={order.orderNumber}
        currency={currency}
        remaining={totals.remaining}
        onConfirm={(input) =>
          createPayment.mutate(
            { orderId: order.id, ...input },
            {
              onSuccess: () => {
                toast.success("Ödeme kaydı oluşturuldu");
                setRecordOpen(false);
              },
              onError: (err) =>
                toast.error(getErrorMessage(err, "Kaydedilemedi")),
            },
          )
        }
      />

      <RejectPaymentModal
        open={rejectingId !== null}
        onClose={() => setRejectingId(null)}
        loading={rejectPayment.isPending}
        onConfirm={(reason) => {
          if (!rejectingId) return;
          rejectPayment.mutate(
            { orderId: order.id, paymentId: rejectingId, reason },
            {
              onSuccess: () => {
                toast.success("Ödeme reddedildi");
                setRejectingId(null);
              },
              onError: (err) =>
                toast.error(getErrorMessage(err, "Reddedilemedi")),
            },
          );
        }}
      />
    </div>
  );
}

function SummaryStat({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
        {label}
      </p>
      <p className={`mt-1 text-sm font-bold tabular-nums ${valueClass ?? ""}`}>
        {value}
      </p>
    </div>
  );
}

function PaymentRow({
  payment,
  currency,
  canDelete,
  canRespond,
  onDelete,
  deleting,
  onConfirm,
  confirming,
  onReject,
}: {
  payment: OrderPayment;
  currency: Currency;
  canDelete: boolean;
  canRespond: boolean;
  onDelete: () => void;
  deleting: boolean;
  onConfirm: () => void;
  confirming: boolean;
  onReject: () => void;
}) {
  const p = payment;
  return (
    <li className="py-3 first:pt-3 space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-bold text-zinc-900 tabular-nums">
            {formatPrice(p.amount, currency)}
          </span>
          <span className="text-xs text-slate-500">
            {PAYMENT_METHOD_LABELS[p.method]}
          </span>
        </div>
        <Badge color={STATUS_BADGE[p.status]}>
          {ORDER_PAYMENT_STATUS_LABELS[p.status]}
        </Badge>
      </div>

      {p.method === "CHEQUE" ? (
        <p className="text-xs text-slate-500">
          Çek No: <span className="font-mono">{p.chequeNo}</span>
          {p.chequeBank ? ` · ${p.chequeBank}` : ""}
          {p.chequeDueDate
            ? ` · Vade: ${format(new Date(p.chequeDueDate), "d MMM yyyy", { locale: tr })}`
            : ""}
        </p>
      ) : null}

      {p.note ? (
        <p className="text-xs text-slate-600 whitespace-pre-wrap">{p.note}</p>
      ) : null}

      <p className="text-[11px] text-slate-400">
        Kayıt:{" "}
        {format(new Date(p.markedPaidAt), "d MMM yyyy HH:mm", { locale: tr })}
        {p.status === "CONFIRMED" && p.confirmedAt
          ? ` · Onay: ${format(new Date(p.confirmedAt), "d MMM yyyy HH:mm", { locale: tr })}`
          : ""}
      </p>

      {p.status === "REJECTED" && p.rejectReason ? (
        <p className="text-xs text-orange-700 bg-orange-50 border border-orange-100 rounded-md px-2 py-1.5">
          <strong>Red sebebi:</strong> {p.rejectReason}
        </p>
      ) : null}

      {canDelete ? (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            loading={deleting}
            disabled={deleting}
            className="!text-danger-600 hover:!bg-danger-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Sil
          </Button>
        </div>
      ) : null}

      {canRespond ? (
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onReject}
            className="!text-orange-700 hover:!bg-orange-50"
          >
            <XCircle className="h-3.5 w-3.5" />
            Almadım
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onConfirm}
            loading={confirming}
            disabled={confirming}
            className="!bg-success-600 hover:!bg-success-700 focus:!ring-success-500"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Aldım
          </Button>
        </div>
      ) : null}
    </li>
  );
}
