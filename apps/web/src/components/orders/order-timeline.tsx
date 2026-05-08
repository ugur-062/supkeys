"use client";

import type { OrderDetail } from "@/lib/tenders/types";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  Ban,
  CheckCircle2,
  Plus,
  Truck,
  type LucideIcon,
} from "lucide-react";

interface TimelineEvent {
  Icon: LucideIcon;
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  actor?: string | null;
  timestamp: string;
  iconBg: string;
  iconText: string;
  borderClass: string;
}

function buildEvents(order: OrderDetail): TimelineEvent[] {
  const events: TimelineEvent[] = [
    {
      Icon: Plus,
      title: "Sipariş Oluşturuldu",
      subtitle: null,
      timestamp: order.createdAt,
      iconBg: "bg-slate-100",
      iconText: "text-slate-600",
      borderClass: "border-slate-200",
    },
  ];

  if (order.deliveryStartedAt) {
    events.push({
      Icon: Truck,
      title: "Teslimat Başlatıldı",
      subtitle: order.deliveryNote ?? null,
      meta: order.expectedDeliveryDate
        ? `Tahmini teslim: ${format(
            new Date(order.expectedDeliveryDate),
            "d MMM yyyy",
            { locale: tr },
          )}`
        : null,
      actor: order.deliveryStartedBy
        ? `${order.deliveryStartedBy.firstName} ${order.deliveryStartedBy.lastName}`
        : "Tedarikçi",
      timestamp: order.deliveryStartedAt,
      iconBg: "bg-blue-50",
      iconText: "text-blue-600",
      borderClass: "border-blue-200",
    });
  }

  if (order.completedAt) {
    events.push({
      Icon: CheckCircle2,
      title: "Teslim Alındı / Tamamlandı",
      subtitle: order.completedNote ?? null,
      actor: order.completedBy
        ? `${order.completedBy.firstName} ${order.completedBy.lastName}`
        : null,
      timestamp: order.completedAt,
      iconBg: "bg-success-50",
      iconText: "text-success-600",
      borderClass: "border-success-200",
    });
  }

  if (order.cancelledAt) {
    events.push({
      Icon: Ban,
      title: "Sipariş İptal Edildi",
      subtitle: order.cancelReason ?? null,
      actor: order.cancelledBy
        ? `${order.cancelledBy.firstName} ${order.cancelledBy.lastName}`
        : null,
      timestamp: order.cancelledAt,
      iconBg: "bg-danger-50",
      iconText: "text-danger-600",
      borderClass: "border-danger-200",
    });
  }

  return events;
}

export function OrderTimeline({ order }: { order: OrderDetail }) {
  const events = buildEvents(order);

  return (
    <div className="bg-white border border-surface-border rounded-xl p-5">
      <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-4">
        Sipariş Geçmişi
      </p>
      <ol className="space-y-4">
        {events.map((e, i) => (
          <li key={i} className="flex gap-3">
            <div
              className={cn(
                "h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 border",
                e.iconBg,
                e.borderClass,
              )}
            >
              <e.Icon className={cn("h-5 w-5", e.iconText)} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-brand-900">{e.title}</p>
              {e.subtitle ? (
                <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">
                  {e.subtitle}
                </p>
              ) : null}
              {e.meta ? (
                <p className="text-xs text-slate-500 mt-1">{e.meta}</p>
              ) : null}
              <p className="text-xs text-slate-400 mt-1">
                {format(new Date(e.timestamp), "d MMM yyyy HH:mm", {
                  locale: tr,
                })}
                {e.actor ? ` · ${e.actor}` : ""}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
