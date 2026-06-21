"use client";

import type { OrderDetail } from "@/lib/tenders/types";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  Ban,
  CheckCircle2,
  Landmark,
  Plus,
  ThumbsUp,
  Truck,
  XCircle,
  type LucideIcon,
} from "lucide-react";

interface TimelineEvent {
  Icon: LucideIcon;
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  extra?: React.ReactNode;
  actor?: string | null;
  timestamp: string;
  iconBg: string;
  iconText: string;
  borderClass: string;
}

function fmtDate(iso: string): string {
  return format(new Date(iso), "d MMM yyyy", { locale: tr });
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

  if (order.acceptedAt) {
    const bankBits: string[] = [];
    if (order.bankAccountHolder)
      bankBits.push(`Hesap: ${order.bankAccountHolder}`);
    if (order.bankIban) bankBits.push(`IBAN: ${order.bankIban}`);

    events.push({
      Icon: ThumbsUp,
      title: "Sipariş Onaylandı",
      subtitle: order.acceptedNote ?? null,
      meta: order.expectedDeliveryDate
        ? `Tahmini teslim: ${fmtDate(order.expectedDeliveryDate)}`
        : null,
      extra:
        bankBits.length > 0 ? (
          <div className="mt-2 space-y-1 text-xs text-slate-600">
            <p className="flex items-start gap-1.5">
              <Landmark className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-slate-400" />
              <span>{bankBits.join(" · ")}</span>
            </p>
          </div>
        ) : null,
      actor: "Tedarikçi",
      timestamp: order.acceptedAt,
      iconBg: "bg-zinc-100",
      iconText: "text-zinc-600",
      borderClass: "border-zinc-200",
    });
  }

  if (order.rejectedAt) {
    events.push({
      Icon: XCircle,
      title: "Sipariş Reddedildi",
      subtitle: order.rejectReason ?? null,
      actor: "Tedarikçi",
      timestamp: order.rejectedAt,
      iconBg: "bg-orange-50",
      iconText: "text-orange-600",
      borderClass: "border-orange-200",
    });
  }

  if (order.deliveryStartedAt) {
    events.push({
      Icon: Truck,
      title: "Sipariş Gönderildi",
      subtitle: order.deliveryNote ?? null,
      meta: order.expectedDeliveryDate
        ? `Tahmini teslim: ${fmtDate(order.expectedDeliveryDate)}`
        : null,
      extra: order.invoiceNumber ? (
        <p className="mt-2 text-xs text-slate-600">
          Fatura no:{" "}
          <span className="font-mono text-slate-800">
            {order.invoiceNumber}
          </span>
        </p>
      ) : null,
      actor: order.deliveryStartedBy
        ? `${order.deliveryStartedBy.firstName} ${order.deliveryStartedBy.lastName}`
        : "Tedarikçi",
      timestamp: order.deliveryStartedAt,
      iconBg: "bg-zinc-100",
      iconText: "text-zinc-600",
      borderClass: "border-zinc-200",
    });
  }

  if (order.completedAt) {
    events.push({
      Icon: CheckCircle2,
      title: "Sipariş Tamamlandı",
      subtitle: order.completedNote ?? null,
      actor: order.completedBy
        ? `${order.completedBy.firstName} ${order.completedBy.lastName}`
        : null,
      timestamp: order.completedAt,
      iconBg: "bg-success-600",
      iconText: "text-white",
      borderClass: "border-success-600",
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

/**
 * Yatay sipariş akışı — sipariş detayı altında tam genişlikte kullanılır.
 * Aynı olay verisini (buildEvents) yatay bir stepper olarak gösterir; her
 * ulaşılan adım kendi ikonu + tarih + (varsa) not/meta ile bir düğüm olur.
 */
export function OrderTimelineHorizontal({ order }: { order: OrderDetail }) {
  const events = buildEvents(order);

  return (
    <div className="bg-white ring-1 ring-zinc-950/5 rounded-2xl p-6">
      <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-5">
        Sipariş Akışı
      </p>
      <ol className="flex gap-2 overflow-x-auto pb-2">
        {events.map((e, i) => (
          <li key={i} className="flex-1 min-w-[170px]">
            {/* İkon + bağlayıcı çizgi */}
            <div className="flex items-center">
              <div
                className={cn(
                  "h-11 w-11 rounded-full flex items-center justify-center flex-shrink-0 border-2",
                  e.iconBg,
                  e.borderClass,
                )}
              >
                <e.Icon className={cn("h-5 w-5", e.iconText)} />
              </div>
              {i < events.length - 1 ? (
                <div className="h-0.5 flex-1 bg-slate-200 mx-2" />
              ) : null}
            </div>
            {/* İçerik */}
            <div className="mt-3 pr-3">
              <p className="font-semibold text-sm text-zinc-950 leading-tight">
                {e.title}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {format(new Date(e.timestamp), "d MMM yyyy HH:mm", {
                  locale: tr,
                })}
                {e.actor ? ` · ${e.actor}` : ""}
              </p>
              {e.subtitle ? (
                <p className="text-xs text-slate-600 mt-1.5 whitespace-pre-wrap line-clamp-3">
                  {e.subtitle}
                </p>
              ) : null}
              {e.meta ? (
                <p className="text-xs text-slate-500 mt-1">{e.meta}</p>
              ) : null}
              {e.extra ? e.extra : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function OrderTimeline({ order }: { order: OrderDetail }) {
  const events = buildEvents(order);

  return (
    <div className="bg-white ring-1 ring-zinc-950/5 rounded-xl p-5">
      <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-4">
        Sipariş Geçmişi
      </p>
      <ol className="space-y-4">
        {events.map((e, i) => (
          <li key={i} className="flex gap-3">
            <div
              className={cn(
                "h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 border",
                e.iconBg,
                e.borderClass,
              )}
            >
              <e.Icon className={cn("h-5 w-5", e.iconText)} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-zinc-950">{e.title}</p>
              {e.subtitle ? (
                <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">
                  {e.subtitle}
                </p>
              ) : null}
              {e.meta ? (
                <p className="text-xs text-slate-500 mt-1">{e.meta}</p>
              ) : null}
              {e.extra ? e.extra : null}
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
