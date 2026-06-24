"use client";

/**
 * G5 madde 19/21 — Sipariş belge paneli.
 *
 * Hem tedarikçi (apps/web /supplier) hem alıcı (/dashboard) sipariş detayında
 * kullanılır. Kategoriler statüye göre kademeli görünür; yalnızca tedarikçi
 * yükler/siler, alıcı salt-okunur indirir.
 */
import { AttachmentList } from "@/components/attachments/attachment-list";
import { AttachmentUpload } from "@/components/attachments/attachment-upload";
import { useAttachments } from "@/hooks/use-attachments";
import type { AttachmentSurface } from "@/lib/attachments/types";
import {
  canUploadOrderDocs,
  visibleOrderDocCategories,
  type OrderDocCategory,
} from "@/lib/orders/order-documents";
import type { OrderStatus } from "@/lib/tenders/types";
import { AlertTriangle } from "lucide-react";

interface Props {
  surface: AttachmentSurface;
  orderId: string;
  status: OrderStatus;
  /** Madde 33 — nakit ödemeli sipariş; Teminat Mektubu kategorisini gösterir. */
  cashPayment?: boolean;
  /** Uluslararası sipariş → irsaliye yerine konşimento kategorisi gösterilir. */
  isInternational?: boolean;
}

export function OrderDocuments({
  surface,
  orderId,
  status,
  cashPayment,
  isInternational,
}: Props) {
  const categories = visibleOrderDocCategories(status, {
    cashPayment,
    isInternational,
  });
  const canUpload = surface === "supplier" && canUploadOrderDocs(status);

  if (categories.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Bu sipariş için henüz belge kategorisi açılmadı.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {categories.map((cat) => (
        <OrderDocCategoryBlock
          key={cat.scope}
          category={cat}
          surface={surface}
          orderId={orderId}
          status={status}
          canUpload={canUpload}
        />
      ))}
    </div>
  );
}

function OrderDocCategoryBlock({
  category,
  surface,
  orderId,
  status,
  canUpload,
}: {
  category: OrderDocCategory;
  surface: AttachmentSurface;
  orderId: string;
  status: OrderStatus;
  canUpload: boolean;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-zinc-900">{category.label}</h3>

      {canUpload ? (
        <AttachmentUpload
          surface={surface}
          scope={category.scope}
          scopeRefId={orderId}
          hint={category.hint}
        />
      ) : null}

      <AttachmentList
        surface={surface}
        scope={category.scope}
        scopeRefId={orderId}
        canDelete={canUpload}
        emptyText={category.emptyText}
      />

      {category.scope === "ORDER_DELIVERY" ||
      category.scope === "ORDER_BILL_OF_LADING" ? (
        <DeliveryDocsWarning
          surface={surface}
          orderId={orderId}
          status={status}
          scope={category.scope}
          label={category.label}
        />
      ) : null}
    </div>
  );
}

/**
 * Sipariş tamamlandığında teslim belgesi (yurtiçi: irsaliye / uluslararası:
 * konşimento) eksikse küçük uyarı. (Tamamlanmayı bloklamaz — bilgilendirir.)
 */
function DeliveryDocsWarning({
  surface,
  orderId,
  status,
  scope,
  label,
}: {
  surface: AttachmentSurface;
  orderId: string;
  status: OrderStatus;
  scope: "ORDER_DELIVERY" | "ORDER_BILL_OF_LADING";
  label: string;
}) {
  const { data, isLoading } = useAttachments(surface, scope, orderId);
  const isCompleted = status === "COMPLETED" || status === "DELIVERED";

  if (!isCompleted || isLoading) return null;
  if (data && data.length > 0) return null;

  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
      <span>{label} henüz yüklenmedi.</span>
    </div>
  );
}
