"use client";

import { AttachmentList } from "@/components/attachments/attachment-list";
import { AttachmentUpload } from "@/components/attachments/attachment-upload";
import { MessageThread } from "@/components/messaging/message-thread";
import { AcceptOrderModal } from "@/components/orders/accept-order-modal";
import { OrderTimeline } from "@/components/orders/order-timeline";
import { RejectOrderModal } from "@/components/orders/reject-order-modal";
import { StartDeliveryModal } from "@/components/orders/start-delivery-modal";
import { PanelCard } from "@/components/supplier/panel-card";
import { SupplierOrderStatusBadge } from "@/components/supplier/status-badges";
import { Button } from "@/components/ui/button";
import {
  useAcceptOrder,
  useDownloadSupplierOrderPdf,
  useRejectOrder,
  useStartDelivery,
  useSupplierOrderDetail,
} from "@/hooks/use-supplier-orders";
import { formatPrice } from "@/lib/format-currency";
import type { Currency, OrderDetail } from "@/lib/tenders/types";
import { cn } from "@/lib/utils";
import * as TabsPrimitive from "@radix-ui/react-tabs";
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
  FileDown,
  FileText,
  Loader2,
  MapPin,
  MessageCircle,
  Package,
  Paperclip,
  ThumbsUp,
  Truck,
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
  return fallback;
}

function formatNumber(value: string | number | null): string {
  if (value === null) return "—";
  const num = typeof value === "string" ? Number(value) : value;
  return num.toLocaleString("tr-TR", { minimumFractionDigits: 2 });
}

const TAB_TRIGGER_CLASSES = cn(
  "group inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
  "border-transparent text-slate-500 hover:text-slate-700",
  "data-[state=active]:border-brand-600 data-[state=active]:text-brand-700",
  "focus:outline-none",
);

