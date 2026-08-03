"use client";

import type { CompanyOrderDetail } from "@/hooks/use-company-orders";
import { sellerShipsGoods } from "@rothern/shared";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Landmark,
  Plus,
  ThumbsUp,
  Truck,
  XCircle,
} from "lucide-react";

type Event = {
  icon: typeof Plus;
  tone: string;
  title: string;
  at: string;
  actor: string;
  lines: string[];
};

function fmt(v: string | null) {
  if (!v) return "";
  try {
    return format(new Date(v), "d MMM yyyy HH:mm", { locale: tr });
  } catch {
    return v;
  }
}

/** Sipariş geçmişi — eski OrderTimeline ile aynı olaylar (yalnızca damgası olanlar). */
export function OrderTimeline({ order: o }: { order: CompanyOrderDetail }) {
  const sellerLabel = o.role === "seller" ? "Siz (satıcı)" : "Satıcı";
  const buyerLabel = o.role === "buyer" ? "Siz (alıcı)" : "Alıcı";

  const events: Event[] = [];
  events.push({
    icon: Plus,
    tone: "text-zinc-400",
    title: "Sipariş Oluşturuldu",
    at: fmt(o.createdAt),
    actor: "Sistem",
    lines: [],
  });
  if (o.acceptedAt) {
    const lines: string[] = [];
    if (o.expectedDeliveryDate)
      lines.push(`Tahmini teslim: ${fmt(o.expectedDeliveryDate)}`);
    // IBAN zaman çizelgesine YAZILMAZ (denetim §9) — hesap sahibi yeter;
    // tam IBAN "Ödeme & Fatura" kartında maskeli bileşenle gösterilir.
    if (o.bankAccountHolder || o.bankIban)
      lines.push(`Ödeme hesabı: ${o.bankAccountHolder ?? "belirlendi"}`);
    if (o.acceptedNote) lines.push(o.acceptedNote);
    events.push({
      icon: ThumbsUp,
      tone: "text-emerald-500",
      title: "Sipariş Onaylandı",
      at: fmt(o.acceptedAt),
      actor: sellerLabel,
      lines,
    });
  }
  if (o.rejectedAt) {
    events.push({
      icon: XCircle,
      tone: "text-red-500",
      title: "Sipariş Reddedildi",
      at: fmt(o.rejectedAt),
      actor: sellerLabel,
      lines: o.rejectedReason ? [`Sebep: ${o.rejectedReason}`] : [],
    });
  }
  // Revizyon müzakeresi kaldırıldı (2026-08-02) — timeline'da revizyon yok.
  // Akreditif adımları (yalnız LC siparişte doludur).
  if (o.lcOpenedAt) {
    events.push({
      icon: Landmark,
      tone: "text-zinc-400",
      title: "Akreditif Açıldı",
      at: fmt(o.lcOpenedAt),
      actor: buyerLabel,
      lines: [],
    });
  }
  if (o.lcAcceptedAt) {
    events.push({
      icon: Landmark,
      tone: "text-emerald-500",
      title: "Akreditif Kabul Edildi",
      at: fmt(o.lcAcceptedAt),
      actor: sellerLabel,
      lines: [],
    });
  }
  if (o.deliveryStartedAt) {
    const lines: string[] = [];
    if (o.invoiceNumber) lines.push(`Fatura no: ${o.invoiceNumber}`);
    if (o.deliveryNote) lines.push(o.deliveryNote);
    events.push({
      icon: Truck,
      tone: "text-emerald-500",
      title: sellerShipsGoods(o.deliveryTerm)
        ? "Sipariş Gönderildi"
        : "Teslime Hazırlandı",
      at: fmt(o.deliveryStartedAt),
      actor: sellerLabel,
      lines,
    });
  }
  if (o.deliveredAt) {
    events.push({
      icon: CheckCircle2,
      tone: "text-emerald-500",
      title: "Teslim Alındı",
      at: fmt(o.deliveredAt),
      actor: buyerLabel,
      lines: [],
    });
  }
  if (o.lcPaidAt) {
    events.push({
      icon: Landmark,
      tone: "text-emerald-500",
      title: "Akreditif Ödemesi Alındı",
      at: fmt(o.lcPaidAt),
      actor: sellerLabel,
      lines: [],
    });
  }
  if (o.completedAt) {
    events.push({
      icon: CheckCircle2,
      tone: "text-emerald-500",
      title: "Sipariş Tamamlandı",
      at: fmt(o.completedAt),
      actor: buyerLabel,
      lines: o.completedNote ? [o.completedNote] : [],
    });
  }
  // A1: satıcı iptal talebi (açık ya da ihtilafa dönüşmüş) + ihtilaf damgası.
  if (o.cancelRequestedAt) {
    events.push({
      icon: AlertTriangle,
      tone: "text-zinc-500",
      title: "Satıcı İptal Talep Etti",
      at: fmt(o.cancelRequestedAt),
      actor: sellerLabel,
      lines: o.cancelRequestReason ? [`Gerekçe: ${o.cancelRequestReason}`] : [],
    });
  }
  if (o.defectNotifiedAt) {
    // TTK 23 ayıp ihbarı (geri çekilirse alan temizlenir → damga da kalkar;
    // tam geçmiş audit_logs'ta).
    events.push({
      icon: AlertTriangle,
      tone: "text-amber-600",
      title: "Ayıp İhbarı (TTK 23)",
      at: fmt(o.defectNotifiedAt),
      actor: buyerLabel,
      lines: o.defectReason ? [`Gerekçe: ${o.defectReason}`] : [],
    });
  } else if (o.disputedAt) {
    events.push({
      icon: AlertTriangle,
      tone: "text-amber-600",
      title: "Sipariş İhtilaflı",
      at: fmt(o.disputedAt),
      actor: buyerLabel,
      lines: ["İptal talebi reddedildi — iki-yönlü çıkış açık."],
    });
  }
  if (o.cancelledAt) {
    events.push({
      icon: Ban,
      tone: "text-red-500",
      title: "Sipariş İptal Edildi",
      at: fmt(o.cancelledAt),
      actor: buyerLabel,
      lines: o.cancelReason ? [`Sebep: ${o.cancelReason}`] : [],
    });
  }

  return (
    <section className="rounded-2xl border border-zinc-950/10 bg-white p-5">
      <h2 className="mb-4 text-sm font-semibold text-zinc-900">
        Sipariş Geçmişi
      </h2>
      <ol className="space-y-4">
        {events.map((e, i) => {
          const Icon = e.icon;
          return (
            <li key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <Icon className={`h-5 w-5 ${e.tone}`} />
                {i < events.length - 1 ? (
                  <div className="mt-1 w-px flex-1 bg-zinc-200" />
                ) : null}
              </div>
              <div className="min-w-0 pb-1">
                <p className="text-sm font-medium text-zinc-900">{e.title}</p>
                <p className="text-xs text-zinc-400">
                  {e.at} · {e.actor}
                </p>
                {e.lines.map((l, j) => (
                  <p key={j} className="mt-0.5 text-xs text-zinc-600">
                    {l}
                  </p>
                ))}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
