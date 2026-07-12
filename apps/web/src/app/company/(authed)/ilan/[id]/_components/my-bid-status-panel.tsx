"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { Select } from "@/components/catalyst/select";
import {
  useExtendBidValidity,
  type ListingDetail,
} from "@/hooks/use-company-listings";
import { extractErrorMessage } from "@/lib/tenders/error";
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
import { useState } from "react";
import { toast } from "sonner";

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

/** Teklif özeti kartı — statü / versiyon / toplam + geçerlilik + kalemler + not. */
export function BidSummaryCard({ l }: { l: ListingDetail }) {
  const bid = l.myBid;
  const extend = useExtendBidValidity(l.id);
  const [extendDays, setExtendDays] = useState("30");
  if (!bid) return null;
  const symbol = bid.currency === "TRY" || !bid.currency ? "₺" : bid.currency;
  const itemName = new Map(
    (l.items ?? []).map((it) => [it.id, it] as const),
  );
  const badge = BID_STATUS_BADGE[bid.status] ?? BID_STATUS_BADGE.SUBMITTED;

  // Geçerlilik: son gün = submittedAt + validityDays. Süresi dolan teklif
  // fiyat değişmeden uzatılabilir; taşımada taslağa düşmüşse uzatma onu
  // aynı fiyatla yeniden canlıya döndürür.
  const validUntil =
    bid.submittedAt && bid.validityDays
      ? new Date(
          new Date(bid.submittedAt).getTime() +
            bid.validityDays * 86_400_000,
        )
      : null;
  const validityExpired =
    validUntil != null && validUntil.getTime() < Date.now();
  const canExtend =
    l.status === "OPEN" &&
    validUntil != null &&
    (bid.status === "SUBMITTED" || bid.status === "DRAFT");

  const handleExtend = async () => {
    try {
      const res = await extend.mutateAsync(Number(extendDays));
      toast.success(
        res.revived
          ? "Geçerlilik uzatıldı — teklifiniz aynı fiyatla yeniden aktif"
          : `Geçerlilik uzatıldı — ${formatDateTime(res.validUntil)} tarihine kadar`,
      );
    } catch (err) {
      toast.error(extractErrorMessage(err, "Geçerlilik uzatılamadı"));
    }
  };

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

      {validUntil ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-3">
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">
              Geçerlilik
            </p>
            <p
              className={cn(
                "mt-1 text-sm font-medium",
                validityExpired ? "text-rose-600" : "text-zinc-900",
              )}
            >
              {validUntil.toLocaleDateString("tr-TR")} tarihine kadar
              {validityExpired ? " — süresi doldu" : ""}
            </p>
          </div>
          {canExtend ? (
            <div className="flex items-center gap-2">
              <Select
                aria-label="Uzatma süresi"
                value={extendDays}
                onChange={(e) => setExtendDays(e.target.value)}
                className="max-w-32"
              >
                <option value="15">15 gün</option>
                <option value="30">30 gün</option>
                <option value="60">60 gün</option>
                <option value="90">90 gün</option>
              </Select>
              <Button
                outline
                disabled={extend.isPending}
                onClick={handleExtend}
              >
                Geçerliliği Uzat
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

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
  } else if (bid.status === "DRAFT" && open && bid.submittedAt) {
    // Daha önce GÖNDERİLMİŞ ama taşımada taslağa düşmüş teklif (geçerlilik
    // dolumu ya da LAZY taşıma) — kullanıcı iki seçeneğini de bilsin.
    alerts.push(
      <StatusAlert
        key="draft-carried"
        tone="warning"
        title="Önceki teklifiniz bu tura taslak olarak taşındı"
      >
        <p>
          Devam etmek için yeni fiyat verin ya da aşağıdan önceki teklifinizin
          geçerlilik süresini uzatın — uzatınca aynı fiyatla yeniden aktif olur.
        </p>
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
  } else if (
    bid.status === "SUBMITTED" &&
    (l.status === "IN_AWARD" || l.status === "IN_AWARD_APPROVAL")
  ) {
    // Alıcının BİLİNÇLİ "Değerlendirmeye Al" sinyali — nötr kapanıştan farklı.
    alerts.push(
      <StatusAlert
        key="evaluating"
        tone="info"
        title="Teklifiniz değerlendiriliyor"
      >
        <p>
          {l.type === "SATIS" ? "Satıcı" : "Alıcı"} teklifleri değerlendirmeye
          aldı — sonuç açıklandığında bilgilendirileceksiniz.
        </p>
      </StatusAlert>,
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
