import { CurrencyBadge } from "@/components/currency-badge";
import { SupplierOrderStatusBadge } from "@/components/supplier/status-badges";
import { formatPrice } from "@/lib/format-currency";
import type { Currency, OrderListItem } from "@/lib/tenders/types";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Building2, Check, Circle } from "lucide-react";
import Link from "next/link";

interface Props {
  order: OrderListItem;
}

const STAGE_LABELS: Array<{ key: string; label: string }> = [
  { key: "created", label: "Oluşturuldu" },
  { key: "accepted", label: "Onaylandı" },
  { key: "delivery", label: "Gönderildi" },
  { key: "completed", label: "Tamamlandı" },
];

function getStageState(status: string) {
  // Stage indices: 0=created, 1=accepted, 2=delivery, 3=completed
  if (status === "PENDING") return { active: 0, lastDone: 0 };
  if (status === "ACCEPTED") return { active: 1, lastDone: 1 };
  if (status === "IN_DELIVERY" || status === "IN_PROGRESS")
    return { active: 2, lastDone: 2 };
  if (status === "COMPLETED" || status === "DELIVERED")
    return { active: 3, lastDone: 3 };
  if (status === "REJECTED" || status === "CANCELLED")
    return { active: -1, lastDone: 0 };
  return { active: 0, lastDone: 0 };
}

export function OrderCard({ order }: Props) {
  const { active, lastDone } = getStageState(order.status);
  const isTerminated =
    order.status === "CANCELLED" || order.status === "REJECTED";

  return (
    <Link
      href={`/supplier/siparisler/${order.id}`}
      className="block group"
    >
      <div className="bg-white ring-1 ring-zinc-950/5 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-zinc-300 transition-all">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-slate-500 font-mono">
              {order.orderNumber}
            </p>
            <h3 className="font-semibold text-zinc-900 line-clamp-2 mt-0.5 leading-snug">
              {order.tender.title}
            </h3>
          </div>
          <SupplierOrderStatusBadge status={order.status} />
        </div>

        {/* Buyer + Total */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 text-sm text-slate-600 min-w-0">
            <Building2 className="h-4 w-4 text-slate-400 flex-shrink-0" />
            <span className="truncate">{order.tenant?.name ?? "—"}</span>
          </div>
          <p className="text-base font-bold text-emerald-600 font-mono tabular-nums whitespace-nowrap">
            {formatPrice(order.totalAmount, order.currency as Currency)}
          </p>
        </div>

        {/* Horizontal timeline preview (4 stage) */}
        {!isTerminated ? (
          <div className="flex items-center gap-1 mb-3">
            {STAGE_LABELS.map((stage, idx) => {
              const isDone = idx <= lastDone;
              const isActive = idx === active;
              return (
                <div
                  key={stage.key}
                  className="flex items-center flex-1 first:flex-initial"
                >
                  {idx > 0 ? (
                    <div
                      className={cn(
                        "flex-1 h-0.5 mx-1",
                        idx <= lastDone ? "bg-emerald-400" : "bg-slate-200",
                      )}
                    />
                  ) : null}
                  <div
                    className={cn(
                      "h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0",
                      isDone && !isActive
                        ? "bg-emerald-500 text-white"
                        : isActive
                          ? "bg-zinc-500 text-white ring-4 ring-zinc-100"
                          : "bg-slate-100 text-slate-400",
                    )}
                    title={stage.label}
                  >
                    {isDone && !isActive ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Circle className="h-2 w-2 fill-current" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {/* Footer durum mesajı */}
        <div className="text-xs text-slate-500 flex items-center justify-between">
          <span>
            {order.status === "PENDING" && "Onayınız bekleniyor"}
            {order.status === "ACCEPTED" && "Gönderim hazırlığında"}
            {order.status === "IN_DELIVERY" && "Gönderildi"}
            {order.status === "COMPLETED" && "Sipariş tamamlandı"}
            {order.status === "REJECTED" && "Sipariş reddedildi"}
            {order.status === "CANCELLED" && "Sipariş iptal edildi"}
            {order.status === "IN_PROGRESS" && "Üretimde"}
            {order.status === "DELIVERED" && "Teslim edildi"}
          </span>
          <span className="flex items-center gap-1">
            <CurrencyBadge currency={order.currency as Currency} codeOnly />
            <span>•</span>
            <span>
              {format(new Date(order.createdAt), "d MMM", { locale: tr })}
            </span>
          </span>
        </div>
      </div>
    </Link>
  );
}