export function SupplierOrderDetailView({ id }: { id: string }) {
  const query = useSupplierOrderDetail(id);
  const downloadPdf = useDownloadSupplierOrderPdf();

  if (query.isLoading && !query.data) {
    return (
      <div className="py-16 flex flex-col items-center text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin" />
        <p className="text-sm mt-2">Sipariş yükleniyor…</p>
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <PanelCard className="text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-danger-50 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-danger-600" />
          </div>
          <p className="font-medium text-brand-900">Sipariş bulunamadı</p>
          <Link href="/supplier/siparisler">
            <Button variant="secondary" size="sm">
              <ArrowLeft className="w-4 h-4" />
              Siparişler
            </Button>
          </Link>
        </PanelCard>
      </div>
    );
  }

  const order = query.data;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Breadcrumb + Title */}
      <div>
        <nav className="flex items-center gap-1.5 text-sm text-slate-500 mb-3">
          <Link
            href="/supplier/siparisler"
            className="hover:text-brand-700 hover:underline"
          >
            Siparişler
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-brand-700 font-mono font-semibold">
            {order.orderNumber}
          </span>
        </nav>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <h1 className="font-display font-bold text-2xl md:text-3xl text-brand-900">
              {order.tender.title}
            </h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <SupplierOrderStatusBadge status={order.status} size="lg" />
              <span className="text-xs text-slate-500">
                Oluşturulma:{" "}
                {format(new Date(order.createdAt), "d MMM yyyy HH:mm", {
                  locale: tr,
                })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3-kolon ana grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sol: Vertical timeline (3 col) */}
        <aside className="lg:col-span-3">
          <div className="lg:sticky lg:top-4">
            <PanelCard title="Sipariş Akışı" subtitle="Süreç takibi">
              <OrderTimeline order={order} />
            </PanelCard>
          </div>
        </aside>

        {/* Orta: Tabs (6 col) */}
        <main className="lg:col-span-6">
          <TabsPrimitive.Root defaultValue="items" className="space-y-4">
            <TabsPrimitive.List
              className="border-b border-surface-border flex gap-1 overflow-x-auto"
              aria-label="Sipariş detay sekmeleri"
            >
              <TabsPrimitive.Trigger value="items" className={TAB_TRIGGER_CLASSES}>
                <Package className="h-4 w-4" />
                Kalemler
              </TabsPrimitive.Trigger>
              <TabsPrimitive.Trigger value="files" className={TAB_TRIGGER_CLASSES}>
                <Paperclip className="h-4 w-4" />
                Dosyalar
              </TabsPrimitive.Trigger>
              <TabsPrimitive.Trigger
                value="messages"
                className={TAB_TRIGGER_CLASSES}
              >
                <MessageCircle className="h-4 w-4" />
                Mesajlar
              </TabsPrimitive.Trigger>
            </TabsPrimitive.List>

            <TabsPrimitive.Content value="items" className="outline-none space-y-4">
              <PanelCard title="Kazandığınız Kalemler" padding="none">
                <ItemsTable order={order} />
              </PanelCard>
              {order.bid.notes ? (
                <PanelCard title="Teklif Notunuz">
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">
                    {order.bid.notes}
                  </p>
                </PanelCard>
              ) : null}
            </TabsPrimitive.Content>

            <TabsPrimitive.Content value="files" className="outline-none">
              <PanelCard title="Sipariş Dosyaları">
                <div className="space-y-3">
                  <AttachmentUpload
                    surface="supplier"
                    scope="ORDER_INVOICE"
                    scopeRefId={order.id}
                  />
                  <AttachmentList
                    surface="supplier"
                    scope="ORDER_INVOICE"
                    scopeRefId={order.id}
                    canDelete
                    emptyText="Henüz dosya yüklenmedi"
                  />
                </div>
              </PanelCard>
            </TabsPrimitive.Content>

            <TabsPrimitive.Content value="messages" className="outline-none">
              <MessageThread
                surface="supplier"
                context="ORDER"
                contextRefId={order.id}
                currentUserType="SUPPLIER_USER"
                headerInfo={{
                  otherPartyName: order.tenant?.name ?? "Alıcı",
                  contextNumber: order.orderNumber,
                }}
              />
            </TabsPrimitive.Content>
          </TabsPrimitive.Root>
        </main>

        {/* Sağ: Action sidebar (3 col) */}
        <aside className="lg:col-span-3">
          <div className="lg:sticky lg:top-4 space-y-4">
            {/* Aksiyon banner */}
            <SupplierOrderActions order={order} />

            {/* Tutar özeti */}
            <PanelCard title="Tutar" padding="md">
              <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">
                Toplam
              </p>
              <p className="text-2xl font-bold text-success-700 tabular-nums mt-1">
                {formatPrice(order.totalAmount, order.currency as Currency)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {order.bid.items.length} / {order.tender.items.length} kalem
                kazanıldı
              </p>
            </PanelCard>

            {/* Alıcı */}
            {order.tenant ? (
              <PanelCard title="Alıcı" padding="md">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-4 h-4 text-brand-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-brand-900 text-sm truncate">
                      {order.tenant.name}
                    </p>
                  </div>
                </div>
              </PanelCard>
            ) : null}

            {/* Bağlı ihale */}
            <PanelCard title="Bağlı İhale" padding="md">
              <Link
                href={`/supplier/ihaleler/${order.tender.id}`}
                className="block text-sm hover:text-brand-700 transition-colors"
              >
                <p className="font-mono text-xs text-slate-500">
                  {order.tender.tenderNumber}
                </p>
                <p className="font-semibold text-brand-900 mt-0.5 truncate">
                  {order.tender.title}
                </p>
              </Link>
            </PanelCard>

            {/* Teslimat adresi (varsa) */}
            {order.tender.deliveryAddress ? (
              <PanelCard title="Teslimat" padding="md">
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-600 whitespace-pre-line">
                    {order.tender.deliveryAddress}
                  </p>
                </div>
              </PanelCard>
            ) : null}

            {/* PDF indir */}
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() =>
                downloadPdf.mutate(
                  { id: order.id, orderNumber: order.orderNumber },
                  {
                    onSuccess: () => toast.success("PDF indirildi"),
                    onError: () => toast.error("PDF indirilemedi"),
                  },
                )
              }
              loading={downloadPdf.isPending}
              disabled={downloadPdf.isPending}
            >
              <FileDown className="w-4 h-4" />
              Sipariş PDF İndir
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function SupplierOrderActions({ order }: { order: OrderDetail }) {
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);

  const acceptOrder = useAcceptOrder();
  const rejectOrder = useRejectOrder();
  const startDelivery = useStartDelivery();

  if (order.status === "PENDING") {
    return (
      <>
        <PanelCard padding="md" className="border-brand-200 bg-brand-50/40">
          <div className="flex items-start gap-2 mb-3">
            <ThumbsUp className="h-4 w-4 text-brand-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-brand-900 leading-relaxed">
              Siparişi inceleyin: onaylamak için tahmini teslim tarihi ve
              ödeme bilgilerinizi girin, veya gerekiyorsa reddedin.
            </p>
          </div>
          <Button
            variant="primary"
            className="w-full !bg-brand-600 hover:!bg-brand-700 focus:!ring-brand-500 mb-2"
            onClick={() => setAcceptOpen(true)}
          >
            <ThumbsUp className="w-4 h-4" />
            Siparişi Onayla
          </Button>
          <Button
            variant="ghost"
            className="w-full !text-orange-700 hover:!bg-orange-50"
            onClick={() => setRejectOpen(true)}
          >
            <XCircle className="w-4 h-4" />
            Reddet
          </Button>
        </PanelCard>

        <AcceptOrderModal
          open={acceptOpen}
          onClose={() => setAcceptOpen(false)}
          loading={acceptOrder.isPending}
          orderNumber={order.orderNumber}
          onConfirm={(input) =>
            acceptOrder.mutate(
              { id: order.id, ...input },
              {
                onSuccess: () => {
                  toast.success("Sipariş onaylandı");
                  setAcceptOpen(false);
                },
                onError: (err) =>
                  toast.error(getErrorMessage(err, "Onaylanamadı")),
              },
            )
          }
        />

        <RejectOrderModal
          open={rejectOpen}
          onClose={() => setRejectOpen(false)}
          loading={rejectOrder.isPending}
          orderNumber={order.orderNumber}
          onConfirm={(reason) =>
            rejectOrder.mutate(
              { id: order.id, reason },
              {
                onSuccess: () => {
                  toast.success("Sipariş reddedildi");
                  setRejectOpen(false);
                },
                onError: (err) =>
                  toast.error(getErrorMessage(err, "Reddedilemedi")),
              },
            )
          }
        />
      </>
    );
  }

  if (order.status === "ACCEPTED") {
    return (
      <>
        <PanelCard padding="md" className="border-indigo-200 bg-indigo-50/40">
          <div className="flex items-start gap-2 mb-3">
            <Truck className="h-4 w-4 text-indigo-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-indigo-900 leading-relaxed">
              Hazırlık tamamlandığında sipariş gönderildi olarak işaretleyin.
            </p>
          </div>
          <Button
            variant="primary"
            className="w-full !bg-indigo-600 hover:!bg-indigo-700 focus:!ring-indigo-500"
            onClick={() => setDeliveryOpen(true)}
          >
            <Truck className="w-4 h-4" />
            Siparişi Gönder
          </Button>
        </PanelCard>

        <StartDeliveryModal
          open={deliveryOpen}
          onClose={() => setDeliveryOpen(false)}
          loading={startDelivery.isPending}
          orderNumber={order.orderNumber}
          expectedDeliveryDate={order.expectedDeliveryDate}
          onConfirm={(input) =>
            startDelivery.mutate(
              { id: order.id, ...input },
              {
                onSuccess: () => {
                  toast.success("Sipariş gönderildi");
                  setDeliveryOpen(false);
                },
                onError: (err) =>
                  toast.error(getErrorMessage(err, "Gönderilemedi")),
              },
            )
          }
        />
      </>
    );
  }

  if (order.status === "IN_DELIVERY") {
    return (
      <PanelCard padding="md" className="border-amber-200 bg-amber-50/40">
        <div className="flex items-start gap-2">
          <Clock className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-900 leading-relaxed">
            Alıcının teslim aldığını onaylaması bekleniyor.
          </p>
        </div>
      </PanelCard>
    );
  }

  if (order.status === "COMPLETED") {
    return (
      <PanelCard padding="md" className="border-emerald-200 bg-emerald-50/40">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-emerald-900 leading-relaxed font-medium">
            Sipariş alıcı tarafından teslim alındı, tamamlandı.
          </p>
        </div>
      </PanelCard>
    );
  }

  if (order.status === "REJECTED") {
    return (
      <PanelCard padding="md" className="border-orange-200 bg-orange-50/40">
        <div className="flex items-start gap-2">
          <XCircle className="h-4 w-4 text-orange-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs text-orange-900 font-semibold">
              Siparişi reddettiniz.
            </p>
            {order.rejectReason ? (
              <p className="text-[11px] text-orange-700 mt-1.5 whitespace-pre-wrap">
                <strong>Sebep:</strong> {order.rejectReason}
              </p>
            ) : null}
          </div>
        </div>
      </PanelCard>
    );
  }

  if (order.status === "CANCELLED") {
    return (
      <PanelCard padding="md" className="border-rose-200 bg-rose-50/40">
        <div className="flex items-start gap-2">
          <XCircle className="h-4 w-4 text-rose-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs text-rose-900 font-semibold">
              Sipariş alıcı tarafından iptal edildi.
            </p>
            {order.cancelReason ? (
              <p className="text-[11px] text-rose-700 mt-1.5 whitespace-pre-wrap">
                <strong>Sebep:</strong> {order.cancelReason}
              </p>
            ) : null}
          </div>
        </div>
      </PanelCard>
    );
  }

  return null;
}

