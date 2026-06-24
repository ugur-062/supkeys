"use client";

import { MessageDialog } from "@/components/messaging/message-dialog";
import { CompleteOrderModal } from "@/components/orders/complete-order-modal";
import { OrderDocuments } from "@/components/orders/order-documents";
import { OrderPaymentsDialog } from "@/components/orders/order-payments-dialog";
import { OrderTimeline } from "@/components/orders/order-timeline";
import { computePaymentTotals, isPaymentOpen } from "@/lib/orders/payments";
import { OrderStatusBadge } from "@/components/orders/status-badge";
import { ReadOnlyBanner } from "@/components/tenders/read-only-banner";
import { Button } from "@/components/ui/button";
import { ReviewCard } from "./review-card";
import { useTenderOwnership } from "@/hooks/use-tender-ownership";
import {
  useCompleteOrder,
  useDownloadTenantOrderPdf,
  useOrderDetail,
} from "@/hooks/use-tenant-orders";
import type { OrderDetail } from "@/lib/tenders/types";
import axios from "axios";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  FileDown,
  FileText,
  Loader2,
  Mail,
  MessageCircle,
  Package,
  Phone,
  Wallet,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

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

function formatMoney(value: string | number, currency: string): string {
  const num = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(num)) return "—";
  try {
    return num.toLocaleString("tr-TR", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    });
  } catch {
    return `${num.toFixed(2)} ${currency}`;
  }
}

function formatNumber(value: string | number | null): string {
  if (value === null) return "—";
  const num = typeof value === "string" ? Number(value) : value;
  return num.toLocaleString("tr-TR", { minimumFractionDigits: 2 });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function OrderDetailView({ id }: { id: string }) {
  const query = useOrderDetail(id);

  if (query.isLoading && !query.data) {
    return (
      <div className="py-16 flex flex-col items-center text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin" />
        <p className="text-sm mt-2">Sipariş yükleniyor…</p>
      </div>
    );
  }

  if (!query.data) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="card p-8 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-danger-50 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-danger-600" />
          </div>
          <p className="font-medium text-brand-900">Sipariş bulunamadı</p>
          <Link href="/dashboard/siparisler">
            <Button variant="secondary" size="sm">
              <ArrowLeft className="w-4 h-4" />
              Siparişler
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const order = query.data;

  return <OrderDetailContent order={order} />;
}

function OrderDetailContent({ order }: { order: OrderDetail }) {
  const ownership = useTenderOwnership(order.tender.createdBy);
  const hasBankInfo = !!order.bankAccountHolder || !!order.bankIban;

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <Breadcrumb orderNumber={order.orderNumber} />

      {!ownership.canAct && ownership.owner ? (
        <ReadOnlyBanner
          ownerName={`${ownership.owner.firstName} ${ownership.owner.lastName}`}
          context="order"
        />
      ) : null}

      <Header order={order} />

      <OrderProgressBar order={order} />

      {ownership.canAct ? (
        <div className="sticky top-2 z-30">
          <TenantOrderActions order={order} />
        </div>
      ) : null}

      <KpiCards order={order} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 space-y-5">
          <Section title="Sipariş Geçmişi">
            <OrderTimeline order={order} />
          </Section>

          <Section title="Kazandırılan Kalemler">
            <ItemsTable order={order} />
          </Section>

          {order.bid.notes || (order.bid.attachments?.length ?? 0) > 0 ? (
            <Section title="Teklif Detayları">
              <NotesAndAttachments order={order} />
            </Section>
          ) : null}

          <Section title="Sipariş Belgeleri">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <OrderDocuments
                surface="tenant"
                orderId={order.id}
                status={order.status}
                cashPayment={order.tender.paymentTerm === "CASH"}
                isInternational={order.tender.isInternational}
              />
            </div>
          </Section>

          {/* V2-REVIEWS — COMPLETED siparişlerde değerlendirme kartı */}
          <ReviewCard
            orderId={order.id}
            supplierName={order.supplier?.companyName ?? "Tedarikçi"}
          />
        </div>

        <aside className="lg:col-span-4 space-y-5">
          <Section title="Tedarikçi">
            <SupplierCard order={order} />
          </Section>

          {hasBankInfo ? (
            <Section title="Ödeme & Fatura">
              <BankInvoiceCard order={order} />
            </Section>
          ) : null}

          <Section title="Bağlı İhale">
            <TenderLink order={order} />
          </Section>
        </aside>
      </div>
    </div>
  );
}

