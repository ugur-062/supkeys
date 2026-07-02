"use client";

import { Badge } from "@/components/catalyst/badge";
import type { ListingDetail } from "@/hooks/use-company-listings";
import { formatDateTime } from "@/lib/tenders/date";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Trophy,
  XCircle,
} from "lucide-react";
import Link from "next/link";

type Tone = "success" | "info" | "warning" | "danger";

const TONE_CLASSES: Record<Tone, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  info: "border-blue-200 bg-blue-50 text-blue-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-rose-200 bg-rose-50 text-rose-800",
};
const TONE_ICON: Record<Tone, typeof Info> = {
  success: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
  danger: XCircle,
};

function StatusAlert({
  tone,
  title,
  children,
}: {
  tone: Tone;
  title: string;
  children?: React.ReactNode;
}) {
  const Icon = TONE_ICON[tone];
  return (
    <div
      className={cn("flex items-start gap-3 rounded-xl border p-4", TONE_CLASSES[tone])}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 text-sm">
        <p className="font-semibold">{title}</p>
        {children ? <div className="mt-1">{children}</div> : null}
      </div>
    </div>
  );
}

const BID_STATUS_BADGE: Record<string, { label: string; color: "zinc" | "amber" | "violet" | "emerald" | "rose" }> = {
  DRAFT: { label: "Taslak", color: "amber" },
  SUBMITTED: { label: "Gönderildi", color: "violet" },
  WON: { label: "Kazandın", color: "emerald" },
  AWARDED_PARTIAL: { label: "Kısmen Kazandın", color: "emerald" },
  LOST: { label: "Kaybettin", color: "rose" },
  WITHDRAWN: { label: "Geri Çekildi", color: "zinc" },
};

