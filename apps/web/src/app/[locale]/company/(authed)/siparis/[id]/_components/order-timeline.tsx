"use client";

import { useTranslations } from "next-intl";
import { formatDate } from "@/lib/format-date";
import type { CompanyOrderDetail } from "@/hooks/use-company-orders";
import { sellerShipsGoods } from "@rothern/shared";
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
    return formatDate(v, "datetime");
  } catch {
    return v;
  }
}

/** Sipariş geçmişi — eski OrderTimeline ile aynı olaylar (yalnızca damgası olanlar). */
export function OrderTimeline({ order: o }: { order: CompanyOrderDetail }) {
  const t = useTranslations("web.panel.trade.orderTimeline");
  const sellerLabel = o.role === "seller" ? t("sizSatici") : t("satici");
  const buyerLabel = o.role === "buyer" ? t("sizAlici") : t("alici");

  const events: Event[] = [];
  events.push({
    icon: Plus,
    tone: "text-zinc-400",
    title: t("siparisOlusturuldu"),
    at: fmt(o.createdAt),
    actor: t("sistem"),
    lines: [],
  });
  if (o.acceptedAt) {
    const lines: string[] = [];
    if (o.expectedDeliveryDate)
      lines.push(t("tahminiTeslim", { date: fmt(o.expectedDeliveryDate) }));
    // IBAN zaman çizelgesine YAZILMAZ (denetim §9) — hesap sahibi yeter;
    // tam IBAN "Ödeme & Fatura" kartında maskeli bileşenle gösterilir.
    if (o.bankAccountHolder || o.bankIban)
      lines.push(
        t("odemeHesabi", { holder: o.bankAccountHolder ?? t("belirlendi") }),
      );
    if (o.acceptedNote) lines.push(o.acceptedNote);
    events.push({
      icon: ThumbsUp,
      tone: "text-emerald-500",
      title: t("siparisOnaylandi"),
      at: fmt(o.acceptedAt),
      actor: sellerLabel,
      lines,
    });
  }
  if (o.rejectedAt) {
    events.push({
      icon: XCircle,
      tone: "text-red-500",
      title: t("siparisReddedildi"),
      at: fmt(o.rejectedAt),
      actor: sellerLabel,
      lines: o.rejectedReason ? [t("sebep", { reason: o.rejectedReason })] : [],
    });
  }
  // Revizyon müzakeresi kaldırıldı (2026-08-02) — timeline'da revizyon yok.
  // Akreditif adımları (yalnız LC siparişte doludur).
  if (o.lcOpenedAt) {
    events.push({
      icon: Landmark,
      tone: "text-zinc-400",
      title: t("akreditifAcildi"),
      at: fmt(o.lcOpenedAt),
      actor: buyerLabel,
      lines: [],
    });
  }
  if (o.lcAcceptedAt) {
    events.push({
      icon: Landmark,
      tone: "text-emerald-500",
      title: t("akreditifKabulEdildi"),
      at: fmt(o.lcAcceptedAt),
      actor: sellerLabel,
      lines: [],
    });
  }
  if (o.deliveryStartedAt) {
    const lines: string[] = [];
    if (o.invoiceNumber)
      lines.push(t("faturaNo", { invoiceNumber: o.invoiceNumber }));
    if (o.deliveryNote) lines.push(o.deliveryNote);
    events.push({
      icon: Truck,
      tone: "text-emerald-500",
      title: sellerShipsGoods(o.deliveryTerm)
        ? t("siparisGonderildi")
        : t("teslimeHazirlandi"),
      at: fmt(o.deliveryStartedAt),
      actor: sellerLabel,
      lines,
    });
  }
  if (o.deliveredAt) {
    events.push({
      icon: CheckCircle2,
      tone: "text-emerald-500",
      title: t("teslimAlindi"),
      at: fmt(o.deliveredAt),
      actor: buyerLabel,
      lines: [],
    });
  }
  if (o.lcPaidAt) {
    events.push({
      icon: Landmark,
      tone: "text-emerald-500",
      title: t("akreditifOdemesiAlindi"),
      at: fmt(o.lcPaidAt),
      actor: sellerLabel,
      lines: [],
    });
  }
  if (o.completedAt) {
    events.push({
      icon: CheckCircle2,
      tone: "text-emerald-500",
      title: t("siparisTamamlandi"),
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
      title: t("saticiIptalTalepEtti"),
      at: fmt(o.cancelRequestedAt),
      actor: sellerLabel,
      lines: o.cancelRequestReason ? [t("gerekce", { cancelRequestReason: o.cancelRequestReason })] : [],
    });
  }
  if (o.defectNotifiedAt) {
    // TTK 23 ayıp ihbarı (geri çekilirse alan temizlenir → damga da kalkar;
    // tam geçmiş audit_logs'ta).
    events.push({
      icon: AlertTriangle,
      tone: "text-amber-600",
      title: t("ayipIhbariTtk23"),
      at: fmt(o.defectNotifiedAt),
      actor: buyerLabel,
      lines: o.defectReason ? [t("gerekce2", { defectReason: o.defectReason })] : [],
    });
  } else if (o.disputedAt) {
    events.push({
      icon: AlertTriangle,
      tone: "text-amber-600",
      title: t("siparisIhtilafli"),
      at: fmt(o.disputedAt),
      actor: buyerLabel,
      lines: [t("iptalTalebiReddedildiIkiYonlu")],
    });
  }
  if (o.cancelledAt) {
    events.push({
      icon: Ban,
      tone: "text-red-500",
      title: t("siparisIptalEdildi"),
      at: fmt(o.cancelledAt),
      actor: buyerLabel,
      lines: o.cancelReason ? [t("sebep", { reason: o.cancelReason })] : [],
    });
  }

  return (
    <section className="card p-5">
      <h2 className="mb-4 text-sm font-semibold text-zinc-900">
        {t("siparisGecmisi")}
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