function TenantOrderActions({ order }: { order: OrderDetail }) {
  const [completeOpen, setCompleteOpen] = useState(false);
  const [paymentsOpen, setPaymentsOpen] = useState(false);

  const completeMutation = useCompleteOrder();

  // Faz 3 madde 16 — ödeme aksiyonu (Teslim Aldım ile aynı yerde buton + popup)
  const payments = order.payments ?? [];
  const paymentOpen = isPaymentOpen(order.tender.paymentTiming, order.status);
  const totals = computePaymentTotals(payments, order.totalAmount);
  const canRecord = paymentOpen && totals.remaining > 0;
  const showPaymentsButton = payments.length > 0 || paymentOpen;

  // PENDING'de alıcı tedarikçinin onayını bekler;
  // ACCEPTED'de tedarikçinin gönderim başlatması beklenir;
  // IN_DELIVERY'de "Teslim Aldım";
  // DELIVERED'da ödeme adımı (aşağıdaki Direkt Ödeme bölümünden);
  // COMPLETED / CANCELLED / REJECTED'da aksiyon yok (banner yeterli).
  if (
    order.status !== "PENDING" &&
    order.status !== "ACCEPTED" &&
    order.status !== "IN_DELIVERY" &&
    order.status !== "DELIVERED" &&
    order.status !== "COMPLETED" &&
    order.status !== "REJECTED" &&
    order.status !== "CANCELLED"
  ) {
    return null;
  }

  return (
    <>
      <div className="bg-white border border-surface-border rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap">
        {order.status === "PENDING" ? (
          <div className="flex items-center gap-2 text-sm text-slate-600 min-w-0">
            <Clock className="h-4 w-4 text-warning-500 flex-shrink-0" />
            <span>Tedarikçinin onaylaması bekleniyor.</span>
          </div>
        ) : null}
        {order.status === "ACCEPTED" ? (
          <div className="flex items-center gap-2 text-sm text-slate-600 min-w-0">
            <Clock className="h-4 w-4 text-brand-500 flex-shrink-0" />
            <span>Tedarikçi onayladı — gönderim bekleniyor.</span>
          </div>
        ) : null}
        {order.status === "IN_DELIVERY" ? (
          <div className="flex items-center gap-2 text-sm text-slate-600 min-w-0">
            <Clock className="h-4 w-4 text-zinc-500 flex-shrink-0" />
            <span>
              Gönderildi — kalemler ulaştığında &quot;Teslim Aldım&quot;a basın.
            </span>
          </div>
        ) : null}
        {order.status === "DELIVERED" ? (
          <div className="flex items-start gap-2 text-sm text-amber-700 min-w-0">
            <Wallet className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <span>
              Teslim aldınız. <strong>Ödeme Kaydet</strong> ile ödemenizi girin;
              tedarikçi onayladığında sipariş tamamlanacak.
            </span>
          </div>
        ) : null}
        {order.status === "COMPLETED" ? (
          <div className="flex items-center gap-2 text-sm text-success-700 min-w-0">
            <CheckCircle2 className="h-4 w-4 text-success-600 flex-shrink-0" />
            <span>Sipariş tamamlandı.</span>
          </div>
        ) : null}
        {order.status === "REJECTED" ? (
          <div className="flex items-start gap-2 text-sm text-orange-700 min-w-0">
            <XCircle className="h-4 w-4 text-orange-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Tedarikçi siparişi reddetti.</p>
              {order.rejectReason ? (
                <p className="text-xs text-orange-600 mt-0.5 whitespace-pre-wrap">
                  Sebep: {order.rejectReason}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
        {order.status === "CANCELLED" ? (
          <div className="flex items-center gap-2 text-sm text-danger-700 min-w-0">
            <XCircle className="h-4 w-4 text-danger-600 flex-shrink-0" />
            <span>Sipariş iptal edildi.</span>
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          {showPaymentsButton ? (
            <Button
              variant={canRecord ? "primary" : "secondary"}
              onClick={() => setPaymentsOpen(true)}
            >
              <Wallet className="w-4 h-4" />
              {canRecord ? "Ödeme Kaydet" : "Ödemeler"}
            </Button>
          ) : null}
          {order.status === "IN_DELIVERY" ? (
            <Button
              variant="primary"
              onClick={() => setCompleteOpen(true)}
              className="!bg-success-600 hover:!bg-success-700 focus:!ring-success-500"
            >
              <CheckCircle2 className="w-4 h-4" />
              Teslim Aldım
            </Button>
          ) : null}
        </div>
      </div>

      <OrderPaymentsDialog
        open={paymentsOpen}
        onClose={() => setPaymentsOpen(false)}
        surface="tenant"
        order={order}
        canAct
      />

      <CompleteOrderModal
        open={completeOpen}
        onClose={() => setCompleteOpen(false)}
        loading={completeMutation.isPending}
        orderNumber={order.orderNumber}
        afterDeliveryPayment={order.tender.paymentTiming === "AFTER_DELIVERY"}
        onConfirm={(note) =>
          completeMutation.mutate(
            { id: order.id, completedNote: note || undefined },
            {
              onSuccess: (data) => {
                toast.success(
                  data.status === "DELIVERED"
                    ? "Teslim alındı — ödeme adımına geçebilirsiniz"
                    : "Sipariş tamamlandı",
                );
                setCompleteOpen(false);
              },
              onError: (err) =>
                toast.error(getErrorMessage(err, "İşlem başarısız")),
            },
          )
        }
      />
    </>
  );
}

function Breadcrumb({ orderNumber }: { orderNumber: string }) {
  return (
    <nav className="flex items-center gap-1.5 text-sm text-slate-500">
      <Link
        href="/dashboard"
        className="hover:text-brand-700 hover:underline"
      >
        Dashboard
      </Link>
      <ChevronRight className="w-3.5 h-3.5" />
      <Link
        href="/dashboard/siparisler"
        className="hover:text-brand-700 hover:underline"
      >
        Siparişler
      </Link>
      <ChevronRight className="w-3.5 h-3.5" />
      <span className="text-brand-700 font-mono font-semibold">
        {orderNumber}
      </span>
    </nav>
  );
}

function Header({ order }: { order: OrderDetail }) {
  const downloadPdf = useDownloadTenantOrderPdf();
  const [messageOpen, setMessageOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50/60 via-white to-zinc-50/40 p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-brand-100 flex items-center justify-center flex-shrink-0">
            <Package className="w-6 h-6 text-brand-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">
              {order.orderNumber}
            </p>
            <h1 className="font-semibold text-2xl text-brand-900 mt-0.5">
              {order.tender.title}
            </h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <OrderStatusBadge status={order.status} />
              <span className="text-xs text-slate-500">
                Oluşturulma:{" "}
                {format(new Date(order.createdAt), "d MMM yyyy HH:mm", {
                  locale: tr,
                })}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setMessageOpen(true)}
          >
            <MessageCircle className="w-4 h-4" />
            Tedarikçiye Mesaj
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              downloadPdf.mutate(
                { id: order.id, orderNumber: order.orderNumber },
                {
                  onSuccess: () => toast.success("PDF indirildi"),
                  onError: (err) =>
                    toast.error(getErrorMessage(err, "PDF indirilemedi")),
                },
              )
            }
            loading={downloadPdf.isPending}
            disabled={downloadPdf.isPending}
          >
            <FileDown className="w-4 h-4" />
            PDF İndir
          </Button>
        </div>
      </div>

      <MessageDialog
        open={messageOpen}
        onClose={() => setMessageOpen(false)}
        surface="tenant"
        otherPartyId={order.supplier?.id ?? ""}
        defaultContext={{ context: "ORDER", contextRefId: order.id }}
        currentUserType="TENANT_USER"
        otherPartyName={order.supplier?.companyName ?? "Tedarikçi"}
        contextNumber={`Sipariş ${order.orderNumber}`}
      />
    </div>
  );
}

function KpiCards({ order }: { order: OrderDetail }) {
  const winningCount = order.bid.items.length;
  const totalItems = order.tender.items.length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Kpi
        label="Toplam Tutar"
        value={formatMoney(order.totalAmount, order.currency)}
        valueClass="text-success-700 text-xl"
      />
      <Kpi
        label="Kazandırılan Kalem"
        value={`${winningCount} / ${totalItems}`}
      />
      <Kpi
        label="Para Birimi"
        value={order.currency}
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <p className="text-[11px] text-slate-500 uppercase font-semibold tracking-wide">
        {label}
      </p>
      <p
        className={`mt-2 font-bold text-brand-900 ${valueClass ?? "text-2xl"}`}
      >
        {value}
      </p>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-bold text-brand-900 uppercase tracking-wider">
        {title}
      </h2>
      {children}
    </section>
  );
}

function SupplierCard({ order }: { order: OrderDetail }) {
  const supplier = order.supplier;
  if (!supplier) return null;
  const primaryUser = supplier.users[0];
  const initials = supplier.companyName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-zinc-500 text-white flex items-center justify-center flex-shrink-0 font-bold text-sm shadow-sm">
          {initials || <Building2 className="w-5 h-5" />}
        </div>
        <div className="min-w-0">
          <p className="font-bold text-brand-900 leading-tight">
            {supplier.companyName}
          </p>
          <p className="text-[11px] text-slate-500 mt-1 font-mono">
            VKN: {supplier.taxNumber}
          </p>
          {supplier.city ? (
            <p className="text-xs text-slate-500 mt-0.5">
              {supplier.city}
              {supplier.industry ? ` · ${supplier.industry}` : ""}
            </p>
          ) : null}
        </div>
      </div>

      {primaryUser ? (
        <div className="space-y-2 pt-3 border-t border-slate-100">
          <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
            Yetkili Kişi
          </p>
          <p className="text-sm font-medium text-brand-900">
            {primaryUser.firstName} {primaryUser.lastName}
          </p>
          <div className="space-y-1 text-xs text-slate-600">
            <p className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
              <a
                href={`mailto:${primaryUser.email}`}
                className="hover:text-brand-700 hover:underline truncate"
              >
                {primaryUser.email}
              </a>
            </p>
            {primaryUser.phone ? (
              <p className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                <a
                  href={`tel:${primaryUser.phone}`}
                  className="hover:text-brand-700 hover:underline"
                >
                  {primaryUser.phone}
                </a>
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OrderProgressBar({ order }: { order: OrderDetail }) {
  const status = order.status;
  // Faz 3 madde 16 — teslim sonrası ödemeli ihalede araya "Teslim Alındı"
  // (ödeme bekleniyor) adımı girer.
  const afterDelivery = order.tender.paymentTiming === "AFTER_DELIVERY";

  const map: Record<string, number> = afterDelivery
    ? { PENDING: 0, ACCEPTED: 1, IN_DELIVERY: 2, DELIVERED: 3, COMPLETED: 4 }
    : { PENDING: 0, ACCEPTED: 1, IN_DELIVERY: 2, IN_PROGRESS: 2, COMPLETED: 3 };
  const isTerminated = status === "REJECTED" || status === "CANCELLED";
  const activeIdx = isTerminated ? -1 : (map[status] ?? 0);

  const stages = afterDelivery
    ? [
        { key: "created", label: "Oluşturuldu" },
        { key: "accepted", label: "Onaylandı" },
        { key: "delivery", label: "Gönderildi" },
        { key: "received", label: "Teslim Alındı" },
        { key: "completed", label: "Tamamlandı" },
      ]
    : [
        { key: "created", label: "Oluşturuldu" },
        { key: "accepted", label: "Onaylandı" },
        { key: "delivery", label: "Gönderildi" },
        { key: "completed", label: "Tamamlandı" },
      ];

  if (isTerminated) {
    const isRejected = status === "REJECTED";
    return (
      <div
        className={`flex items-center gap-3 rounded-2xl border p-4 ${
          isRejected
            ? "border-orange-200 bg-orange-50"
            : "border-rose-200 bg-rose-50"
        }`}
      >
        <XCircle
          className={`h-5 w-5 ${
            isRejected ? "text-orange-600" : "text-rose-600"
          }`}
        />
        <p
          className={`text-sm font-semibold ${
            isRejected ? "text-orange-800" : "text-rose-800"
          }`}
        >
          {isRejected ? "Sipariş reddedildi" : "Sipariş iptal edildi"}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex items-center justify-between">
        {stages.map((s, i) => {
          const isDone = i < activeIdx;
          const isActive = i === activeIdx;
          return (
            <div key={s.key} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-2 min-w-0">
                <div
                  className={`h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold border-2 transition ${
                    isActive
                      ? "bg-brand-600 text-white border-brand-600 ring-4 ring-brand-100"
                      : isDone
                        ? "bg-success-500 text-white border-success-500"
                        : "bg-white text-slate-400 border-slate-200"
                  }`}
                >
                  {isDone ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                </div>
                <p
                  className={`text-[11px] font-semibold tracking-tight text-center ${
                    isActive
                      ? "text-brand-700"
                      : isDone
                        ? "text-success-700"
                        : "text-slate-400"
                  }`}
                >
                  {s.label}
                </p>
              </div>
              {i < stages.length - 1 ? (
                <div
                  className={`h-0.5 flex-1 mx-1 mb-6 transition ${
                    i < activeIdx ? "bg-success-400" : "bg-slate-200"
                  }`}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BankInvoiceCard({ order }: { order: OrderDetail }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
      {order.bankAccountHolder ? (
        <div>
          <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
            Hesap Sahibi
          </p>
          <p className="text-sm text-brand-900 font-medium mt-0.5">
            {order.bankAccountHolder}
          </p>
        </div>
      ) : null}
      {order.bankIban ? (
        <div>
          <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
            IBAN
          </p>
          <p className="text-sm text-brand-900 font-mono mt-0.5 break-all">
            {order.bankIban}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function TenderLink({ order }: { order: OrderDetail }) {
  return (
    <Link
      href={`/dashboard/ihaleler/${order.tender.id}`}
      className="block bg-white border border-slate-200 rounded-xl p-4 hover:border-brand-300 transition group"
    >
      <p className="font-mono text-xs text-slate-500">
        {order.tender.tenderNumber}
      </p>
      <p className="font-bold text-brand-900 group-hover:text-brand-700 mt-1">
        {order.tender.title}
      </p>
    </Link>
  );
}

function ItemsTable({ order }: { order: OrderDetail }) {
  return (
    <div className="space-y-2.5">
      {order.bid.items.map((bi, idx) => (
        <div
          key={bi.id}
          className="rounded-xl border border-zinc-950/5 bg-white p-4 transition-colors hover:border-zinc-950/15"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-xs font-bold text-zinc-600">
                {idx + 1}
              </div>
              <div className="min-w-0">
                <p className="font-semibold leading-tight text-zinc-900">
                  {bi.tenderItem.name}
                </p>
                {bi.tenderItem.materialCode ? (
                  <p className="mt-0.5 font-mono text-xs text-zinc-500">
                    {bi.tenderItem.materialCode}
                  </p>
                ) : null}
                {bi.tenderItem.description ? (
                  <p className="mt-1 line-clamp-2 text-xs text-zinc-500">
                    {bi.tenderItem.description}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-base font-bold tabular-nums text-zinc-950">
                {bi.totalPrice ? formatMoney(bi.totalPrice, bi.currency) : "—"}
              </p>
              <p className="mt-0.5 text-xs tabular-nums text-zinc-500">
                {Number(bi.tenderItem.quantity).toLocaleString("tr-TR")}{" "}
                {bi.tenderItem.unit}
                {bi.unitPrice
                  ? ` × ${bi.currency} ${formatNumber(bi.unitPrice)}`
                  : ""}
              </p>
            </div>
          </div>
        </div>
      ))}

      {/* Toplam */}
      <div className="flex items-center justify-between rounded-xl bg-zinc-900 px-4 py-3 text-white">
        <span className="text-sm font-semibold">Toplam Tutar</span>
        <span className="text-lg font-bold tabular-nums">
          {formatMoney(order.totalAmount, order.currency)}
        </span>
      </div>
    </div>
  );
}

function NotesAndAttachments({ order }: { order: OrderDetail }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
      {order.bid.notes ? (
        <div>
          <p className="text-[11px] text-slate-500 uppercase font-semibold tracking-wide mb-2">
            Tedarikçi Notu
          </p>
          <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 p-3 rounded-lg border border-slate-100">
            {order.bid.notes}
          </p>
        </div>
      ) : null}

      {order.bid.attachments && order.bid.attachments.length > 0 ? (
        <div>
          <p className="text-[11px] text-slate-500 uppercase font-semibold tracking-wide mb-2">
            Teklif Dosyaları ({order.bid.attachments.length})
          </p>
          <div className="space-y-2">
            {order.bid.attachments.map((att) => (
              <a
                key={att.id}
                href={att.fileUrl}
                download={att.fileName}
                className="flex items-center gap-3 p-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition border border-slate-100"
              >
                <FileText className="h-5 w-5 text-brand-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-brand-700 hover:underline truncate">
                    {att.fileName}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatBytes(att.fileSize)}
                  </p>
                </div>
                <Download className="h-4 w-4 text-slate-400" />
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