function ItemsTable({ order }: { order: OrderDetail }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="text-left px-4 py-3 font-semibold text-slate-700">
              Kalem
            </th>
            <th className="text-right px-4 py-3 font-semibold text-slate-700 w-32">
              Miktar
            </th>
            <th className="text-right px-4 py-3 font-semibold text-slate-700 w-40">
              Birim Fiyat
            </th>
            <th className="text-right px-4 py-3 font-semibold text-slate-700 w-44">
              Toplam
            </th>
          </tr>
        </thead>
        <tbody>
          {order.bid.items.map((bi) => (
            <tr key={bi.id} className="border-b border-slate-100 last:border-0">
              <td className="px-4 py-3 align-top">
                <p className="font-medium text-slate-900">
                  {bi.tenderItem.name}
                </p>
                {bi.tenderItem.materialCode ? (
                  <p className="text-xs text-slate-500 font-mono mt-1">
                    {bi.tenderItem.materialCode}
                  </p>
                ) : null}
              </td>
              <td className="px-4 py-3 text-right text-slate-600 align-top">
                {Number(bi.tenderItem.quantity).toLocaleString("tr-TR")}{" "}
                {bi.tenderItem.unit}
              </td>
              <td className="px-4 py-3 text-right tabular-nums align-top">
                {bi.unitPrice
                  ? `${bi.currency} ${formatNumber(bi.unitPrice)}`
                  : "—"}
              </td>
              <td className="px-4 py-3 text-right font-bold text-brand-900 tabular-nums align-top">
                {bi.totalPrice
                  ? formatPrice(bi.totalPrice, bi.currency as Currency)
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-success-50 border-t-2 border-success-300">
          <tr>
            <td
              colSpan={3}
              className="px-4 py-3 text-right font-bold text-success-900"
            >
              TOPLAM
            </td>
            <td className="px-4 py-3 text-right font-bold text-success-900 text-lg tabular-nums">
              {formatPrice(order.totalAmount, order.currency as Currency)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// avoid unused import warnings
void FileText;