/** Teklif özeti kartı — statü / versiyon / toplam + kalem fiyatları + not. */
export function BidSummaryCard({ l }: { l: ListingDetail }) {
  const bid = l.myBid;
  if (!bid) return null;
  const symbol = bid.currency === "TRY" || !bid.currency ? "₺" : bid.currency;
  const itemName = new Map(
    (l.items ?? []).map((it) => [it.id, it] as const),
  );
  const badge = BID_STATUS_BADGE[bid.status] ?? BID_STATUS_BADGE.SUBMITTED;

  return (
    <div className="rounded-xl border border-zinc-950/10 bg-white p-5">
      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">
            Statü
          </p>
          <div className="mt-1">
            <Badge color={badge.color}>{badge.label}</Badge>
          </div>
        </div>
        {/* Versiyon yalnız güncellenmiş tekliflerde anlamlı (v1 gürültü). */}
        {(bid.version ?? 1) > 1 ? (
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">
              Versiyon
            </p>
            <p className="mt-1 font-mono text-sm font-semibold text-zinc-900">
              v{bid.version}
            </p>
          </div>
        ) : (
          <div />
        )}
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">
            Toplam
          </p>
          <p className="mt-1 text-sm font-bold text-zinc-950 tabular-nums">
            {Number(bid.amount).toLocaleString("tr-TR")} {symbol}
          </p>
        </div>
      </div>

      {bid.items && bid.items.length > 0 ? (
        <div className="mt-4 border-t border-zinc-100 pt-3">
          <p className="mb-2 text-xs font-medium text-zinc-500">
            Fiyatlandırılan Kalemler ({bid.items.length})
          </p>
          <ul className="space-y-1.5">
            {bid.items.map((bi) => {
              const item = itemName.get(bi.itemId);
              return (
                <li
                  key={bi.itemId}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="min-w-0 truncate text-zinc-700">
                    {item?.name ?? "Kalem"}
                    {item ? (
                      <span className="ml-1 text-xs text-zinc-400">
                        {Number(item.quantity)} {item.unit} ×{" "}
                        {Number(bi.unitPrice).toLocaleString("tr-TR")} {symbol}
                      </span>
                    ) : null}
                  </span>
                  {item ? (
                    <span className="shrink-0 font-medium text-zinc-900 tabular-nums">
                      {(
                        Number(bi.unitPrice) * Number(item.quantity)
                      ).toLocaleString("tr-TR")}{" "}
                      {symbol}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {bid.note ? (
        <div className="mt-4 border-t border-zinc-100 pt-3">
          <p className="mb-1 text-xs font-medium text-zinc-500">Genel Not</p>
          <p className="text-sm whitespace-pre-wrap text-zinc-700">{bid.note}</p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Teklifim durum makinesi — eski tedarikçi MyBidTab portu. İlan + teklif
 * durumuna göre bilgilendirme bandı üretir (kazandın / kısmen / elendin+gerekçe
 * / taslak / gönderildi / geri çekildi / kapandı). Özet kart ayrıca eklenir.
 */
export function MyBidStatusPanel({ l }: { l: ListingDetail }) {
  const bid = l.myBid;
  const open = l.status === "OPEN";
  // Kazanınca oluşan sipariş, teklifçinin kendi portalında listelenir:
  // ALIM ihalesinde teklifçi SATICI, SATIS ihalesinde ALICI'dır.
  const ordersHref =
    l.type === "SATIS"
      ? "/company/satinalma/siparisler"
      : "/company/satis/siparisler";

  if (!bid) {
    return open ? null : (
      <StatusAlert tone="info" title="Bu ihaleye teklif vermediniz." />
    );
  }

  const alerts: React.ReactNode[] = [];
  // İptal her sonucu ezer — iptalde teklifler LOST'a çekildiğinden "kazanamadın"
  // mesajı yanıltıcı olurdu.
  if (l.status === "CANCELLED") {
    alerts.push(
      <StatusAlert
        key="cancelled"
        tone="info"
        title="İhale ilan sahibi tarafından iptal edildi."
      >
        {l.cancelReason ? <p>Gerekçe: {l.cancelReason}</p> : null}
      </StatusAlert>,
    );
  } else if (bid.status === "WON") {
    alerts.push(
      <StatusAlert key="won" tone="success" title="Tebrikler! Teklifiniz kazandı 🏆">
        <p className="flex items-center gap-1.5">
          <Trophy className="h-4 w-4" aria-hidden="true" />
          Sipariş oluşturuldu —{" "}
          <Link href={ordersHref} className="font-semibold underline">
            Siparişlerimi Görüntüle
          </Link>
        </p>
      </StatusAlert>,
    );
  } else if (bid.status === "AWARDED_PARTIAL") {
    alerts.push(
      <StatusAlert key="part" tone="success" title="Bazı kalemleri kazandınız">
        <Link href={ordersHref} className="font-semibold underline">
          Siparişlerimi Görüntüle
        </Link>
      </StatusAlert>,
    );
  } else if (bid.status === "LOST" && open) {
    alerts.push(
      <StatusAlert key="lost-open" tone="warning" title="Teklifiniz bu turda elendi">
        {bid.eliminationReason ? (
          <p>
            <span className="font-medium">Gerekçe:</span> {bid.eliminationReason}
          </p>
        ) : null}
        <p className="mt-1">
          İhale hâlâ açık — teklifinizi güncelleyip yeniden verebilirsiniz.
        </p>
      </StatusAlert>,
    );
  } else if (bid.status === "LOST") {
    alerts.push(
      <StatusAlert key="lost" tone="info" title="İhale sonuçlandı — teklifiniz kazanamadı." />,
    );
  } else if (bid.status === "WITHDRAWN") {
    alerts.push(
      <StatusAlert key="wd" tone="info" title="Teklifinizi geri çektiniz.">
        {bid.updatedAt ? <p>{formatDateTime(bid.updatedAt)}</p> : null}
      </StatusAlert>,
    );
  } else if (bid.status === "DRAFT" && open) {
    alerts.push(
      <StatusAlert
        key="draft"
        tone="warning"
        title="Taslak teklifiniz var — kapanıştan önce göndermeyi unutmayın."
      />,
    );
  } else if (bid.status === "DRAFT") {
    alerts.push(
      <StatusAlert
        key="draft-late"
        tone="info"
        title="İhale kapandı — taslak teklifiniz gönderilmedi."
      />,
    );
  } else if (bid.status === "SUBMITTED" && !open) {
    alerts.push(
      <StatusAlert
        key="closed"
        tone="info"
        title="Teklif kabul aşaması sona erdi — sonuç açıklandığında bilgilendirileceksiniz."
      />,
    );
  } else if (bid.status === "SUBMITTED") {
    alerts.push(
      <StatusAlert key="ok" tone="success" title="Teklifiniz alındı.">
        {bid.submittedAt ? (
          <p>Verildi {formatDateTime(bid.submittedAt)}</p>
        ) : null}
      </StatusAlert>,
    );
  }

  return (
    <div className="space-y-4">
      {alerts}
      <BidSummaryCard l={l} />
    </div>
  );
}
